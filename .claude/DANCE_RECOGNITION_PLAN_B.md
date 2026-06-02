# Plan B — Dance Move Recognition: ML Pipeline

**Goal:** Real-time, named dance move classification in the browser using a trained ML model.  
**Approach:** BlazePose keypoints → feature extraction → BiLSTM/Transformer classifier → TF.js inference  
**Timeline:** ~13 weeks from start to production  
**Parallel with:** Plan A (Gemini prompt-based identification, already shipped) — Plan B replaces/augments Plan A for moves it can confidently classify

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BROWSER (Extension / Web App)                │
│                                                                     │
│  Video Frame  ──►  BlazePose HEAVY  ──►  33 Keypoints (x,y,z,vis)  │
│                        (TF.js)                                      │
│                           │                                         │
│                    Feature Extractor                                │
│                  (joint angles, velocities,                         │
│                   symmetry, center of mass)                         │
│                           │                                         │
│                   30-frame sliding window                           │
│                           │                                         │
│                    TF.js Classifier                                 │
│               (BiLSTM or Transformer, ~2MB)                         │
│                           │                                         │
│              { moveName, confidence, category }                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     PYTHON TRAINING PIPELINE (offline)              │
│                                                                     │
│  Video Dataset  ──►  MediaPipe Python  ──►  Pose CSVs              │
│                           │                                         │
│                   Feature Engineering                               │
│                           │                                         │
│               BiLSTM / Transformer Training                         │
│                    (PyTorch / Keras)                                 │
│                           │                                         │
│                   TF.js Export + Quantize                           │
│              (model.json + shards, ~1.5-3MB)                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Tool | Notes |
|---|---|---|
| Pose estimation (browser) | `@tensorflow-models/pose-detection` BlazePose HEAVY | 33 pts incl. heels, toes, fingertips |
| Pose estimation (training) | MediaPipe Python | Matches BlazePose landmark ordering |
| Feature extraction | Custom JS + Python | Joint angles, velocities, symmetry scores |
| Classifier | Keras BiLSTM → TF.js | ~2MB after int8 quantization |
| Alt classifier | PyTorch Transformer → ONNX → TF.js | More accurate, harder to export |
| Training infra | Colab Pro / local GPU (PyTorch or Keras) | |
| Model serving | Bundled with extension (no inference server) | |
| Move database | MongoDB `DanceMoves` collection + JSON file | |

---

## Phase 1 — BlazePose Upgrade (Week 1)

**Current state:** MoveNet Lightning (17 keypoints) used nowhere in production — only Gemini video analysis.  
**Change:** Integrate BlazePose HEAVY (33 keypoints) for frame-by-frame pose overlay in the extension panel and web app practice view.

### 1.1 Install

```bash
cd extension
npm install @tensorflow/tfjs @tensorflow-models/pose-detection
```

### 1.2 BlazePose wrapper (`extension/src/lib/poseDetector.js`)

```js
import * as poseDetection from "@tensorflow-models/pose-detection";
import * as tf from "@tensorflow/tfjs";

let detector = null;

export async function initPoseDetector() {
  if (detector) return detector;
  const model = poseDetection.SupportedModels.BlazePose;
  detector = await poseDetection.createDetector(model, {
    runtime: "tfjs",
    modelType: "heavy",        // 33 keypoints, highest accuracy
    enableSmoothing: true,
    enableSegmentation: false, // saves ~30% compute
  });
  return detector;
}

export async function detectPose(videoElement) {
  if (!detector) await initPoseDetector();
  const poses = await detector.estimatePoses(videoElement);
  return poses[0] || null;    // single-person mode
}
```

**Key landmarks (indices 0-32):**

```
0: nose           11: left_shoulder   23: left_hip
1: left_eye_inner 12: right_shoulder  24: right_hip
2: left_eye       13: left_elbow      25: left_knee
3: left_eye_outer 14: right_elbow     26: right_knee
4: right_eye_inner 15: left_wrist     27: left_ankle
5: right_eye      16: right_wrist     28: right_ankle
6: right_eye_outer 17: left_pinky     29: left_heel
7: left_ear       18: right_pinky     30: right_heel
8: right_ear      19: left_index      31: left_foot_index
9: mouth_left     20: right_index     32: right_foot_index
10: mouth_right   21: left_thumb
                  22: right_thumb
```

### 1.3 Pose overlay canvas (panel UI)

