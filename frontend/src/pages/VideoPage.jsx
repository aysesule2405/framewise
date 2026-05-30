import { useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { videoAPI, chatAPI, notesAPI, bookmarkAPI } from "../services/api";
import Icon from "../components/Icon";
import DancePracticeWorkspace from "../components/dance/DancePracticeWorkspace";
import { drawSkeleton } from "../components/dance/usePoseTracking";

let cachedMultiDetector = null;
async function getMultiDetector() {
  if (cachedMultiDetector) return cachedMultiDetector;
  const [tf, poseDetection] = await Promise.all([
    import("@tensorflow/tfjs"),
    import("@tensorflow-models/pose-detection"),
  ]);
  try { await tf.setBackend("webgl"); } catch { await tf.setBackend("cpu"); }
  await tf.ready();
  cachedMultiDetector = await poseDetection.createDetector(
    poseDetection.SupportedModels.MoveNet,
    { modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING, enableSmoothing: true, enableTracking: true }
  );
  return cachedMultiDetector;
}
import { useToast } from "../context/ToastContext";
import { SkeletonSegment } from "../components/Skeleton";
import "./VideoPage.css";

export default function VideoPage() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const [video, setVideo]               = useState(null);
  const [videoLoadError, setVideoLoadError] = useState(false);
  const [segments, setSegments]         = useState([]);
  const [segmentsLoading, setSegmentsLoading] = useState(true);
  const [danceSegments, setDanceSegments] = useState([]);
  const [analyzingDance, setAnalyzingDance] = useState(false);
  const [messages, setMessages]         = useState([]);
  const [input, setInput]               = useState("");
  const [sending, setSending]           = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(() => localStorage.getItem("fw_voice_replies") !== "off");
  const [voiceProfile, setVoiceProfile] = useState(() => localStorage.getItem("fw_voice_profile") || "default");
  const [danceMode, setDanceMode]       = useState(false);
  const audioRef = useRef(null);
  const [captionInput, setCaptionInput]                   = useState("");
  const [correctedCaptions, setCorrectedCaptions]         = useState([]);
  const [correctingCaptions, setCorrectingCaptions]       = useState(false);
  const [generatingCaptions, setGeneratingCaptions]       = useState(false);
  const [generatingAudioCaptions, setGeneratingAudioCaptions] = useState(false);
  const [captionError, setCaptionError]                   = useState("");
  const [noYtCaptions, setNoYtCaptions]                   = useState(false);
  const [translateLang, setTranslateLang]                 = useState("Spanish");
  const [translating, setTranslating]                     = useState(false);
  const [showTranslated, setShowTranslated]               = useState(false);
  const [transcriptSearch, setTranscriptSearch]           = useState("");
  const [noteError, setNoteError]                         = useState("");
  const [generatingNotes, setGeneratingNotes]             = useState(false);
  const [notes, setNotes]               = useState([]);
  const [noteInput, setNoteInput]       = useState("");
  const [bookmarks, setBookmarks]       = useState([]);
  const [bookmarkLabel, setBookmarkLabel] = useState("");
  const [bookmarkError, setBookmarkError] = useState("");
  const [quizItems, setQuizItems]       = useState([]);
  const [quizIndex, setQuizIndex]       = useState(0);
  const [cardFlipped, setCardFlipped]   = useState(false);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [mirror, setMirror]             = useState(false);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [dancerTracking, setDancerTracking] = useState("idle"); // idle | requesting | active | error
  const [dancerKpCount, setDancerKpCount] = useState(0);
  const [personCount, setPersonCount] = useState(0);
  const [selectedPersonIdx, setSelectedPersonIdx] = useState(-1); // -1 = auto (most centered)
  const selectedPersonIdxRef = useRef(-1);
  const dancerCanvasRef = useRef(null);
  const dancerScreenStreamRef = useRef(null);
  const dancerScreenVideoRef = useRef(null);
  const dancerRafRef = useRef(null);
  const dancerStoppedRef = useRef(true);
  const dancerOffscreenRef = useRef(null);
  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState(false);
  const playerWrapRef = useRef(null);
  const [leftTab, setLeftTab]           = useState(() => searchParams.get("tab") || "topics");
  const [playerTime, setPlayerTime]     = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);
  const playerRef    = useRef(null);
  const loopRef      = useRef(null);
  const chatBottomRef = useRef(null);
  const aiBusy = analyzingDance || sending || correctingCaptions || generatingCaptions || generatingAudioCaptions || translating || generatingNotes || generatingQuiz;

  useEffect(() => {
    videoAPI.get(videoId).then((r) => setVideo(r.data)).catch(() => setVideoLoadError(true));
    videoAPI.getSegments(videoId).then((r) => setSegments(r.data)).catch(() => {}).finally(() => setSegmentsLoading(false));
    videoAPI.getSegments(videoId, "dance").then((r) => setDanceSegments([...r.data].sort((a, b) => a.startTime - b.startTime))).catch(() => {});
    videoAPI.getCaptions(videoId).then((r) => setCorrectedCaptions(r.data)).catch(() => {});
    chatAPI.getHistory(videoId).then((r) => setMessages(r.data)).catch(() => {});
    notesAPI.list(videoId).then((r) => setNotes(r.data)).catch(() => {});
    bookmarkAPI.list(videoId).then((r) => setBookmarks(r.data)).catch(() => {});
  }, [videoId]);

  useEffect(() => {
    if (Array.isArray(video?.generatedQuiz) && video.generatedQuiz.length) {
      setQuizItems(video.generatedQuiz);
    }
  }, [video?.generatedQuiz]);

  useEffect(() => {
    if (!video) return;
    if (window.YT && window.YT.Player) { initPlayer(); return; }
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = initPlayer;
  }, [video]);

  function initPlayer() {
    playerRef.current = new window.YT.Player("yt-player", {
      events: {
        onReady: () => {
          const duration = Math.floor(playerRef.current?.getDuration?.() || 0);
          if (duration > 0) {
            setPlayerDuration(duration);
            videoAPI.updateProgress(videoId, Math.floor(currentTime()), duration).catch(() => {});
          }
          const stored = Number(localStorage.getItem(`fw_progress_${videoId}`)) || 0;
          const server = Number(video?.lastPositionSeconds) || 0;
          const resumeAt = Math.max(stored, server);
          if (resumeAt > 5) seekTo(resumeAt);
        },
      },
    });
  }

  useEffect(() => {
    if (!video) return;
    const interval = setInterval(() => {
      const position = Math.floor(currentTime());
      if (position <= 0) return;
      localStorage.setItem(`fw_progress_${videoId}`, String(position));
      videoAPI.updateProgress(videoId, position, Math.floor(playerRef.current?.getDuration?.() || 0)).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [video, videoId]);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlayerTime(Math.floor(currentTime()));
      const duration = Math.floor(playerRef.current?.getDuration?.() || 0);
      if (duration > 0 && duration !== playerDuration) setPlayerDuration(duration);
    }, 500);
    return () => clearInterval(interval);
  }, [playerDuration]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => { selectedPersonIdxRef.current = selectedPersonIdx; }, [selectedPersonIdx]);

  // Intercept YouTube's native fullscreen when dancer tracking is active — redirect to our wrapper
  useEffect(() => {
    const onFsChange = () => {
      const fsEl = document.fullscreenElement;
      const isOurs = fsEl === playerWrapRef.current;
      setIsPlayerFullscreen(isOurs);
      // If YouTube iframe went fullscreen while tracking, exit and re-enter on our wrapper
      if (fsEl && fsEl.id === "yt-player" && dancerStoppedRef.current === false) {
        document.exitFullscreen().then(() => {
          playerWrapRef.current?.requestFullscreen?.().catch(() => {});
        }).catch(() => {});
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const handlePlayerFullscreen = () => {
    if (document.fullscreenElement === playerWrapRef.current) {
      document.exitFullscreen().catch(() => {});
    } else {
      playerWrapRef.current?.requestFullscreen?.().catch(() => {});
    }
  };

  const seekTo    = (s) => playerRef.current?.seekTo?.(s, true);
  const stopLoop  = () => { clearInterval(loopRef.current); loopRef.current = null; };
  const setSpeed  = (r) => playerRef.current?.setPlaybackRate?.(r);
  const currentTime = () => playerRef.current?.getCurrentTime?.() ?? 0;
  const effectiveMode = video?.modeOverride && video.modeOverride !== "auto"
    ? video.modeOverride
    : video?.detectedMode || "general";
  const requestedTab = searchParams.get("tab");
  const forceDancePractice = requestedTab === "dance";
  const isDanceVideo = effectiveMode === "dance";
  const isStudyVideo = effectiveMode === "study";
  const visibleTabKeys = isDanceVideo || forceDancePractice
    ? ["topics", "dance", "subtitles"]
    : isStudyVideo
      ? ["topics", "transcript", "notes", "bookmarks", "quiz", "subtitles"]
      : ["topics", "transcript", "notes", "bookmarks", "quiz", "dance", "subtitles"];

  useEffect(() => {
    if (!video) return;
    if (isDanceVideo || forceDancePractice) setDanceMode(true);
    if (!visibleTabKeys.includes(leftTab)) {
      setLeftTab(isDanceVideo || forceDancePractice ? "dance" : "topics");
    }
  }, [video, isDanceVideo, forceDancePractice, leftTab, effectiveMode]);

  const loopStep = (step) => {
    clearInterval(loopRef.current);
    seekTo(step.startTime);
    loopRef.current = setInterval(() => {
      const t = playerRef.current?.getCurrentTime?.() || 0;
      if (t >= step.endTime) seekTo(step.startTime);
    }, 500);
  };

  const stopDancerTracking = () => {
    dancerStoppedRef.current = true;
    if (dancerRafRef.current) cancelAnimationFrame(dancerRafRef.current);
    dancerRafRef.current = null;
    dancerScreenStreamRef.current?.getTracks().forEach((t) => t.stop());
    dancerScreenStreamRef.current = null;
    if (dancerScreenVideoRef.current) {
      dancerScreenVideoRef.current.srcObject = null;
      dancerScreenVideoRef.current = null;
    }
    dancerOffscreenRef.current = null;
    const cc = dancerCanvasRef.current;
    if (cc) cc.getContext("2d")?.clearRect(0, 0, cc.width, cc.height);
    setDancerTracking("idle");
    setDancerKpCount(0);
    setPersonCount(0);
  };

  const startDancerTracking = async () => {
    setDancerTracking("requesting");
    dancerStoppedRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 10, max: 15 } },
        audio: false,
      });
      if (dancerStoppedRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }

      dancerScreenStreamRef.current = stream;
      const vid = document.createElement("video");
      vid.srcObject = stream;
      vid.muted = true;
      vid.playsInline = true;
      dancerScreenVideoRef.current = vid;
      await vid.play();

      stream.getVideoTracks()[0].addEventListener("ended", stopDancerTracking);
      setDancerTracking("active");

      const detector = await getMultiDetector();
      if (dancerStoppedRef.current) return;

      const tick = async () => {
        if (dancerStoppedRef.current) return;

        const canvas = dancerCanvasRef.current;
        const playerEl = document.getElementById("yt-player");
        const sv = dancerScreenVideoRef.current;

        if (!canvas || !playerEl || !sv || sv.readyState < 2) {
          dancerRafRef.current = requestAnimationFrame(tick);
          return;
        }

        // Crop capture to player bounds (works identically in fullscreen)
        const rect = playerEl.getBoundingClientRect();
        const scaleX = sv.videoWidth / window.innerWidth;
        const scaleY = sv.videoHeight / window.innerHeight;
        const cropX = Math.max(0, Math.round(rect.left * scaleX));
        const cropY = Math.max(0, Math.round(rect.top * scaleY));
        const cropW = Math.max(1, Math.round(rect.width * scaleX));
        const cropH = Math.max(1, Math.round(rect.height * scaleY));

        const prev = dancerOffscreenRef.current;
        const offscreen = (prev && prev.width === cropW && prev.height === cropH)
          ? prev
          : (() => { const c = document.createElement("canvas"); c.width = cropW; c.height = cropH; dancerOffscreenRef.current = c; return c; })();

        offscreen.getContext("2d").drawImage(sv, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        try {
          const poses = await detector.estimatePoses(offscreen);
          const ctx = canvas.getContext("2d");

          // Canvas is inside .vp-player — use its actual CSS dimensions
          const cw = canvas.offsetWidth || rect.width || 640;
          const ch = canvas.offsetHeight || rect.height || 360;
          if (canvas.width !== cw || canvas.height !== ch) {
            canvas.width = cw;
            canvas.height = ch;
          }
          ctx.clearRect(0, 0, cw, ch);

          if (poses?.length) {
            // Sort poses left-to-right by horizontal center for stable indexing
            const sorted = [...poses].sort((a, b) => {
              const avgX = (p) => {
                const vis = p.keypoints.filter((k) => k.score > 0.2);
                return vis.length ? vis.reduce((s, k) => s + k.x, 0) / vis.length : 0;
              };
              return avgX(a) - avgX(b);
            });

            // Determine which person to highlight
            let activeIdx = 0;
            const selIdx = selectedPersonIdxRef.current;
            if (selIdx < 0 || selIdx >= sorted.length) {
              const cx = cropW / 2;
              let bestDist = Infinity;
              sorted.forEach((pose, i) => {
                const vis = pose.keypoints.filter((k) => k.score > 0.2);
                if (!vis.length) return;
                const avgX = vis.reduce((s, k) => s + k.x, 0) / vis.length;
                const d = Math.abs(avgX - cx);
                if (d < bestDist) { bestDist = d; activeIdx = i; }
              });
            } else {
              activeIdx = selIdx;
            }

            // Draw directly onto player-sized canvas — no translation needed
            const multiPerson = sorted.length > 1;
            const scaleW = cw / cropW;
            const scaleH = ch / cropH;

            sorted.forEach((pose, i) => {
              const isActive = i === activeIdx;
              drawSkeleton(ctx, pose.keypoints, cw, ch, cropW, cropH, {
                line: isActive ? "rgba(238,146,104,0.85)" : "rgba(255,255,255,0.18)",
                dot: isActive ? "rgba(238,146,104,1)" : "rgba(255,255,255,0.28)",
                dotOutline: isActive ? "rgba(255,242,220,0.3)" : "rgba(255,255,255,0.08)",
                lineWidth: isActive ? 3 : 1.5,
                dotRadius: isActive ? 5 : 3,
              });

              if (multiPerson) {
                const vis = pose.keypoints.filter((k) => k.score > 0.2);
                const head = pose.keypoints.find((k) => k.name === "nose" && k.score > 0.2)
                  || vis.sort((a, b) => a.y - b.y)[0];
                if (head) {
                  const lx = head.x * scaleW;
                  const ly = Math.max(14, head.y * scaleH - 14);
                  ctx.save();
                  ctx.font = `bold ${isActive ? 13 : 11}px monospace`;
                  ctx.textAlign = "center";
                  ctx.fillStyle = isActive ? "rgba(238,146,104,0.95)" : "rgba(255,255,255,0.4)";
                  ctx.fillText(String(i + 1), lx, ly);
                  ctx.restore();
                }
              }
            });

            const activePose = sorted[activeIdx];
            setDancerKpCount(activePose ? activePose.keypoints.filter((k) => k.score > 0.2).length : 0);
            setPersonCount(sorted.length);
          } else {
            setDancerKpCount(0);
            setPersonCount(0);
          }
        } catch {}

        dancerRafRef.current = requestAnimationFrame(tick);
      };

      dancerRafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      dancerStoppedRef.current = true;
      const dismissed = err?.name === "NotAllowedError" || err?.name === "AbortError";
      setDancerTracking(dismissed ? "idle" : "error");
    }
  };

  // Cleanup dancer tracking on unmount
  useEffect(() => {
    return () => {
      dancerStoppedRef.current = true;
      if (dancerRafRef.current) cancelAnimationFrame(dancerRafRef.current);
      dancerScreenStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const formatAiError = (err, fallback) => {
    const msg = err?.response?.data?.error || err?.message || fallback;
    if (err?.response?.status === 429 || /quota|too many requests|rate limit/i.test(msg)) {
      return "Gemini quota is temporarily exhausted. Cached content still works, but new AI generation needs a little time.";
    }
    return msg;
  };

  const runDanceAnalysis = async (force = false) => {
    if (analyzingDance) return;
    if (danceSegments.length && !force) {
      toast("Using saved dance sections", { type: "info" });
      return;
    }
    setAnalyzingDance(true);
    try {
      const res = await videoAPI.analyzeDance(videoId, force ? { force: true } : {});
      setDanceSegments([...res.data.segments].sort((a, b) => a.startTime - b.startTime));
      toast(res.data.cached ? "Loaded saved dance sections" : "Dance sections ready", { type: "success" });
    } catch (err) {
      toast(formatAiError(err, "Dance analysis failed"), { type: "error" });
    } finally { setAnalyzingDance(false); }
  };

  const generateCaptionsAuto = async (force = false) => {
    if (generatingCaptions || correctingCaptions || generatingAudioCaptions) return;
    if (correctedCaptions.length && !force) {
      toast("Using saved captions", { type: "info" });
      return;
    }
    setGeneratingCaptions(true); setCaptionError(""); setNoYtCaptions(false);
    try {
      const res = await videoAPI.generateCaptions(videoId, force ? { force: true } : {});
      setCorrectedCaptions(res.data.captions);
      toast(res.data.cached ? "Loaded saved captions" : "Captions ready", { type: "success" });
    } catch (err) {
      const msg = err.response?.data?.error || "Caption generation failed.";
      if (err.response?.status === 422 && msg.toLowerCase().includes("no captions")) {
        setNoYtCaptions(true); setCaptionError("");
      } else { setCaptionError(formatAiError(err, msg)); }
    } finally { setGeneratingCaptions(false); }
  };

  const generateCaptionsFromAudio = async (force = false) => {
    if (generatingAudioCaptions || generatingCaptions || correctingCaptions) return;
    if (correctedCaptions.length && !force) {
      toast("Using saved captions", { type: "info" });
      return;
    }
    setGeneratingAudioCaptions(true); setCaptionError("");
    try {
      const res = await videoAPI.generateCaptionsAudio(videoId, force ? { force: true } : {});
      setCorrectedCaptions(res.data.captions); setNoYtCaptions(false);
      toast(res.data.cached ? "Loaded saved captions" : "Audio captions ready", { type: "success" });
    } catch (err) {
      setCaptionError(formatAiError(err, "Audio transcription failed."));
    } finally { setGeneratingAudioCaptions(false); }
  };

  const translateCaptionsAction = async (language, force = false) => {
    if (translating) return;
    const lang = language || translateLang;
    if (!force && correctedCaptions.length && correctedCaptions.every((c) => c.translatedText && c.translatedLanguage === lang)) {
      setShowTranslated(true);
      toast("Using saved translation", { type: "info" });
      return;
    }
    setTranslating(true); setCaptionError("");
    try {
      const res = await videoAPI.translateCaptions(videoId, lang, force ? { force: true } : {});
      setCorrectedCaptions(res.data.captions); setShowTranslated(true);
      toast(res.data.cached ? "Loaded saved translation" : "Translation ready", { type: "success" });
    } catch (err) {
      setCaptionError(formatAiError(err, "Translation failed."));
    } finally { setTranslating(false); }
  };

  const generateNotesAction = async (force = false) => {
    if (generatingNotes) return;
    if (notes.length && !force) {
      setLeftTab("notes");
      toast("Using saved notes", { type: "info" });
      return;
    }
    setGeneratingNotes(true); setNoteError("");
    try {
      const res = await notesAPI.generate(videoId, force ? { force: true } : {});
      setNotes(res.data.sort((a, b) => a.timestamp - b.timestamp));
      setLeftTab("notes");
      toast("Notes generated", { type: "success" });
    } catch (err) {
      const msg = formatAiError(err, "Auto-note generation failed.");
      setNoteError(msg);
      toast(msg, { type: "error" });
    }
    finally { setGeneratingNotes(false); }
  };

  const correctCaptions = async (force = false) => {
    if (correctingCaptions || generatingCaptions) return;
    const captions = captionInput.split("\n")
      .map((line, i) => ({ startTime: i * 4, endTime: i * 4 + 4, text: line.trim() }))
      .filter((c) => c.text);
    if (correctedCaptions.length && !captions.length && !force) {
      toast("Using saved captions", { type: "info" });
      return;
    }
    setCorrectingCaptions(true); setCaptionError("");
    try {
      const res = await videoAPI.correctCaptions(videoId, captions, force ? { force: true } : {});
      setCorrectedCaptions(res.data.captions);
    } catch (err) {
      setCaptionError(formatAiError(err, "Failed to fix captions."));
    } finally { setCorrectingCaptions(false); }
  };

  const addNote = async () => {
    if (!noteInput.trim()) return;
    const timestamp = Math.floor(currentTime()); setNoteError("");
    try {
      const res = await notesAPI.add(videoId, timestamp, noteInput.trim());
      setNotes((prev) => [...prev, res.data].sort((a, b) => a.timestamp - b.timestamp));
      setNoteInput("");
      toast("Note saved", { type: "success" });
    } catch {
      setNoteError("Failed to save note.");
      toast("Failed to save note", { type: "error" });
    }
  };

  const deleteNote = async (noteId) => {
    setNotes((prev) => prev.filter((n) => n._id !== noteId));
    try { await notesAPI.delete(videoId, noteId); }
    catch {
      notesAPI.list(videoId).then((r) => setNotes(r.data)).catch(() => {});
      toast("Failed to delete note", { type: "error" });
    }
  };

  const addBookmark = async () => {
    const label = bookmarkLabel.trim();
    if (!label) return;
    const timestamp = Math.floor(currentTime()); setBookmarkError("");
    try {
      const res = await bookmarkAPI.add(videoId, timestamp, label);
      setBookmarks((prev) => [...prev, res.data].sort((a, b) => a.timestamp - b.timestamp));
      setBookmarkLabel("");
      toast("Bookmark saved", { type: "success" });
    } catch {
      setBookmarkError("Failed to save bookmark.");
      toast("Failed to save bookmark", { type: "error" });
    }
  };

  const deleteBookmark = async (bookmarkId) => {
    setBookmarks((prev) => prev.filter((b) => b._id !== bookmarkId));
    try { await bookmarkAPI.delete(videoId, bookmarkId); }
    catch {
      bookmarkAPI.list(videoId).then((r) => setBookmarks(r.data)).catch(() => {});
      toast("Failed to delete bookmark", { type: "error" });
    }
  };

  const handleGenerateQuiz = async (force = false) => {
    if (generatingQuiz) return;
    if (quizItems.length && !force) {
      toast("Using saved quiz", { type: "info" });
      return;
    }
    setGeneratingQuiz(true); setQuizIndex(0); setCardFlipped(false);
    try {
      const res = await videoAPI.generateQuiz(videoId, force ? { force: true } : {});
      setQuizItems(res.data.quiz || []);
      toast(res.data.cached ? "Loaded saved quiz" : "Quiz ready", { type: "success" });
    } catch (err) {
      const msg = formatAiError(err, "Quiz generation failed");
      toast(msg, { type: "error" });
    } finally { setGeneratingQuiz(false); }
  };

  const nextCard = () => { setQuizIndex((i) => Math.min(quizItems.length - 1, i + 1)); setCardFlipped(false); };
  const prevCard = () => { setQuizIndex((i) => Math.max(0, i - 1)); setCardFlipped(false); };
  const resetQuiz = () => { setQuizIndex(0); setCardFlipped(false); handleGenerateQuiz(true); };

  const handleExport = () => {
    const lines = [
      `# ${video.title}`, "", `**URL:** ${video.url}`,
      `**Exported:** ${new Date().toLocaleDateString()}`, "", "---", "",
    ];
    if (segments.length > 0) {
      lines.push("## Topic Timeline", "");
      segments.forEach((s) => {
        lines.push(`- **${formatTime(s.startTime)}** — ${s.title}`);
        if (s.summary) lines.push(`  > ${s.summary}`);
      });
      lines.push("", "---", "");
    }
    if (notes.length > 0) {
      lines.push("## My Notes", "");
      notes.forEach((n) => lines.push(`- **${formatTime(n.timestamp)}** — ${n.content}`));
      lines.push("", "---", "");
    }
    if (messages.length > 0) {
      lines.push("## Chat History", "");
      messages.forEach((m) => lines.push(`**${m.role === "user" ? "You" : "Framewise"}:** ${m.content}`, ""));
    }
    lines.push("*Exported from Framewise*");
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(video.title || "framewise").replace(/[^a-z0-9]/gi, "-").toLowerCase()}.md`;
    a.click();
    toast("Notes exported", { type: "success" });
  };

  const downloadTranscript = (format) => {
    const slug = (video.title || "transcript").replace(/[^a-z0-9]/gi, "-").toLowerCase();
    let content, mime, ext;
    if (format === "srt") {
      content = correctedCaptions.map((c, i) => {
        const toSrtTime = (s) => {
          const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), ms = Math.round((s % 1) * 1000);
          return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")},${String(ms).padStart(3,"0")}`;
        };
        return `${i + 1}\n${toSrtTime(c.startTime)} --> ${toSrtTime(c.endTime ?? c.startTime + 3)}\n${c.correctedText || c.text}\n`;
      }).join("\n");
      mime = "text/plain"; ext = "srt";
    } else {
      content = correctedCaptions.map((c) => c.correctedText || c.text).join(" ");
      mime = "text/plain"; ext = "txt";
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = `${slug}.${ext}`;
    a.click();
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || sending) return;
    const userMsg = { role: "user", content: input, _id: Date.now() };
    setMessages((m) => [...m, userMsg]);
    setInput(""); setSending(true);
    try {
      const res = await chatAPI.sendMessage(videoId, input, danceMode || isDanceVideo ? "dance" : "default");
      const assistant = res.data;
      setMessages((m) => [...m, assistant]);
      if (voiceEnabled) {
        try {
          const audioRes = await chatAPI.getVoice(videoId, assistant.content, voiceProfile);
          const blob = new Blob([audioRes.data], { type: "audio/mpeg" });
          audioRef.current?.pause();
          audioRef.current = new Audio(URL.createObjectURL(blob));
          audioRef.current.play();
        } catch {}
      }
      if (assistant.action === "generate_captions") { setLeftTab("subtitles"); generateCaptionsAuto(); }
      if (assistant.action === "translate_captions") translateCaptionsAction(assistant.actionParams?.language);
      if (assistant.action === "generate_quiz") { setLeftTab("quiz"); handleGenerateQuiz(); }
      if (assistant.action === "generate_notes") generateNotesAction();
      if (assistant.action === "summarize") setLeftTab("topics");
    } catch (err) {
      const msg = formatAiError(err, "Chat failed.");
      setMessages((m) => [...m, { role: "assistant", content: msg, _id: `chat-error-${Date.now()}` }]);
      toast(msg, { type: "error" });
    } finally { setSending(false); }
  };

  if (videoLoadError) return (
    <div className="vp-state">
      <p className="vp-state-title">Video not found</p>
      <button className="vp-back-btn" onClick={() => navigate("/app/library")}>
        <Icon name="chevron" size={13} style={{ transform: "rotate(180deg)" }} /> Library
      </button>
    </div>
  );

  if (!video) return (
    <div className="vp-state">
      <span className="vp-state-sub">Loading…</span>
    </div>
  );

  const activeCaption = correctedCaptions.find((c) =>
    playerTime >= Number(c.startTime) && playerTime <= Number(c.endTime)
  );
  const modeLabel = effectiveMode === "dance" ? "Dance Practice" : effectiveMode === "study" ? "Study Queue" : "General";

  const updateModeOverride = async (modeOverride) => {
    setVideo((prev) => prev ? { ...prev, modeOverride } : prev);
    try {
      const res = await videoAPI.updateMode(videoId, modeOverride);
      setVideo(res.data);
      if (modeOverride === "dance") setLeftTab("dance");
      if (modeOverride === "study") setLeftTab("topics");
      const label = modeOverride === "auto" ? "Auto-detect" : modeOverride === "dance" ? "Dance Practice" : "Study Queue";
      toast(`Mode set to ${label}`, { type: "info" });
    } catch {
      videoAPI.get(videoId).then((r) => setVideo(r.data)).catch(() => {});
      toast("Failed to update mode", { type: "error" });
    }
  };

  const ALL_TABS = [
    { key: "topics",     icon: "topics",    label: isDanceVideo ? "Sections" : "Topics", badge: segments.length || null },
    { key: "transcript", icon: "cc",        label: "Transcript", badge: correctedCaptions.length || null },
    { key: "notes",      icon: "notes",     label: "Notes",      badge: notes.length || null },
    { key: "bookmarks",  icon: "bookmark",  label: "Bookmarks",  badge: bookmarks.length || null },
    { key: "quiz",       icon: "quiz",      label: "Quiz",       badge: quizItems.length || null },
    { key: "dance",      icon: "dance",     label: "Practice",   badge: danceSegments.length || null },
    { key: "subtitles",  icon: "speaker",   label: "Subtitles" },
  ];
  const TABS = ALL_TABS.filter((tab) => visibleTabKeys.includes(tab.key));
  const chatSuggestions = isDanceVideo
    ? ["Loop chorus", "Slow hand section", "Hardest move"]
    : ["Summarise", "Quiz me", "Key timestamps"];

  return (
    <div className="vp">
      {/* Page header */}
      <div className="vp-header">
        <div className="vp-header-left">
          <Link
            to={isDanceVideo ? "/app/library?tab=dance" : isStudyVideo ? "/app/library?tab=study" : "/app/library"}
            className="vp-back-btn"
          >
            <Icon name="chevron" size={13} style={{ transform: "rotate(180deg)" }} />
            {isDanceVideo ? "Dance Practice" : isStudyVideo ? "Study Queue" : "Library"}
          </Link>
          <div className="vp-header-title-wrap">
            <h1 className="vp-title">{video.title}</h1>
            <div className="vp-meta-row">
              {segments.length > 0 && (
                <span className="vp-meta-chip">{segments.length} segments</span>
              )}
              {correctedCaptions.length > 0 && (
                <span className="vp-meta-chip">{correctedCaptions.length} cues</span>
              )}
              <span className={`vp-mode-badge${isDanceVideo ? " dance" : isStudyVideo ? " study" : ""}`}>
                <Icon name={isDanceVideo ? "dance" : isStudyVideo ? "queue" : "sparkle"} size={11} />
                {modeLabel}
                {video.modeOverride && video.modeOverride !== "auto" && (
                  <span className="vp-mode-badge-manual">manual</span>
                )}
              </span>
            </div>
          </div>
        </div>
        <div className="vp-header-right">
          <select
            className="vp-mode-select"
            value={video.modeOverride || "auto"}
            onChange={(e) => updateModeOverride(e.target.value)}
            aria-label="Video learning mode"
          >
            <option value="auto">Auto mode</option>
            <option value="study">Study Queue</option>
            <option value="dance">Dance Practice</option>
          </select>
          <button className="vp-icon-btn" aria-label="Export" onClick={handleExport}>
            <Icon name="download" size={14} />
          </button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="vp-grid">
        {/* Left column */}
        <div className="vp-left">
          {/* Player */}
          <div className={`vp-player${mirror ? " mirrored" : ""}`} ref={playerWrapRef}>
            <iframe
              id="yt-player"
              title="video"
              src={`https://www.youtube.com/embed/${extractYouTubeId(video.url)}?enablejsapi=1&origin=${window.location.origin}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
            {activeCaption && (
              <div className="vp-caption-overlay">
                <span className="vp-caption-text">
                  {showTranslated && activeCaption.translatedText
                    ? activeCaption.translatedText
                    : (activeCaption.correctedText || activeCaption.text)}
                </span>
              </div>
            )}
            {dancerTracking === "active" && (
              <>
                <canvas ref={dancerCanvasRef} className="vp-dancer-canvas" />
                <button
                  className="vp-fw-fs-btn"
                  onClick={handlePlayerFullscreen}
                  title={isPlayerFullscreen ? "Exit fullscreen" : "Fullscreen with skeleton overlay"}
                >
                  <Icon name={isPlayerFullscreen ? "compress" : "expand"} size={14} stroke={2} />
                </button>
              </>
            )}
          </div>

          {/* Playback controls */}
          <div className="vp-controls">
            <div className="vp-speed-chips">
              <button className="vp-speed-chip" onClick={() => setSpeed(0.5)}>0.5×</button>
              <button className="vp-speed-chip" onClick={() => setSpeed(0.75)}>0.75×</button>
              <button className="vp-speed-chip" onClick={() => setSpeed(1)}>1×</button>
              <button className="vp-speed-chip" onClick={() => setSpeed(1.5)}>1.5×</button>
            </div>
            <div className="vp-ctrl-right">
              <button className={`vp-ctrl-btn${mirror ? " active" : ""}`} onClick={() => setMirror((v) => !v)}>
                <Icon name="layers" size={12} /> {mirror ? "Unmirror" : "Mirror"}
              </button>
              <button className="vp-ctrl-btn" onClick={stopLoop}>
                Stop loop
              </button>
            </div>
          </div>

          {/* Tool selector */}
          <div className="vp-tool-selector">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                className={`vp-tool-tab${leftTab === tab.key ? " active" : ""}`}
                onClick={() => setLeftTab(tab.key)}
              >
                <Icon name={tab.icon} size={13} />
                <span>{tab.label}</span>
                {tab.badge > 0 && <span className="vp-tool-badge">{tab.badge}</span>}
              </button>
            ))}
          </div>

          {/* Tool panels */}
          <div className="vp-panel">
            <div className="vp-panel-head">
              <span className="vp-panel-title">
                {TABS.find((t) => t.key === leftTab)?.label}
              </span>
              {leftTab === "topics" && segments.length > 0 && (
                <span className="vp-panel-meta">{segments.length} segments · Gemini</span>
              )}
              {leftTab === "transcript" && correctedCaptions.length > 0 && (
                <>
                  <span className="vp-panel-meta">{correctedCaptions.length} cues</span>
                  <button className="vp-text-btn" onClick={() => downloadTranscript("srt")} title="Download as .srt subtitle file">
                    <Icon name="download" size={11} /> SRT
                  </button>
                  <button className="vp-text-btn" onClick={() => downloadTranscript("txt")} title="Download as plain text">
                    <Icon name="download" size={11} /> TXT
                  </button>
                </>
              )}
            </div>

            {/* Topics */}
            {leftTab === "topics" && (
              <div className="vp-seg-list">
                {segmentsLoading
                  ? Array.from({ length: 5 }).map((_, i) => <SkeletonSegment key={i} />)
                  : segments.length === 0
                  ? <div className="vp-empty">No topics yet — the analysis generates this automatically.</div>
                  : segments.map((seg, i) => {
                    const isActive = playerTime >= seg.startTime && (
                      i === segments.length - 1 || playerTime < segments[i + 1].startTime
                    );
                    return (
                      <button key={seg._id} className={`vp-seg${isActive ? " active" : ""}`} onClick={() => seekTo(seg.startTime)}>
                        {isActive && <span className="vp-seg-stripe" />}
                        <span className="vp-seg-num">{String(i + 1).padStart(2, "0")}</span>
                        <span className="vp-seg-tc">{formatTime(seg.startTime)}</span>
                        <div className="vp-seg-body">
                          <p className="vp-seg-title">{seg.title}</p>
                          {seg.summary && <p className="vp-seg-summary">{seg.summary}</p>}
                        </div>
                        <Icon name="chevron" size={12} style={{ color: "var(--fw-ink-3)", flexShrink: 0 }} />
                      </button>
                    );
                  })
                }
              </div>
            )}

            {/* Transcript */}
            {leftTab === "transcript" && (
              <div className="vp-transcript">
                <div className="vp-panel-search-wrap">
                  <Icon name="search" size={12} style={{ color: "var(--fw-ink-3)" }} />
                  <input
                    className="vp-panel-search"
                    value={transcriptSearch}
                    onChange={(e) => setTranscriptSearch(e.target.value)}
                    placeholder="Search transcript…"
                  />
                </div>
                {correctedCaptions.length === 0
                  ? <div className="vp-empty">No transcript yet — generate captions in the Subtitles tab first.</div>
                  : correctedCaptions
                      .filter((c) => !transcriptSearch || (c.correctedText || c.text).toLowerCase().includes(transcriptSearch.toLowerCase()))
                      .map((c) => (
                        <button key={c._id || c.startTime} className="vp-transcript-line" onClick={() => seekTo(c.startTime)}>
                          <span className="vp-seg-tc">{formatTime(c.startTime)}</span>
                          <span className="vp-transcript-text">
                            {highlightText(c.correctedText || c.text, transcriptSearch)}
                          </span>
                        </button>
                      ))
                }
              </div>
            )}

            {/* Notes */}
            {leftTab === "notes" && (
              <div className="vp-notes">
                <div className="vp-add-row">
                  <input
                    className="fw-input"
                    value={noteInput}
                    onChange={(e) => { setNoteInput(e.target.value); setNoteError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && addNote()}
                    placeholder={`Note at ${formatTime(Math.floor(currentTime()))}…`}
                  />
                  <button className="vp-add-btn" onClick={addNote} disabled={!noteInput.trim()}>
                    <Icon name="plus" size={13} />
                  </button>
                </div>
                <button className="vp-ai-btn" onClick={() => generateNotesAction()} disabled={aiBusy}>
                  <Icon name="sparkle" size={12} />
                  {generatingNotes ? "Generating…" : notes.length ? "Use saved AI notes" : "Auto-generate with AI"}
                </button>
                {noteError && <p className="vp-inline-error">{noteError}</p>}
                {notes.length === 0
                  ? <div className="vp-empty">No notes yet. Play the video and add a note above.</div>
                  : notes.map((note) => (
                    <div key={note._id} className="vp-note-item">
                      <button className="vp-tc-btn" onClick={() => seekTo(note.timestamp)}>
                        {formatTime(note.timestamp)}
                      </button>
                      <p className="vp-note-content">{note.content}</p>
                      <button className="vp-del-btn" onClick={() => deleteNote(note._id)}>
                        <Icon name="trash" size={11} />
                      </button>
                    </div>
                  ))
                }
              </div>
            )}

            {/* Bookmarks */}
            {leftTab === "bookmarks" && (
              <div className="vp-bookmarks">
                <div className="vp-add-row">
                  <input
                    className="fw-input"
                    value={bookmarkLabel}
                    onChange={(e) => { setBookmarkLabel(e.target.value); setBookmarkError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && addBookmark()}
                    placeholder="Label this timestamp…"
                    maxLength={120}
                  />
                  <button className="vp-add-btn" onClick={addBookmark} disabled={!bookmarkLabel.trim()}>
                    <Icon name="pin" size={13} />
                  </button>
                </div>
                {bookmarkError && <p className="vp-inline-error">{bookmarkError}</p>}
                {bookmarks.length === 0
                  ? <div className="vp-empty">No bookmarks yet. Pin moments you want to revisit.</div>
                  : bookmarks.map((bm) => (
                    <div key={bm._id} className="vp-note-item">
                      <button className="vp-tc-btn" onClick={() => seekTo(bm.timestamp)}>
                        {formatTime(bm.timestamp)}
                      </button>
                      <p className="vp-note-content">{bm.label}</p>
                      <button className="vp-del-btn" onClick={() => deleteBookmark(bm._id)}>
                        <Icon name="trash" size={11} />
                      </button>
                    </div>
                  ))
                }
              </div>
            )}

            {/* Quiz */}
            {leftTab === "quiz" && (
              <div className="vp-quiz">
                {quizItems.length === 0 ? (
                  <div className="vp-quiz-start">
                    <p className="vp-empty">Generate 8 flashcard-style questions from this video to test your recall.</p>
                    <button className="vp-add-btn vp-add-btn-wide" onClick={() => handleGenerateQuiz()} disabled={aiBusy}>
                      <Icon name="sparkle" size={13} />
                      {generatingQuiz ? "Generating…" : "Generate quiz"}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="vp-quiz-meta">
                      <span className="vp-panel-meta">{quizIndex + 1} / {quizItems.length}</span>
                      <button className="vp-text-btn" onClick={resetQuiz} disabled={aiBusy}>Regenerate</button>
                    </div>
                    <div className={`vp-quiz-card${cardFlipped ? " flipped" : ""}`} onClick={() => setCardFlipped((v) => !v)}>
                      <div className="vp-quiz-face">
                        <span className="vp-quiz-face-label">{cardFlipped ? "Answer" : "Question"}</span>
                        <p className="vp-quiz-text">{cardFlipped ? quizItems[quizIndex].answer : quizItems[quizIndex].question}</p>
                        {!cardFlipped && <span className="vp-quiz-hint">Click to reveal answer</span>}
                        {cardFlipped && quizItems[quizIndex].timestamp != null && (
                          <button className="vp-tc-btn" style={{ marginTop: 12 }}
                            onClick={(e) => { e.stopPropagation(); seekTo(quizItems[quizIndex].timestamp); }}>
                            <Icon name="play" size={10} /> {formatTime(quizItems[quizIndex].timestamp)}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="vp-quiz-nav">
                      <button className="vp-ctrl-btn" onClick={prevCard} disabled={quizIndex === 0}>← Prev</button>
                      <button className="vp-ctrl-btn" onClick={nextCard} disabled={quizIndex === quizItems.length - 1}>Next →</button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Practice (Dance) */}
            {leftTab === "dance" && (
              <div className="vp-dance">
                <div className="vp-practice-tools">
                  <div className="vp-practice-card">
                    <div className="vp-practice-card-head">
                      <span className="vp-practice-kicker">AI choreography</span>
                      <p className="vp-practice-title">Movement timeline</p>
                    </div>
                    <button className="vp-add-btn vp-add-btn-wide vp-practice-primary" onClick={() => runDanceAnalysis()} disabled={aiBusy}>
                      <Icon name="dance" size={13} />
                      {analyzingDance ? "Detecting moves…" : "Detect moves"}
                    </button>
                  </div>
                  <div className="vp-practice-card">
                    <div className="vp-practice-card-head">
                      <span className="vp-practice-kicker">Video pose tracking</span>
                      <p className="vp-practice-title">Dancer skeleton</p>
                    </div>
                    {dancerTracking !== "active" ? (
                      <button
                        className="vp-add-btn vp-add-btn-wide vp-pose-toggle"
                        onClick={startDancerTracking}
                        disabled={dancerTracking === "requesting"}
                      >
                        <Icon name="dance" size={13} />
                        {dancerTracking === "requesting" ? "Waiting for share…" : dancerTracking === "error" ? "Retry" : "Start Pose Tracking"}
                      </button>
                    ) : (
                      <button
                        className="vp-add-btn vp-add-btn-wide vp-pose-toggle active"
                        onClick={stopDancerTracking}
                      >
                        <Icon name="stop" size={13} /> Stop Tracking
                      </button>
                    )}
                    {dancerTracking === "active" && (
                      <div className="vp-dancer-status">
                        <span className="vp-dancer-dot" />
                        {personCount > 0
                          ? `${personCount} ${personCount === 1 ? "person" : "people"} · ${dancerKpCount}/17 joints`
                          : "Detecting…"}
                      </div>
                    )}
                    {dancerTracking === "active" && personCount > 1 && (
                      <div className="vp-dancer-picker">
                        <span className="vp-dancer-picker-label">Track:</span>
                        <button
                          className={`vp-dancer-pick-btn${selectedPersonIdx === -1 ? " active" : ""}`}
                          onClick={() => setSelectedPersonIdx(-1)}
                          title="Auto-select most centered person"
                        >
                          Auto
                        </button>
                        {Array.from({ length: personCount }, (_, i) => (
                          <button
                            key={i}
                            className={`vp-dancer-pick-btn${selectedPersonIdx === i ? " active" : ""}`}
                            onClick={() => setSelectedPersonIdx(i)}
                            title={`Track person ${i + 1} (left to right)`}
                          >
                            {i + 1}
                          </button>
                        ))}
                      </div>
                    )}
                    {dancerTracking === "idle" && (
                      <p className="vp-pose-hint">Overlays a skeleton on the video to show the dancer's moves. Works in fullscreen too.</p>
                    )}
                    {dancerTracking === "error" && (
                      <p className="vp-inline-error">Screen capture cancelled or unavailable.</p>
                    )}
                  </div>
                </div>
                {/* Practice Mode launch */}
                <div style={{ padding: "10px 14px 4px" }}>
                  <button
                    className="vp-add-btn vp-add-btn-wide"
                    style={{ background: "var(--fw-ink)", borderColor: "var(--fw-ink)", color: "var(--fw-bg)", gap: 8 }}
                    onClick={() => setPracticeOpen(true)}
                  >
                    <Icon name="practice" size={13} />
                    {danceSegments.length > 0 ? "Open Practice Mode" : "Open Practice Mode (detect moves first)"}
                  </button>
                </div>
                <div className="vp-seg-list">
                  {danceSegments.length === 0
                    ? <div className="vp-empty">Click "Detect moves" to break down this video's dance steps.</div>
                    : danceSegments.map((step, i) => (
                      <div
                        key={step._id}
                        className="vp-seg"
                        style={{ gridTemplateColumns: "28px auto 1fr auto" }}
                        onClick={() => seekTo(step.startTime)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && seekTo(step.startTime)}
                      >
                        <span className="vp-seg-num">{String(i + 1).padStart(2, "0")}</span>
                        <button
                          className="vp-tc-btn"
                          onClick={(e) => { e.stopPropagation(); seekTo(step.startTime); }}
                          title={`Go to ${formatTime(step.startTime)}`}
                        >
                          {formatTime(step.startTime)}
                        </button>
                        <div className="vp-seg-body">
                          <p className="vp-seg-title">{step.title}</p>
                          {step.movementCue && <p className="vp-seg-summary" style={{ color: "var(--fw-rust)" }}>{step.movementCue}</p>}
                        </div>
                        <button
                          className="vp-loop-btn"
                          onClick={(e) => { e.stopPropagation(); loopStep(step); }}
                          title={`Loop ${formatTime(step.startTime)}–${formatTime(step.endTime)}`}
                        >
                          <Icon name="continue" size={12} />
                        </button>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}

            {/* Subtitles */}
            {leftTab === "subtitles" && (
              <div className="vp-subtitles">
                <div className="vp-subtitle-action-row">
                  <div>
                    <p className="vp-seg-title">Auto-generate from YouTube</p>
                    <p className="vp-seg-summary">Fetches the transcript and applies smart cue splitting.</p>
                  </div>
                  <button className="vp-add-btn" onClick={() => generateCaptionsAuto()}
                    disabled={aiBusy}>
                    {generatingCaptions ? "Fetching…" : correctedCaptions.length ? "Use saved" : "Generate"}
                  </button>
                </div>
                {noYtCaptions && (
                  <div className="vp-subtitle-action-row">
                    <div>
                      <p className="vp-seg-title">Transcribe with ElevenLabs</p>
                      <p className="vp-seg-summary">No YouTube captions found — transcribe audio directly (1–2 min).</p>
                    </div>
                    <button className="vp-add-btn" onClick={() => generateCaptionsFromAudio()} disabled={aiBusy}>
                      {generatingAudioCaptions ? "Transcribing…" : "Transcribe"}
                    </button>
                  </div>
                )}
                {captionError && <p className="vp-inline-error">{captionError}</p>}
                <details className="vp-caption-manual">
                  <summary>Paste transcript manually</summary>
                  <textarea
                    className="vp-caption-textarea"
                    value={captionInput}
                    onChange={(e) => setCaptionInput(e.target.value)}
                    placeholder="Paste subtitles here, one line per caption…"
                  />
                  <button className="vp-add-btn" onClick={() => correctCaptions()} disabled={aiBusy}>
                    {correctingCaptions ? "Fixing…" : "Fix with AI"}
                  </button>
                </details>
                {correctedCaptions.length > 0 && (
                  <div className="vp-caption-list">
                    <div className="vp-caption-toolbar">
                      <span className="vp-panel-meta">{correctedCaptions.length} captions</span>
                      <div className="vp-translate-row">
                        <input
                          className="vp-translate-input fw-input"
                          value={translateLang}
                          onChange={(e) => setTranslateLang(e.target.value)}
                          placeholder="Language"
                        />
                        <button className="vp-ctrl-btn" onClick={() => translateCaptionsAction()} disabled={aiBusy}>
                          {translating ? "Translating…" : "Translate"}
                        </button>
                        {correctedCaptions[0]?.translatedText && (
                          <button className={`vp-ctrl-btn${showTranslated ? " active" : ""}`} onClick={() => setShowTranslated((v) => !v)}>
                            {showTranslated ? "Original" : correctedCaptions[0].translatedLanguage}
                          </button>
                        )}
                      </div>
                    </div>
                    {correctedCaptions.map((c) => (
                      <button key={c._id || `${c.startTime}-${c.endTime}`} className="vp-transcript-line" onClick={() => seekTo(c.startTime)}>
                        <span className="vp-seg-tc">{formatTime(c.startTime)}</span>
                        <span className="vp-transcript-text">
                          {showTranslated && c.translatedText ? c.translatedText : (c.correctedText || c.text)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right column — Chat */}
        <aside className="vp-chat-panel">
          <div className="vp-chat-head">
            <span className="vp-panel-title">Chat</span>
            <div className="vp-chat-toggles">
              <button className={`vp-toggle-btn${voiceEnabled ? " on" : ""}`} onClick={() => {
                setVoiceEnabled((v) => { if (v) audioRef.current?.pause(); return !v; });
              }}>
                <Icon name="speaker" size={11} /> Voice
              </button>
              {isDanceVideo ? (
                <span className="vp-mode-pill">
                  <Icon name="dance" size={11} /> Dance coach
                </span>
              ) : (
                <button className={`vp-toggle-btn${danceMode ? " on" : ""}`} onClick={() => setDanceMode((v) => !v)}>
                  <Icon name="dance" size={11} /> Dance
                </button>
              )}
            </div>
          </div>
          <div className="vp-chat-messages">
            {messages.length === 0 && !sending && (
              <div className="vp-chat-empty">
                {isDanceVideo ? "Ask about timing, loops, sections, or movement details" : "Ask anything about this video"}
              </div>
            )}
            {messages.map((msg) => (
              <div key={msg._id} className={`vp-msg vp-msg-${msg.role}`}>
                <p>{msg.content}</p>
                {msg.linkedSegmentTime != null && (
                  <button className="vp-tc-btn" style={{ marginTop: 6 }} onClick={() => seekTo(msg.linkedSegmentTime)}>
                    <Icon name="play" size={9} /> {formatTime(msg.linkedSegmentTime)}
                  </button>
                )}
              </div>
            ))}
            {sending && (
              <div className="vp-typing"><span /><span /><span /></div>
            )}
            <div ref={chatBottomRef} />
          </div>
          <div className="vp-chat-composer">
            <form onSubmit={sendMessage} className="vp-composer-row">
              <Icon name="sparkle" size={14} style={{ color: "var(--fw-rust)", flexShrink: 0 }} />
              <input
                className="vp-composer-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isDanceVideo ? "Ask your dance coach…" : "Ask anything about this video…"}
                disabled={sending}
              />
              <button type="submit" disabled={sending} className="vp-send-btn">
                <Icon name="send" size={13} />
              </button>
            </form>
            <div className="vp-suggest-chips">
              {chatSuggestions.map((chip) => (
                <button key={chip} className="vp-suggest-chip"
                  onClick={() => { setInput(chip); }}>
                  {chip}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {practiceOpen && (
        <DancePracticeWorkspace
          video={video}
          danceSegments={danceSegments}
          onCoachFeedback={(coachMessage) => {
            if (!coachMessage?.content) return;
            setMessages((items) => {
              if (coachMessage._id && items.some((item) => item._id === coachMessage._id)) return items;
              return [...items, coachMessage];
            });
          }}
          onClose={() => setPracticeOpen(false)}
        />
      )}
    </div>
  );
}

function highlightText(text, query) {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} style={{ background: "var(--fw-peach-soft)", borderRadius: 2, padding: "0 1px" }}>{part}</mark>
      : part
  );
}

function extractYouTubeId(url) {
  const match = url?.match(/(?:v=|youtu\.be\/)([^&?/]+)/);
  return match ? match[1] : "";
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
