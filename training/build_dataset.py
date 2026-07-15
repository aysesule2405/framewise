"""
Reads all per-label CSVs from data/poses/, applies feature engineering,
builds windowed (X, y) arrays, and saves them as NumPy .npz files.

Usage:
  python build_dataset.py
  python build_dataset.py --window 30 --step 5 --out data/dataset.npz

Requirements:
  pip install numpy pandas scikit-learn tqdm
"""

import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from tqdm import tqdm

TRIPLETS = [
    (13, 11, 15), (14, 12, 16),
    (11, 13, 23), (12, 14, 24),
    (25, 23, 27), (26, 24, 28),
    (23, 25, 29), (24, 26, 30),
    (11, 23, 25), (12, 24, 26),
    (0,  11, 12), (23, 24, 11),
]

POSITION_IDX = [0, 15, 16, 27, 28, 29, 30, 31, 32]


def angle3(a, b, c):
    ba = a - b
    bc = c - b
    dot = np.dot(ba, bc)
    mag = np.linalg.norm(ba) * np.linalg.norm(bc)
    return float(np.arccos(np.clip(dot / mag, -1, 1))) if mag > 0 else 0.0


def extract_features(kp):
    """kp: (33, 3) array of (x, y, z) in world space (already metric/normalised by MediaPipe)."""
    lh, rh = kp[23], kp[24]
    ls, rs = kp[11], kp[12]
    hip_mid = (lh + rh) / 2
    shoulder_mid = (ls + rs) / 2
    torso = np.linalg.norm(shoulder_mid - hip_mid) or 1.0

    n = (kp - hip_mid) / torso

    angles = [angle3(n[a], n[v], n[c]) for v, a, c in TRIPLETS]
    symmetry = [
        abs(angles[0] - angles[1]),
        abs(angles[4] - angles[5]),
        abs(angles[6] - angles[7]),
        abs(angles[8] - angles[9]),
    ]
    positions = n[POSITION_IDX, :2].flatten().tolist()
    spine_lean = float(np.arctan2(
        shoulder_mid[0] - hip_mid[0],
        shoulder_mid[1] - hip_mid[1]
    ))
    return angles + symmetry + positions + [spine_lean]  # 35 features


def load_label_csv(csv_path: str, label_idx: int, window: int, step: int):
    """Returns (segments_X, segments_y): one entry per source video, each a list of windows."""
    df = pd.read_csv(csv_path)
    xyz_cols = [f"lm{i}_{axis}" for i in range(33) for axis in ("x", "y", "z")]
    if not all(c in df.columns for c in xyz_cols[:3]):
        print(f"  [skip] missing columns in {csv_path}", file=sys.stderr)
        return [], []

    # Detect video boundaries: frame_idx resets to a lower value when a new video starts.
    fidx = df["frame_idx"].values if "frame_idx" in df.columns else np.arange(len(df))
    boundaries = [0]
    for i in range(1, len(fidx)):
        if fidx[i] < fidx[i - 1]:
            boundaries.append(i)
    boundaries.append(len(df))

    segments_X = []

    for b in range(len(boundaries) - 1):
        seg_df = df.iloc[boundaries[b]:boundaries[b + 1]]
        frames_feat = []
        prev_features = None

        for _, row in seg_df.iterrows():
            kp = np.array([[row[f"lm{i}_{a}"] for a in ("x", "y", "z")] for i in range(33)])
            feat = extract_features(kp)
            vel = [f - p for f, p in zip(feat, prev_features)] if prev_features else [0.0] * len(feat)
            prev_features = feat
            frames_feat.append(feat + vel)

        wins = [frames_feat[s:s + window] for s in range(0, len(frames_feat) - window + 1, step)]
        if wins:
            segments_X.append(wins)

    return segments_X, [label_idx] * len(segments_X)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--poses_dir", default="data/poses")
    parser.add_argument("--labels", default="labels.json")
    parser.add_argument("--window", type=int, default=30)
    parser.add_argument("--step",   type=int, default=5)
    parser.add_argument("--out",    default="data/dataset.npz")
    parser.add_argument("--val_split", type=float, default=0.15)
    parser.add_argument("--test_split", type=float, default=0.10)
    args = parser.parse_args()

    with open(args.labels) as f:
        label_defs = json.load(f)["labels"]

    label_index = {d["slug"]: d["index"] for d in label_defs}

    all_seg_X = []  # list of per-video window lists
    all_seg_y = []  # one label per video segment
    poses_dir = Path(args.poses_dir)

    for csv_path in sorted(poses_dir.glob("*.csv")):
        slug = csv_path.stem
        if slug not in label_index:
            print(f"  [skip] unknown label: {slug}")
            continue
        seg_X, seg_y = load_label_csv(str(csv_path), label_index[slug], args.window, args.step)
        n_windows = sum(len(s) for s in seg_X)
        print(f"  {slug}: {len(seg_X)} videos, {n_windows} windows")
        all_seg_X.extend(seg_X)
        all_seg_y.extend(seg_y)

    if not all_seg_X:
        sys.exit("No data found. Run collect_poses.py first.")

    seg_indices = list(range(len(all_seg_X)))
    seg_y_arr = np.array(all_seg_y, dtype=np.int32)

    # Split by video segment so no video's frames appear in more than one split.
    train_idx, tmp_idx = train_test_split(
        seg_indices, test_size=(args.val_split + args.test_split),
        stratify=seg_y_arr, random_state=42,
    )
    val_ratio = args.val_split / (args.val_split + args.test_split)
    val_idx, test_idx = train_test_split(
        tmp_idx, test_size=(1 - val_ratio),
        stratify=seg_y_arr[tmp_idx], random_state=42,
    )

    def flatten(indices):
        X_out, y_out = [], []
        for i in indices:
            lbl = all_seg_y[i]
            for win in all_seg_X[i]:
                X_out.append(win)
                y_out.append(lbl)
        return (np.array(X_out, dtype=np.float32),
                np.array(y_out, dtype=np.int32))

    X_train, y_train = flatten(train_idx)
    X_val,   y_val   = flatten(val_idx)
    X_test,  y_test  = flatten(test_idx)

    print(f"\nVideos  — Train: {len(train_idx)}  Val: {len(val_idx)}  Test: {len(test_idx)}")
    print(f"Windows — Train: {len(X_train)}  Val: {len(X_val)}  Test: {len(X_test)}")
    np.savez_compressed(args.out, X_train=X_train, y_train=y_train,
                        X_val=X_val, y_val=y_val, X_test=X_test, y_test=y_test)
    print(f"Saved: {args.out}")


if __name__ == "__main__":
    main()
