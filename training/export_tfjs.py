"""
Converts a saved Keras model to TF.js format using the tensorflowjs_converter CLI.
Run this in a separate environment where tensorflowjs is installed — see note below.

NOTE: tensorflowjs has dependency conflicts with mediapipe/tensorflow on Python 3.12.
The recommended path is to run conversion on Google Colab:

  1. Upload best_exported.keras to Colab
  2. !pip install tensorflowjs
  3. !tensorflowjs_converter --input_format=keras best_exported.keras /content/tfjs_out
  4. Download the /content/tfjs_out directory
  5. Place model.json + weight shards in extension/src/models/dance/

Alternatively, if you have a separate Python 3.10/3.11 environment:
  pip install tensorflowjs==4.22.0
  python export_tfjs.py --model data/model_saved/best_exported.keras

Usage:
  python export_tfjs.py
  python export_tfjs.py --model data/model_saved/best_exported.keras --out ../extension/src/models/dance
"""

import argparse
import os
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model",    default="data/model_saved/best_exported.keras")
    parser.add_argument("--out",      default="../extension/src/models/dance")
    parser.add_argument("--quantize", default="uint8", choices=["float32", "float16", "uint8"])
    args = parser.parse_args()

    converter = os.path.join(os.path.dirname(sys.executable), "tensorflowjs_converter")
    if not os.path.exists(converter):
        print("tensorflowjs_converter not found in this environment.")
        print("Install it with: pip install tensorflowjs")
        print("\nOr run conversion on Google Colab (see docstring at top of this file).")
        sys.exit(1)

    os.makedirs(args.out, exist_ok=True)

    quant_flag = []
    if args.quantize == "uint8":
        quant_flag = ["--quantize_uint8", "*"]
    elif args.quantize == "float16":
        quant_flag = ["--quantize_float16", "*"]

    cmd = [
        converter,
        "--input_format", "keras",
        *quant_flag,
        args.model,
        args.out,
    ]
    print("Running:", " ".join(cmd))
    result = subprocess.run(cmd, capture_output=False)
    if result.returncode != 0:
        sys.exit(result.returncode)

    print(f"\nTF.js model saved to {args.out}")
    for fname in sorted(os.listdir(args.out)):
        size = os.path.getsize(os.path.join(args.out, fname))
        print(f"  {fname}  {size/1024:.1f} KB")


if __name__ == "__main__":
    main()
