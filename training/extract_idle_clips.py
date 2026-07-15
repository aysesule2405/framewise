#!/usr/bin/env python3
"""
Extract idle (neutral standing) clips from existing dance tutorial videos.

Uses MediaPipe Pose to compute per-frame landmark velocity. Segments where
the mean landmark displacement stays below a threshold for ≥1.5 s are
classified as idle and clipped to 2.5-second mp4 files.

Usage:
    source .venv/bin/activate
    python extract_idle_clips.py [--threshold 0.015] [--max-clips 50]
"""

import argparse
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

import cv2
import mediapipe as mp
import numpy as np
from tqdm import tqdm

# Upper-body landmark indices (0–24) — ignores noisy hand/finger points.
UPPER_BODY = list(range(25))


@dataclass
class Segment:
    start_sec: float
    end_sec: float

    @property
    def duration(self) -> float:
        return self.end_sec - self.start_sec


def landmark_positions(results) -> Optional[np.ndarray]:
    """Return (25, 2) array of normalized x,y for upper-body landmarks, or None."""
    if not results.pose_landmarks:
        return None
    lm = results.pose_landmarks.landmark
    return np.array([[lm[i].x, lm[i].y] for i in UPPER_BODY], dtype=np.float32)


def find_idle_segments(
    video_path: str,
    motion_threshold: float,
    min_idle_sec: float = 1.5,
    frame_skip: int = 2,
    smooth_window: int = 7,
) -> List[Segment]:
    """
    Detect idle segments in video_path.
    frame_skip=2 processes every other frame (≈15 fps for 30 fps source).
    """
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    effective_fps = fps / frame_skip

    pose = mp.solutions.pose.Pose(
        static_image_mode=False,
        model_complexity=1,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    times: List[float] = []
    scores: List[float] = []
    prev_pts: Optional[np.ndarray] = None
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if frame_idx % frame_skip == 0:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = pose.process(rgb)
            curr_pts = landmark_positions(results)

            if curr_pts is not None and prev_pts is not None:
                score = float(np.mean(np.linalg.norm(curr_pts - prev_pts, axis=1)))
            else:
                score = 1.0  # no detection → treat as motion

            times.append(frame_idx / fps)
            scores.append(score)
            prev_pts = curr_pts
        frame_idx += 1

    cap.release()
    pose.close()

    if not times:
        return []

    # Smooth motion signal with a centered moving average.
    hw = smooth_window // 2
    smoothed = [
        float(np.mean(scores[max(0, i - hw): i + hw + 1]))
        for i in range(len(scores))
    ]

    # Threshold to find idle frames, then group into segments.
    is_idle = [s <= motion_threshold for s in smoothed]
    min_frames = int(min_idle_sec * effective_fps)

    segments: List[Segment] = []
    start_idx: Optional[int] = None

    for i, idle in enumerate(is_idle):
        if idle and start_idx is None:
            start_idx = i
        elif not idle and start_idx is not None:
            if (i - start_idx) >= min_frames:
                segments.append(Segment(times[start_idx], times[i - 1]))
            start_idx = None

    if start_idx is not None and (len(times) - start_idx) >= min_frames:
        segments.append(Segment(times[start_idx], times[-1]))

    return segments


def cut_clip(src: str, start: float, duration: float, dst: str) -> bool:
    """Extract a clip from src at start±duration using ffmpeg."""
    cmd = [
        "ffmpeg", "-y",
        "-ss", f"{start:.3f}",
        "-i", src,
        "-t", f"{duration:.3f}",
        "-c:v", "libx264", "-crf", "23", "-preset", "fast",
        "-c:a", "aac",
        "-loglevel", "error",
        dst,
    ]
    return subprocess.run(cmd, capture_output=True).returncode == 0


def process_video(
    video_path: Path,
    output_dir: Path,
    motion_threshold: float,
    clip_duration: float = 2.5,
    min_gap_sec: float = 5.0,
    max_clips_per_video: int = 4,
) -> int:
    """Detect idle segments in video_path and write clips to output_dir."""
    segments = find_idle_segments(str(video_path), motion_threshold)
    if not segments:
        return 0

    stem = video_path.stem[:50].replace("/", "_")
    n = 0
    last_clip_end = -min_gap_sec

    for seg in segments:
        if seg.start_sec - last_clip_end < min_gap_sec:
            continue

        # Place clip in the middle of the idle segment.
        if seg.duration >= clip_duration:
            clip_start = seg.start_sec + (seg.duration - clip_duration) / 2
        else:
            clip_start = seg.start_sec

        out_path = output_dir / f"{stem}_idle_{n:02d}.mp4"
        if cut_clip(str(video_path), clip_start, clip_duration, str(out_path)):
            n += 1
            last_clip_end = clip_start + clip_duration

        if n >= max_clips_per_video:
            break

    return n


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--threshold", type=float, default=0.015,
        help="Mean landmark displacement threshold for idle detection (default: 0.015)",
    )
    parser.add_argument(
        "--max-clips", type=int, default=60,
        help="Stop after this many idle clips total (default: 60)",
    )
    parser.add_argument(
        "--clip-duration", type=float, default=2.5,
        help="Duration in seconds of each extracted clip (default: 2.5)",
    )
    parser.add_argument(
        "--sources", nargs="+",
        default=["moonwalk", "body_roll", "body_wave", "arm_wave"],
        help="Source class folders to scan (default: moonwalk body_roll body_wave arm_wave)",
    )
    args = parser.parse_args()

    base = Path(__file__).parent / "data" / "raw_videos"
    output_dir = base / "idle"
    output_dir.mkdir(exist_ok=True)

    # Collect source videos.
    source_videos: List[Path] = []
    for cls in args.sources:
        cls_dir = base / cls
        if not cls_dir.exists():
            print(f"  Warning: {cls_dir} not found, skipping.")
            continue
        vids = sorted(cls_dir.glob("*.mp4"))
        print(f"  {cls:20s} {len(vids)} videos")
        source_videos.extend(vids)

    print(f"\n{len(source_videos)} source videos  →  idle clips target: {args.max_clips}")
    print(f"Output: {output_dir}\n")

    total = 0
    for video_path in tqdm(source_videos, unit="video"):
        if total >= args.max_clips:
            break

        n = process_video(
            video_path,
            output_dir,
            motion_threshold=args.threshold,
            clip_duration=args.clip_duration,
            max_clips_per_video=min(4, args.max_clips - total),
        )
        total += n
        if n:
            tqdm.write(f"  {video_path.parent.name}/{video_path.name[:55]}  → {n} clip(s)  (total {total})")

    existing = len(list(output_dir.glob("*.mp4")))
    print(f"\nDone. New clips extracted this run: {total}")
    print(f"Total in idle/: {existing}")


if __name__ == "__main__":
    main()
