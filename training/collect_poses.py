"""
Extracts MediaPipe BlazePose keypoints from labeled dance videos.

Usage:
  python collect_poses.py --label moonwalk --video path/to/video.mp4
  python collect_poses.py --label moonwalk --dir path/to/moonwalk_clips/
  python collect_poses.py --label freestyle --dir data/raw_videos/freestyle/

Output:
  data/poses/<label>.csv  — one row per frame:
    label, frame_idx, time_sec, lm0_x, lm0_y, lm0_z, lm0_vis, lm1_x, ...

Requirements:
  pip install mediapipe opencv-python tqdm
"""

import argparse
import csv
import os
import sys
from pathlib import Path

import cv2
import mediapipe as mp
from tqdm import tqdm

mp_pose = mp.solutions.pose

POSE_CSV_HEADER = (
    ["label", "frame_idx", "time_sec"]
    + [f"lm{i}_{axis}" for i in range(33) for axis in ("x", "y", "z", "vis")]
)


def extract_poses(video_path: str, label: str, output_csv: str, *, start_sec=0, end_sec=None, min_confidence=0.5):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"  [skip] Cannot open {video_path}", file=sys.stderr)
        return 0

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    start_frame = int(start_sec * fps)
    end_frame = int(end_sec * fps) if end_sec else total_frames

    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

    write_header = not os.path.exists(output_csv)
    rows_written = 0

    with (
        open(output_csv, "a", newline="") as f,
        mp_pose.Pose(model_complexity=2, smooth_landmarks=True, min_detection_confidence=min_confidence) as pose,
    ):
        writer = csv.writer(f)
        if write_header:
            writer.writerow(POSE_CSV_HEADER)

        frame_idx = start_frame
        pbar = tqdm(total=end_frame - start_frame, desc=f"  {Path(video_path).name}", leave=False)

        while frame_idx < end_frame:
            ret, frame = cap.read()
            if not ret:
                break

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = pose.process(rgb)

            if result.pose_world_landmarks:
                lms = result.pose_world_landmarks.landmark
                row = [label, frame_idx, frame_idx / fps]
                for lm in lms:
                    row += [lm.x, lm.y, lm.z, lm.visibility]
                writer.writerow(row)
                rows_written += 1

            frame_idx += 1
            pbar.update(1)

        pbar.close()

    cap.release()
    return rows_written


def main():
    parser = argparse.ArgumentParser(description="Extract BlazePose keypoints from dance videos")
    parser.add_argument("--label", required=True, help="Dance move label (e.g. moonwalk)")
    parser.add_argument("--video", help="Single video file path")
    parser.add_argument("--dir", help="Directory of video files")
    parser.add_argument("--start", type=float, default=0, help="Start time in seconds (single video only)")
    parser.add_argument("--end", type=float, default=None, help="End time in seconds (single video only)")
    parser.add_argument("--out", default="data/poses", help="Output directory for CSV files")
    parser.add_argument("--min_confidence", type=float, default=0.5, help="MediaPipe min detection confidence (default: 0.5)")
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)
    output_csv = os.path.join(args.out, f"{args.label}.csv")

    VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}
    videos = []

    if args.video:
        videos = [(args.video, args.start, args.end)]
    elif args.dir:
        for f in sorted(Path(args.dir).iterdir()):
            if f.suffix.lower() in VIDEO_EXTS:
                videos.append((str(f), 0, None))
    else:
        parser.error("Provide --video or --dir")

    total = 0
    print(f"Label: {args.label}  →  {output_csv}")
    for video_path, start, end in videos:
        n = extract_poses(video_path, args.label, output_csv, start_sec=start, end_sec=end, min_confidence=args.min_confidence)
        print(f"  {Path(video_path).name}: {n} frames")
        total += n

    print(f"\nTotal frames written: {total}")
    print(f"Output: {output_csv}")


if __name__ == "__main__":
    main()
