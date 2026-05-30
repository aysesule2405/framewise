import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { jobsAPI, videoAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";
import Icon from "../components/Icon";
import { useToast } from "../context/ToastContext";
import "./DashboardPage.css";

const YOUTUBE_RE = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?\s]+)/i;
const POLL_MS = 2000;

const PROMPTS = [
  { icon: "dance",   label: "Practice a dance",  tab: "dance",  q: "dance" },
  { icon: "queue",   label: "Study a lecture",    tab: "study",  q: "lecture" },
  { icon: "clock",   label: "Continue watching",  path: "/app/history" },
  { icon: "library", label: "Browse my library",  path: "/app/library" },
];

function getGreeting(name) {
  const h = new Date().getHours();
  const time = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  const first = (name || "").split(" ")[0];
  return `Good ${time}${first ? `, ${first}` : ""}.`;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [state, setState] = useState("idle"); // idle | analyzing | error
  const [statusMsg, setStatusMsg] = useState("");
  const [recentVideos, setRecentVideos] = useState([]);
  const pollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    videoAPI.list().then((r) => {
      const sorted = [...r.data].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
      setRecentVideos(sorted.slice(0, 4));
    }).catch(() => {});
    return () => clearInterval(pollRef.current);
  }, []);

  const isYouTubeUrl = (v) => YOUTUBE_RE.test(v);

  const submit = async (e) => {
    e.preventDefault();
    const val = input.trim();
    if (!val) return;

    if (isYouTubeUrl(val)) {
      await analyzeUrl(val);
    } else {
      navigate(`/app/library?q=${encodeURIComponent(val)}`);
    }
  };

  const analyzeUrl = async (url) => {
    setState("analyzing");
    setStatusMsg("Reading video…");
    try {
      const res = await videoAPI.analyze(url);
      if (res.data.video?._id) {
        navigate(`/app/video/${res.data.video._id}`);
        return;
      }
      pollJob(res.data.jobId);
    } catch (err) {
      setState("error");
      setStatusMsg(err.response?.data?.error || "Analysis failed. Please try again.");
    }
  };

  const pollJob = (jobId) => {
    clearInterval(pollRef.current);
    const msgs = ["Reading the video…", "Identifying topics…", "Building timeline…", "Almost done…"];
    let i = 0;
    pollRef.current = setInterval(async () => {
      i++;
      if (i % 3 === 0) setStatusMsg(msgs[Math.min(Math.floor(i / 3), msgs.length - 1)]);
      try {
        const { data: job } = await jobsAPI.get(jobId);
        if (job.status === "completed") {
          clearInterval(pollRef.current);
          navigate(`/app/video/${job.result.videoId}`);
        } else if (job.status === "failed") {
          clearInterval(pollRef.current);
          setState("error");
          const msg = job.error || "Analysis failed.";
          setStatusMsg(msg);
          toast(msg, { type: "error" });
        }
      } catch {
        clearInterval(pollRef.current);
        setState("error");
        setStatusMsg("Connection lost. Please try again.");
        toast("Connection lost", { type: "error" });
      }
    }, POLL_MS);
  };

  const handlePrompt = (p) => {
    if (p.path) { navigate(p.path); return; }
    navigate(`/app/library?tab=${p.tab}`);
  };

  const recentVideosToAnalyze = recentVideos.length === 0;

  return (
    <div className="dash">
      {/* Hero */}
      <div className="dash-hero">
        <div className="dash-eyebrow">— What would you like to do?</div>
        <h1 className="dash-title">{getGreeting(user?.displayName)}</h1>
        <p className="dash-sub">
          {recentVideosToAnalyze
            ? "Paste a YouTube URL below to analyze your first video."
            : `You have ${recentVideos.length > 0 ? `${recentVideos.length} recent video${recentVideos.length !== 1 ? "s" : ""}` : "videos"} — or add a new one.`}
        </p>
      </div>

      {/* Chat-style input */}
      <div className="dash-chat-wrap">
        <form className="dash-chat-form" onSubmit={submit}>
          <div className="dash-chat-inner">
            <div className="dash-chat-icon">
              {state === "analyzing"
                ? <span className="dash-spinner" />
                : <Icon name={isYouTubeUrl(input) ? "youtube" : "sparkle"} size={15} style={{ color: isYouTubeUrl(input) ? "var(--fw-rust)" : "var(--fw-ink-3)" }} />
              }
            </div>
            <input
              ref={inputRef}
              className="dash-chat-input"
              type="text"
              placeholder="Paste a YouTube URL, or search your library…"
              value={input}
              onChange={(e) => { setInput(e.target.value); if (state === "error") setState("idle"); }}
              disabled={state === "analyzing"}
              autoFocus
            />
            {input && state !== "analyzing" && (
              <button type="submit" className="dash-chat-send">
                <Icon name={isYouTubeUrl(input) ? "analyze" : "search"} size={14} />
                {isYouTubeUrl(input) ? "Analyze" : "Search"}
              </button>
            )}
          </div>
          {state === "analyzing" && (
            <div className="dash-progress-wrap">
              <div className="dash-progress-bar">
                <div className="dash-progress-fill" />
              </div>
              <span className="dash-progress-label">{statusMsg}</span>
            </div>
          )}
          {state === "error" && (
            <p className="dash-error">{statusMsg}</p>
          )}
        </form>

        {/* Quick-action chips */}
        <div className="dash-chips">
          {PROMPTS.map((p) => (
            <button key={p.label} className="dash-chip" onClick={() => handlePrompt(p)}>
              <Icon name={p.icon} size={13} />
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Recent videos strip */}
      {recentVideos.length > 0 && (
        <section className="dash-recent">
          <div className="dash-recent-head">
            <span className="dash-section-label">— Recent</span>
            <button className="dash-see-all" onClick={() => navigate("/app/library")}>
              All videos <Icon name="arrow" size={11} />
            </button>
          </div>
          <div className="dash-recent-grid">
            {recentVideos.map((v) => (
              <RecentCard key={v._id} v={v} onOpen={() => navigate(`/app/video/${v._id}`)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function RecentCard({ v, onOpen }) {
  const ytId = v.url?.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1];
  const thumb = ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null;
  const mode = v.modeOverride && v.modeOverride !== "auto" ? v.modeOverride : v.detectedMode;
  const modePill = mode === "dance" ? { label: "Dance", icon: "dance", color: "var(--fw-rust)" }
                 : mode === "study" ? { label: "Study", icon: "queue", color: "var(--fw-sage)" }
                 : null;
  const pct = v.durationSeconds > 0 ? Math.round((v.lastPositionSeconds / v.durationSeconds) * 100) : 0;

  return (
    <button className="dash-card" onClick={onOpen}>
      <div className="dash-card-thumb">
        {thumb
          ? <img src={thumb} alt="" />
          : <div className="dash-card-thumb-ph"><Icon name="youtube" size={20} style={{ color: "var(--fw-ink-4)" }} /></div>
        }
        {modePill && (
          <span className="dash-card-mode" style={{ "--pill-color": modePill.color }}>
            <Icon name={modePill.icon} size={10} />
            {modePill.label}
          </span>
        )}
      </div>
      <div className="dash-card-body">
        <p className="dash-card-title">{v.title || "Untitled"}</p>
        {pct > 2 && (
          <div className="dash-card-progress">
            <div className="dash-card-bar" style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
        )}
      </div>
    </button>
  );
}