- Draw skeleton over the video thumbnail on the dance panel
- Color keypoints by confidence (green >0.7, yellow 0.4-0.7, red <0.4)
- Skeleton lines connecting parent→child per BlazePose adjacency list

---

## Phase 2 — Feature Extraction Pipeline (Week 1–2)

Raw (x, y, z, visibility) keypoints are too noisy and resolution-dependent for a classifier. We extract translation-invariant, scale-invariant features.

### 2.1 Feature set per frame (58 features)

```js
// extension/src/lib/poseFeatures.js

const JOINT_ANGLE_TRIPLETS = [
  // [vertex, point_a, point_b] — all indices into the 33 BlazePose landmarks
  [13, 11, 15],  // left elbow
  [14, 12, 16],  // right elbow
  [11, 13, 23],  // left shoulder-elbow-hip
  [12, 14, 24],  // right shoulder-elbow-hip
  [25, 23, 27],  // left knee
  [26, 24, 28],  // right knee
  [23, 25, 29],  // left hip-knee-ankle
  [24, 26, 30],  // right hip-knee-ankle
  [11, 23, 25],  // left hip angle
  [12, 24, 26],  // right hip angle
  [0,  11, 12],  // spine lean (nose → shoulders)
  [23, 24, 11],  // hip tilt
];

function angle3(a, b, c) {
  // b is vertex
  const ba = [a.x - b.x, a.y - b.y, a.z - b.z];
  const bc = [c.x - b.x, c.y - b.y, c.z - b.z];
  const dot = ba[0]*bc[0] + ba[1]*bc[1] + ba[2]*bc[2];
  const magBA = Math.hypot(...ba);
  const magBC = Math.hypot(...bc);
  if (magBA === 0 || magBC === 0) return 0;
  return Math.acos(Math.min(1, Math.max(-1, dot / (magBA * magBC))));
}

export function extractFeatures(keypoints) {
  // Normalize: translate so hip midpoint = origin, scale by torso height
  const lh = keypoints[23], rh = keypoints[24];
  const ls = keypoints[11], rs = keypoints[12];
  const hipMid = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2, z: (lh.z + rh.z) / 2 };
  const shoulderMid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2, z: (ls.z + rs.z) / 2 };
  const torsoHeight = Math.hypot(
    shoulderMid.x - hipMid.x,
    shoulderMid.y - hipMid.y,
    shoulderMid.z - hipMid.z
  ) || 1;

  const norm = keypoints.map(kp => ({
    x: (kp.x - hipMid.x) / torsoHeight,
    y: (kp.y - hipMid.y) / torsoHeight,
    z: (kp.z - hipMid.z) / torsoHeight,
    score: kp.score,
  }));

  const angles = JOINT_ANGLE_TRIPLETS.map(([v, a, c]) => angle3(norm[a], norm[v], norm[c]));

  // Symmetry: |left_angle - right_angle| for paired joints
  const symmetry = [
    Math.abs(angles[0] - angles[1]),  // elbow symmetry
    Math.abs(angles[4] - angles[5]),  // knee symmetry
    Math.abs(angles[6] - angles[7]),  // ankle symmetry
    Math.abs(angles[8] - angles[9]),  // hip symmetry
  ];

  // Key point positions (selected, normalized)
  const positions = [
    norm[0].x,  norm[0].y,   // nose
    norm[15].x, norm[15].y,  // left wrist
    norm[16].x, norm[16].y,  // right wrist
    norm[27].x, norm[27].y,  // left ankle
    norm[28].x, norm[28].y,  // right ankle
    norm[29].x, norm[29].y,  // left heel
    norm[30].x, norm[30].y,  // right heel
    norm[31].x, norm[31].y,  // left foot index
    norm[32].x, norm[32].y,  // right foot index
  ];

  // Spine lean angle
  const spineLean = Math.atan2(shoulderMid.x - hipMid.x, shoulderMid.y - hipMid.y);

  return [...angles, ...symmetry, ...positions, spineLean];
  // Total: 12 + 4 + 18 + 1 = 35 features per frame
}
```

### 2.2 Velocity features (per frame pair)

```js
export function computeVelocities(prevFeatures, currFeatures) {
  return currFeatures.map((f, i) => f - prevFeatures[i]);
}
// Appended to feature vector: 35 (position) + 35 (velocity) = 70 features/frame
// We'll use 35 static features for the first frame and zero-pad velocities
```

