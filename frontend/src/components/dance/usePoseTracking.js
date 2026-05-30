import { useRef, useState, useCallback, useEffect } from "react";

const POSE_CONNECTIONS = [
  ["left_shoulder", "right_shoulder"],
  ["left_shoulder", "left_elbow"],
  ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"],
  ["right_elbow", "right_wrist"],
  ["left_shoulder", "left_hip"],
  ["right_shoulder", "right_hip"],
  ["left_hip", "right_hip"],
  ["left_hip", "left_knee"],
  ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"],
  ["right_knee", "right_ankle"],
];

let cachedDetector = null;

export async function getDetector() {
  if (cachedDetector) return cachedDetector;
  const [tf, poseDetection] = await Promise.all([
    import("@tensorflow/tfjs"),
    import("@tensorflow-models/pose-detection"),
  ]);
  try { await tf.setBackend("webgl"); } catch { await tf.setBackend("cpu"); }
  await tf.ready();
  cachedDetector = await poseDetection.createDetector(
    poseDetection.SupportedModels.MoveNet,
    { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING, enableSmoothing: true }
  );
  return cachedDetector;
}

// Normalises webcam keypoints into comparison-canvas coordinates.
// Scales body to ~58% of canvas height, anchors face near the top,
// and preserves left-right position proportionally.
function normalizePoseToCanvas(keypoints, srcW, srcH, tgtW, tgtH) {
  const visible = keypoints.filter((k) => k.score > 0.2);
  if (visible.length < 4) return null;

  const ys = visible.map((k) => k.y);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const bboxH = maxY - minY || 1;

  const scale = (tgtH * 0.58) / bboxH;

  // Anchor: nose preferred, else topmost visible keypoint
  const nose = keypoints.find((k) => k.name === "nose" && k.score > 0.2);
  const headKp = nose || visible.reduce((a, b) => (a.y < b.y ? a : b));

  // Map face X proportionally to the middle 70% of the canvas
  const faceCanvasX = tgtW * (0.15 + (headKp.x / srcW) * 0.70);
  const faceCanvasY = tgtH * 0.10; // head fixed near top

  const offsetX = faceCanvasX - headKp.x * scale;
  const offsetY = faceCanvasY - headKp.y * scale;

  return keypoints.map((k) => ({ ...k, x: k.x * scale + offsetX, y: k.y * scale + offsetY }));
}

export function drawSkeleton(ctx, keypoints, canvasW, canvasH, videoW, videoH, colors = {}) {
  const {
    line = "#B5CC92",
    dot = "#C56A43",
    dotOutline = "rgba(251,241,214,0.7)",
    lineWidth = 3,
    dotRadius = 5,
  } = colors;

  const sx = canvasW / videoW;
  const sy = canvasH / videoH;
  const min = 0.2;

  ctx.strokeStyle = line;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  POSE_CONNECTIONS.forEach(([a, b]) => {
    const p1 = keypoints.find((p) => p.name === a);
    const p2 = keypoints.find((p) => p.name === b);
    if (p1 && p2 && p1.score > min && p2.score > min) {
      ctx.beginPath();
      ctx.moveTo(p1.x * sx, p1.y * sy);
      ctx.lineTo(p2.x * sx, p2.y * sy);
      ctx.stroke();
    }
  });

  keypoints.forEach((p) => {
    if (p.score > min) {
      ctx.beginPath();
      ctx.arc(p.x * sx, p.y * sy, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = dot;
      ctx.fill();
      ctx.strokeStyle = dotOutline;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });
}

export function usePoseTracking({ videoRef, canvasRef, compareCanvasRef = null, skipCompareRef = null }) {
  const [status, setStatus] = useState("idle"); // idle | loading | active | error
  const [error, setError] = useState("");
  const [keypointCount, setKeypointCount] = useState(0);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const stoppedRef = useRef(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      stop({ updateState: false });
    };
  }, []);

  const stop = useCallback(({ updateState = true } = {}) => {
    stoppedRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    const cc = compareCanvasRef?.current;
    if (cc) {
      const cctx = cc.getContext("2d");
      if (cctx) cctx.clearRect(0, 0, cc.width, cc.height);
    }
    if (updateState && mountedRef.current) {
      setStatus("idle");
      setKeypointCount(0);
    }
  }, [videoRef, canvasRef, compareCanvasRef]);

  const start = useCallback(async () => {
    setError("");
    setStatus("loading");
    stoppedRef.current = false;
    try {
      const detector = await getDetector();
      if (stoppedRef.current) return;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      if (stoppedRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      if (mountedRef.current) setStatus("active");

      const tick = async () => {
        if (stoppedRef.current) return;
        const canvas = canvasRef.current;
        if (video && canvas && video.readyState >= 2 && video.videoWidth > 0) {
          const w = canvas.offsetWidth || 640;
          const h = canvas.offsetHeight || 480;
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
          }
          const ctx = canvas.getContext("2d");
          ctx.clearRect(0, 0, w, h);
          try {
            const poses = await detector.estimatePoses(video);
            if (poses?.[0]?.keypoints) {
              drawSkeleton(ctx, poses[0].keypoints, w, h, video.videoWidth, video.videoHeight);

              // Draw normalised ghost overlay on comparison canvas (YouTube video side)
              const cc = compareCanvasRef?.current;
              if (cc && !skipCompareRef?.current) {
                const cw = cc.offsetWidth || w;
                const ch = cc.offsetHeight || h;
                if (cc.width !== cw || cc.height !== ch) { cc.width = cw; cc.height = ch; }
                const cctx = cc.getContext("2d");
                cctx.clearRect(0, 0, cw, ch);
                const normalized = normalizePoseToCanvas(
                  poses[0].keypoints, video.videoWidth, video.videoHeight, cw, ch
                );
                if (normalized) {
                  // Pass cw/ch as both canvas and video dims so sx=sy=1 (already in canvas coords)
                  drawSkeleton(cctx, normalized, cw, ch, cw, ch, {
                    line: "rgba(238,146,104,0.65)",
                    dot: "rgba(238,146,104,0.9)",
                    dotOutline: "rgba(255,242,220,0.3)",
                    lineWidth: 2.5,
                    dotRadius: 4,
                  });
                }
              }

              if (mountedRef.current) {
                setKeypointCount(poses[0].keypoints.filter((k) => k.score > 0.2).length);
              }
            }
          } catch {}
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      stop();
      const denied = err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError";
      if (mountedRef.current) {
        setError(denied ? "Camera permission was denied." : "Pose tracking could not start.");
        setStatus("error");
      }
    }
  }, [videoRef, canvasRef, stop]);

  return { status, error, keypointCount, isActive: status === "active", isLoading: status === "loading", start, stop };
}
