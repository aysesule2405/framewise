import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

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

async function getDetector() {
  if (cachedDetector) return cachedDetector;

  const [tf, poseDetection] = await Promise.all([
    import("@tensorflow/tfjs"),
    import("@tensorflow-models/pose-detection"),
  ]);

  try {
    await tf.setBackend("webgl");
  } catch {
    await tf.setBackend("cpu");
  }
  await tf.ready();

  cachedDetector = await poseDetection.createDetector(
    poseDetection.SupportedModels.MoveNet,
    {
      modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
      enableSmoothing: true,
    }
  );

  return cachedDetector;
}

export default function PoseTracker() {
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const stoppedRef = useRef(true);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
    stopTracking({ updateState: false });
  }, []);

  const startTracking = async () => {
    setError("");
    setLoading(true);
    stoppedRef.current = false;

    try {
      const detector = await getDetector();
      if (stoppedRef.current) return;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      if (stoppedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;
      await video.play();
      setActive(true);
      drawLoop(detector);
    } catch (err) {
      stopTracking();
      const denied = err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError";
      if (mountedRef.current) {
        setError(denied ? "Webcam permission was denied." : "Pose tracking could not start.");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const stopTracking = ({ updateState = true } = {}) => {
    stoppedRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) videoRef.current.srcObject = null;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;
    }

    if (updateState && mountedRef.current) {
      setActive(false);
      setLoading(false);
    }
  };

  const drawLoop = (detector) => {
    const tick = async () => {
      if (stoppedRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2 && video.videoWidth > 0) {
        canvas.width = 320;
        canvas.height = 240;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        try {
          const poses = await detector.estimatePoses(video);
          if (poses?.[0]?.keypoints) {
            drawSkeleton(ctx, poses[0].keypoints, canvas.width, canvas.height, video.videoWidth, video.videoHeight);
          }
        } catch {}
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  };

  return (
    <div className="vp-pose-tracker">
      <div className="vp-practice-card-head">
        <span className="vp-practice-kicker">Live webcam</span>
        <p className="vp-practice-title">Pose tracker</p>
      </div>
      <button
        className={`vp-add-btn vp-add-btn-wide vp-pose-toggle${active ? " active" : ""}`}
        onClick={active || loading ? stopTracking : startTracking}
        disabled={loading}
      >
        <Icon name="dance" size={13} />
        {loading ? "Loading model…" : active ? "Stop Pose Tracking" : "Start Pose Tracking"}
      </button>

      {(active || loading) && (
        <div className="vp-pose-preview" aria-label="Pose tracking webcam preview">
          <video ref={videoRef} className="vp-pose-video" playsInline muted />
          <canvas ref={canvasRef} className="vp-pose-canvas" />
          {loading && <span className="vp-pose-loading">Loading model…</span>}
        </div>
      )}

      {error && <p className="vp-inline-error">{error}</p>}
    </div>
  );
}

function drawSkeleton(ctx, keypoints, width, height, videoWidth, videoHeight) {
  const scaleX = width / videoWidth;
  const scaleY = height / videoHeight;
  const minScore = 0.2;

  drawLines(ctx, keypoints, minScore, scaleX, scaleY);
  drawPoints(ctx, keypoints, minScore, scaleX, scaleY);
}

function drawPoints(ctx, keypoints, minScore, scaleX, scaleY) {
  keypoints.forEach((point) => {
    if (point.score > minScore) {
      ctx.beginPath();
      ctx.arc(point.x * scaleX, point.y * scaleY, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#FF0055";
      ctx.fill();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });
}

function drawLines(ctx, keypoints, minScore, scaleX, scaleY) {
  ctx.strokeStyle = "#00FF00";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";

  POSE_CONNECTIONS.forEach(([a, b]) => {
    const p1 = keypoints.find((point) => point.name === a);
    const p2 = keypoints.find((point) => point.name === b);

    if (p1 && p2 && p1.score > minScore && p2.score > minScore) {
      ctx.beginPath();
      ctx.moveTo(p1.x * scaleX, p1.y * scaleY);
      ctx.lineTo(p2.x * scaleX, p2.y * scaleY);
      ctx.stroke();
    }
  });
}