### 2.3 Sliding window assembly

```js
const WINDOW_SIZE = 30;   // ~1 second at 30fps
const STEP_SIZE   = 5;    // new prediction every ~6 frames

// Buffer: ring buffer of last WINDOW_SIZE feature vectors
// Input tensor shape: [1, 30, 70]
```

---

## Phase 3 — Data Collection Strategy (Week 2–4)

Training data is the hardest part. We need labeled video clips for each move.

### 3.1 Target move set (v1 — 20 named moves)

```
FOOTWORK:         The Moonwalk, The Running Man, The Charleston, The Shuffle,
                  The Electric Slide, The Cabbage Patch
ARM_ISOLATION:    Waacking, Tutting, The Robot
FULL_BODY:        The Worm, The Floss, Krump, Breaking (B-Boy Toprock)
UPPER_BODY:       Locking, Popping, The Nae Nae, The Dab
FLOOR_WORK:       Headspins, Windmill
FREESTYLE:        (null label — catch-all for unclassified movement)
```

### 3.2 Data sources

1. **YouTube**: search `"how to [move name]"` — use `yt-dlp` to batch download; extract keypoints with Python MediaPipe; label by video title
2. **FineGym / HMDB51 / UCF-101**: public action recognition datasets; map relevant action classes to our move names
3. **Self-recorded**: 5-10 clips per move filmed at various angles and lighting
4. **Gemini Plan A output**: when Gemini labels a segment as "The Moonwalk" with high confidence, use that segment as weak training data

### 3.3 Target data size

| Move | Min clips | Target |
|---|---|---|
| Each named move | 30 | 100+ |
| Freestyle (null) | 200 | 500+ |
| **Total** | ~800 | ~2500+ |

### 3.4 Data collection script (`training/collect_poses.py`)

```python
import mediapipe as mp
import cv2, csv, os, json

mp_pose = mp.solutions.pose

def extract_poses_from_video(video_path, label, output_csv):
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    rows = []
    with mp_pose.Pose(model_complexity=2, smooth_landmarks=True) as pose:
        frame_idx = 0
        while True:
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
                rows.append(row)
            frame_idx += 1
    cap.release()

    with open(output_csv, "a", newline="") as f:
        writer = csv.writer(f)
        for row in rows:
            writer.writerow(row)
```

---

## Phase 4 — Model Architecture (Week 4–6)

### 4.1 Primary: BiLSTM classifier

**Rationale:** Dance moves are temporal sequences; LSTMs capture long-range dependencies in joint trajectories. Bidirectional helps when the classifier processes recorded video (not live).

```python
# training/model_bilstm.py
import tensorflow as tf

def build_bilstm(num_classes, seq_len=30, feature_dim=70):
    inputs = tf.keras.Input(shape=(seq_len, feature_dim))
    x = tf.keras.layers.Masking(mask_value=0.0)(inputs)
    x = tf.keras.layers.Bidirectional(
        tf.keras.layers.LSTM(128, return_sequences=True, dropout=0.3)
    )(x)
    x = tf.keras.layers.Bidirectional(
        tf.keras.layers.LSTM(64, return_sequences=False, dropout=0.3)
    )(x)
    x = tf.keras.layers.Dense(64, activation="relu")(x)
    x = tf.keras.layers.Dropout(0.4)(x)
    outputs = tf.keras.layers.Dense(num_classes, activation="softmax")(x)
    model = tf.keras.Model(inputs, outputs)
    model.compile(
        optimizer=tf.keras.optimizers.Adam(1e-3),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"]
    )
    return model
```

**Expected model size:** ~2.1MB unquantized, ~600KB int8 quantized

### 4.2 Alternative: Temporal Convolutional Network (TCN)

Faster inference, more parallelizable, competitive accuracy:

```python
def build_tcn(num_classes, seq_len=30, feature_dim=70):
    inputs = tf.keras.Input(shape=(seq_len, feature_dim))
    x = inputs
    for filters, dilation in [(64, 1), (64, 2), (128, 4), (128, 8)]:
        residual = x
        x = tf.keras.layers.Conv1D(filters, 3, padding="causal", dilation_rate=dilation, activation="relu")(x)
        x = tf.keras.layers.Dropout(0.2)(x)
        x = tf.keras.layers.Conv1D(filters, 3, padding="causal", dilation_rate=dilation, activation="relu")(x)
        if residual.shape[-1] != filters:
            residual = tf.keras.layers.Conv1D(filters, 1)(residual)
        x = tf.keras.layers.Add()([x, residual])
    x = tf.keras.layers.GlobalAveragePooling1D()(x)
    x = tf.keras.layers.Dense(64, activation="relu")(x)
    outputs = tf.keras.layers.Dense(num_classes, activation="softmax")(x)
    return tf.keras.Model(inputs, outputs)
```

