"""
Trains a BiLSTM or TCN dance move classifier on windowed pose features.
Exports to TF.js format for browser inference.

Usage:
  python train.py                          # BiLSTM (default)
  python train.py --model tcn              # TCN
  python train.py --model bilstm --epochs 60 --batch 64

Requirements:
  pip install tensorflow tensorflowjs numpy scikit-learn matplotlib
"""

import argparse
import json
import os

import numpy as np
import tensorflow as tf
from sklearn.utils.class_weight import compute_class_weight


# ── Model definitions ────────────────────────────────────────────────────────

def build_bilstm(num_classes, seq_len=30, feat_dim=70):
    inp = tf.keras.Input(shape=(seq_len, feat_dim))
    x   = tf.keras.layers.Masking(mask_value=0.0)(inp)
    x   = tf.keras.layers.Bidirectional(tf.keras.layers.LSTM(128, return_sequences=True, dropout=0.3))(x)
    x   = tf.keras.layers.Bidirectional(tf.keras.layers.LSTM(64,  return_sequences=False, dropout=0.3))(x)
    x   = tf.keras.layers.Dense(64, activation="relu")(x)
    x   = tf.keras.layers.Dropout(0.4)(x)
    out = tf.keras.layers.Dense(num_classes, activation="softmax")(x)
    model = tf.keras.Model(inp, out, name="bilstm_dance")
    model.compile(
        optimizer=tf.keras.optimizers.Adam(1e-4),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


def build_tcn(num_classes, seq_len=30, feat_dim=70):
    inp = tf.keras.Input(shape=(seq_len, feat_dim))
    x   = inp
    for filters, dilation in [(64, 1), (64, 2), (128, 4), (128, 8)]:
        res = x
        x   = tf.keras.layers.Conv1D(filters, 3, padding="causal", dilation_rate=dilation, activation="relu")(x)
        x   = tf.keras.layers.Dropout(0.2)(x)
        x   = tf.keras.layers.Conv1D(filters, 3, padding="causal", dilation_rate=dilation, activation="relu")(x)
        if res.shape[-1] != filters:
            res = tf.keras.layers.Conv1D(filters, 1)(res)
        x   = tf.keras.layers.Add()([x, res])
    x   = tf.keras.layers.GlobalAveragePooling1D()(x)
    x   = tf.keras.layers.Dense(64, activation="relu")(x)
    out = tf.keras.layers.Dense(num_classes, activation="softmax")(x)
    model = tf.keras.Model(inp, out, name="tcn_dance")
    model.compile(
        optimizer=tf.keras.optimizers.Adam(1e-4),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


# ── Augmentation ─────────────────────────────────────────────────────────────

def augment_batch(X, y):
    """Random time-warp ±10% + horizontal mirror."""
    X_aug, y_aug = list(X), list(y)
    for x, label in zip(X, y):
        # Horizontal flip: negate x-component of position features
        flipped = x.copy()
        # Features 16-33 are normalised x/y positions; x coords are even indices 16,18,...
        for i in range(16, 34, 2):
            flipped[:, i] *= -1
        X_aug.append(flipped)
        y_aug.append(label)
    return np.array(X_aug, dtype=np.float32), np.array(y_aug, dtype=np.int32)


# ── Training ─────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset",  default="data/dataset.npz")
    parser.add_argument("--labels",   default="labels.json")
    parser.add_argument("--model",    default="bilstm", choices=["bilstm", "tcn"])
    parser.add_argument("--epochs",   type=int, default=100)
    parser.add_argument("--batch",    type=int, default=32)
    parser.add_argument("--out_dir",  default="data/model_saved")
    parser.add_argument("--tfjs_dir", default="../extension/src/models/dance")
    args = parser.parse_args()

    with open(args.labels) as f:
        label_defs = json.load(f)["labels"]
    num_classes = len(label_defs)

    data = np.load(args.dataset)
    X_train, y_train = data["X_train"], data["y_train"]
    X_val,   y_val   = data["X_val"],   data["y_val"]
    X_test,  y_test  = data["X_test"],  data["y_test"]

    print(f"Train: {len(X_train)}  Val: {len(X_val)}  Test: {len(X_test)}")
    print(f"Classes: {num_classes}  Model: {args.model}")

    # Augment training set
    X_train, y_train = augment_batch(X_train, y_train)
    print(f"After augmentation: {len(X_train)} training windows")

    # Class weights to compensate for idle class imbalance (~2.3x fewer windows)
    classes = np.arange(num_classes)
    weights = compute_class_weight("balanced", classes=classes, y=y_train)
    class_weight = dict(zip(classes, weights))
    print("Class weights:", {k: f"{v:.3f}" for k, v in class_weight.items()})

    build_fn = build_bilstm if args.model == "bilstm" else build_tcn
    model = build_fn(num_classes)
    model.summary()

    callbacks = [
        tf.keras.callbacks.EarlyStopping(patience=15, restore_best_weights=True, monitor="val_accuracy"),
        tf.keras.callbacks.ReduceLROnPlateau(factor=0.5, patience=7, min_lr=1e-6),
        tf.keras.callbacks.ModelCheckpoint(
            filepath=os.path.join(args.out_dir, "best.keras"),
            save_best_only=True, monitor="val_accuracy"
        ),
    ]
    os.makedirs(args.out_dir, exist_ok=True)

    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=args.epochs,
        batch_size=args.batch,
        class_weight=class_weight,
        callbacks=callbacks,
        verbose=1,
    )

    # Evaluate on test set
    loss, acc = model.evaluate(X_test, y_test, verbose=0)
    print(f"\nTest accuracy: {acc:.4f}  loss: {loss:.4f}")

    # Save Keras model — run export_tfjs.py separately to convert to TF.js
    os.makedirs(args.tfjs_dir, exist_ok=True)
    model.save(os.path.join(args.out_dir, "best_exported.keras"))
    print(f"Keras model saved. Run: python export_tfjs.py --model {args.out_dir}/best_exported.keras")

    # Save label list for the browser classifier
    labels_out = os.path.join(args.tfjs_dir, "labels.json")
    with open(labels_out, "w") as f:
        json.dump([d["slug"] for d in label_defs], f)
    print(f"Labels saved to {labels_out}")


if __name__ == "__main__":
    main()