### 4.3 Confidence threshold + null class

- Output includes a `FREESTYLE` (null) class — the model can say "I don't know"
- At inference, only report a move if `confidence >= 0.72`
- Below threshold: return `null` (Gemini Plan A result shown instead)

### 4.4 Training recipe

```python
# training/train.py
from sklearn.model_selection import train_test_split
import numpy as np

WINDOW  = 30
STEP    = 5
CLASSES = [
    "moonwalk", "running_man", "charleston", "shuffle",
    "electric_slide", "cabbage_patch",
    "waacking", "tutting", "robot",
    "worm", "floss", "krump", "bboy_toprock",
    "locking", "popping", "nae_nae", "dab",
    "headspin", "windmill",
    "freestyle",  # null / catch-all — index 19
]

def windowed_dataset(poses_by_label):
    X, y = [], []
    for label_idx, (label, sequences) in enumerate(poses_by_label.items()):
        for seq in sequences:   # seq: (T, 70) numpy array
            for start in range(0, len(seq) - WINDOW + 1, STEP):
                X.append(seq[start:start + WINDOW])
                y.append(label_idx)
    return np.array(X, dtype=np.float32), np.array(y, dtype=np.int32)

# Augmentation: random time-warp ±20%, horizontal flip (mirror symmetry)
def augment(x):
    if np.random.rand() < 0.5:
        # Flip left/right landmarks
        x = x.copy()
        # swap paired joint angles and positions
    return x
```

---

## Phase 5 — TF.js Export & Quantization (Week 6–7)

### 5.1 Export from Keras

```python
# training/export_tfjs.py
import tensorflowjs as tfjs

# Standard float32 export
tfjs.converters.save_keras_model(model, "model_tfjs/")

# Int8 quantization for ~4x size reduction
tfjs.converters.save_keras_model(
    model,
    "model_tfjs_int8/",
    quantization_dtype_map={"float32": "int8"}
)
```

**Output files:**
```
model_tfjs/
  model.json          (~8KB — architecture + weight manifest)
  group1-shard1of1.bin (~600KB int8 quantized)
```

### 5.2 Bundle with extension

```
extension/src/models/dance/
  model.json
  group1-shard1of1.bin
  labels.json          # ["moonwalk", "running_man", ...]
```

Add to `manifest.json` `web_accessible_resources` if loaded via URL, or import directly via `chrome.runtime.getURL`.

---

## Phase 6 — Browser Inference Integration (Week 7–9)

### 6.1 Move classifier (`extension/src/lib/moveClassifier.js`)

```js
import * as tf from "@tensorflow/tfjs";
import { extractFeatures, computeVelocities } from "./poseFeatures.js";

const WINDOW_SIZE    = 30;
const CONFIDENCE_MIN = 0.72;

let model   = null;
let labels  = null;
let buffer  = [];      // ring buffer of feature vectors
let prevFeat = null;

export async function initClassifier() {
  if (model) return;
  const modelUrl = chrome.runtime.getURL("src/models/dance/model.json");
  model  = await tf.loadLayersModel(modelUrl);
  labels = await fetch(chrome.runtime.getURL("src/models/dance/labels.json")).then(r => r.json());
}

export function feedPose(keypoints) {
  const feat = extractFeatures(keypoints);
  const vel  = prevFeat ? computeVelocities(prevFeat, feat) : new Array(feat.length).fill(0);
  prevFeat   = feat;
  const combined = [...feat, ...vel];  // 70 features
  buffer.push(combined);
  if (buffer.length > WINDOW_SIZE) buffer.shift();
}

export async function classifyCurrentWindow() {
  if (!model || buffer.length < WINDOW_SIZE) return null;
  const input   = tf.tensor3d([buffer], [1, WINDOW_SIZE, 70]);
  const probs   = model.predict(input);
  const probsArr = await probs.data();
  input.dispose();
  probs.dispose();

  const maxIdx = probsArr.indexOf(Math.max(...probsArr));
  const conf   = probsArr[maxIdx];
  const label  = labels[maxIdx];

  if (label === "freestyle" || conf < CONFIDENCE_MIN) return null;
  return {
    moveName:   formatMoveName(label),   // "moonwalk" → "The Moonwalk"
    confidence: Math.round(conf * 100),
    category:   CATEGORY_MAP[label] || "freestyle",
  };
}

const CATEGORY_MAP = {
  moonwalk:      "footwork",
  running_man:   "footwork",
  charleston:    "footwork",
  // ...
};

function formatMoveName(label) {
  const DISPLAY = {
    moonwalk:      "The Moonwalk",
    running_man:   "The Running Man",
    robot:         "The Robot",
    worm:          "The Worm",
    floss:         "The Floss",
    // ...
  };
  return DISPLAY[label] || label.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
```

### 6.2 Integration with video playback loop

In `panel.js`, when dance mode is active, run the classifier on every `requestAnimationFrame`:

```js
let classifyLoop = null;

async function startLivePoseClassification(videoEl) {
  await Promise.all([initPoseDetector(), initClassifier()]);
  const canvas = document.getElementById("pose-overlay");
  const ctx    = canvas.getContext("2d");

  async function tick() {
    const pose = await detectPose(videoEl);
    if (pose) {
      drawSkeleton(ctx, pose.keypoints, canvas.width, canvas.height);
      feedPose(pose.keypoints3D || pose.keypoints);
      const result = await classifyCurrentWindow();
      if (result) updateLiveMoveLabel(result);
    }
    classifyLoop = requestAnimationFrame(tick);
  }
  tick();
}

function updateLiveMoveLabel({ moveName, confidence }) {
  const el = document.getElementById("live-move-label");
  el.textContent = `${moveName} (${confidence}%)`;
  el.style.display = "block";
}
```

### 6.3 Performance targets

| Model | Inference (M1 Mac) | Inference (mid-range Android) |
|---|---|---|
| BiLSTM int8 | ~4ms/frame | ~18ms/frame |
| TCN int8 | ~2ms/frame | ~10ms/frame |
| BlazePose HEAVY | ~30ms/frame | ~80ms/frame |
| **Total budget** | **<50ms/frame** (≥20fps) | **<100ms/frame** (≥10fps) |

Use `tf.env().set("WEBGL_CPU_FORWARD", false)` and ensure WebGL backend is active.

---

## Phase 7 — Move Database (Week 8–9)

### 7.1 MongoDB `DanceMoves` collection

```js
// backend/src/models/DanceMove.js
const danceMoveSchema = new mongoose.Schema({
  slug:        { type: String, required: true, unique: true }, // "moonwalk"
  displayName: { type: String, required: true },               // "The Moonwalk"
  category:    { type: String, enum: ["footwork","arm_isolation","full_body","upper_body","floor_work","freestyle"] },
  description: String,
  originEra:   String,   // e.g. "1980s"
  originStyle: String,   // e.g. "Funk / Pop"
  famousExample: String, // e.g. "Michael Jackson – Billie Jean (1983)"
  tutorialVideoId: mongoose.Schema.Types.ObjectId,  // link to Framewise video
  practiceTips: [String],
  commonMistakes: [String],
  relatedMoves: [String],  // slugs of similar moves
});
```

### 7.2 API endpoint

```
GET /api/dance-moves          — list all moves
GET /api/dance-moves/:slug    — detail page
```

### 7.3 Extension panel "Move Card" drawer

When a `moveName` is identified (Plan A or B), clicking the badge opens a drawer:
- Description, origin era/style
- Famous example video link
- Practice tips
- "See all videos with this move" link

---

## Phase 8 — Session Analytics (Week 9–10)

Track which moves a user watches most, their accuracy improving over time.

### 8.1 `PracticeSession` model

```js
const practiceSessionSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  videoId:   { type: mongoose.Schema.Types.ObjectId, ref: "Video" },
  movesStudied: [{
    moveSlug:   String,
    loopCount:  Number,     // how many times the loop button was hit
    totalSeconds: Number,   // time spent on this segment
  }],
  sessionStart: Date,
  sessionEnd:   Date,
});
```

### 8.2 Analytics endpoints

```
POST /api/practice/session          — create/update session
GET  /api/practice/summary/:userId  — moves by frequency, time spent
GET  /api/practice/progress/:slug   — per-move study history
```

---

## Phase 9 — Plan A / Plan B Merge Logic (Week 10–11)

Both Plan A (Gemini) and Plan B (classifier) run in parallel. Merge strategy:

```js
function resolveMoveName(planAResult, planBResult) {
  // Plan B wins if confidence ≥ 72%
  if (planBResult && planBResult.confidence >= 72) {
    return { ...planBResult, source: "model" };
  }
  // Plan A wins if it provided a non-null moveName
  if (planAResult?.moveName) {
    return { moveName: planAResult.moveName, confidence: null, source: "gemini" };
  }
  return null;
}
```

Surfaced in the UI as: `The Moonwalk` `(Gemini)` or `The Moonwalk 94%` `(Model)`.

---

## Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | Insufficient training data for rare moves | High | High | Start with top 8 moves, expand over time |
| 2 | BlazePose too slow on low-end devices | Medium | High | Fall back to MoveNet; offer CPU toggle |
| 3 | Model overfits to YouTube tutorial angles | High | Medium | Augment: horizontal flip, time-warp, brightness |
| 4 | Move names ambiguous (style vs. move) | Medium | Medium | Tight label ontology; human review of edge cases |
| 5 | TF.js bundle size impacts extension load | Low | Medium | Int8 quantization; lazy-load on demand |
| 6 | Gemini labels wrong (Plan A weak supervision) | Medium | Low | Weight manual labels 5× vs. Gemini weak labels |
| 7 | CORS / CSP blocking model fetch in extension | Low | High | Bundle model locally, not from CDN |
| 8 | MediaPipe Python ↔ BlazePose JS landmark mismatch | Low | High | Validate with identical video + compare outputs |
| 9 | User privacy concern (pose data) | Low | High | All inference is local; no pose data leaves browser |
| 10 | Training GPU cost on Colab | Low | Low | Use Colab free tier for <20 classes; rent A100 if needed |

---

## 13-Week Timeline

```
Week  1: BlazePose integration + skeleton overlay UI
Week  2: Feature extraction (extractFeatures, computeVelocities) + unit tests
Week  3: Data collection script + yt-dlp pipeline; collect first 3 moves (moonwalk, robot, floss)
Week  4: Data collection sprint — reach 100 clips/move for first 10 moves
Week  5: Feature engineering validation — PCA/t-SNE to confirm separability
Week  6: BiLSTM training v1 — initial accuracy benchmark
Week  7: TCN training v1 — compare with BiLSTM; pick winner; TF.js export
Week  8: Browser inference integration (moveClassifier.js, live label overlay)
Week  9: Move database API + panel Move Card drawer
Week 10: Plan A / Plan B merge logic; UI source badge (Gemini vs Model)
Week 11: Session analytics backend + practice progress UI
Week 12: Expand to all 20 move classes; re-train final model
Week 13: End-to-end QA, performance profiling, beta release
```

---

## Files To Create / Modify

### New files (training pipeline)
```
training/
  collect_poses.py      — video → MediaPipe → CSV pipeline
  features.py           — Python mirror of extractFeatures()
  build_dataset.py      — windowed dataset builder
  train.py              — BiLSTM / TCN training
  export_tfjs.py        — Keras → TF.js export
  evaluate.py           — confusion matrix, per-class accuracy
  data/
    raw_videos/          — gitignored
    poses/               — gitignored (CSVs of keypoints)
    labels.json          — slug → display name + category
```

### New files (extension)
```
extension/src/lib/
  poseDetector.js       — BlazePose wrapper
  poseFeatures.js       — extractFeatures(), computeVelocities()
  moveClassifier.js     — TF.js inference + confidence logic
extension/src/models/dance/
  model.json
  group1-shard1of1.bin
  labels.json
```

### New files (backend)
```
backend/src/models/DanceMove.js
backend/src/models/PracticeSession.js
backend/src/controllers/danceMoveController.js
backend/src/routes/danceMoveRoutes.js
```

### Modified files
```
extension/src/panel/panel.js    — startLivePoseClassification(), updateLiveMoveLabel()
extension/src/panel/panel.html  — pose-overlay canvas, live-move-label div
backend/src/models/Segment.js   — already done (Plan A)
backend/src/services/geminiService.js  — already done (Plan A)
```

---

*Plan A (Gemini prompt-based) is already shipped and serves as both a user-facing feature and a weak-supervision signal for Plan B training data.*
