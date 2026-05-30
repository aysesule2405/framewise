import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { videoAPI } from "../services/api";
import Icon from "../components/Icon";
import "./HistoryPage.css";

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    videoAPI.list().then((r) => {
      setVideos(r.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const inProgress = useMemo(() =>
    videos
      .filter((v) => Number(v.lastPositionSeconds) > 5)
      .sort((a, b) => new Date(b.lastWatchedAt || b.updatedAt || b.createdAt) - new Date(a.lastWatchedAt || a.updatedAt || a.createdAt)),
    [videos]
  );

  const recent = useMemo(() => {
    const cutoff = Date.now() - 1000 * 60 * 60 * 24 * 14;
    const inProgressIds = new Set(inProgress.map((v) => v._id));
    return videos
      .filter((v) => {
        const created = new Date(v.createdAt).getTime();
        return Number.isFinite(created) && created > cutoff && !inProgressIds.has(v._id);
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [videos, inProgress]);

  if (loading) {
    return (
      <div className="hist">
        <div className="hist-state">Loading history…</div>
      </div>
    );
  }

  const empty = inProgress.length === 0 && recent.length === 0;

  return (
    <div className="hist">
      <div className="hist-header">
        <div className="hist-eyebrow">— Your activity</div>
        <h1 className="hist-title">History</h1>
        <p className="hist-sub">Videos you've started or added recently.</p>
      </div>

      {empty ? (
        <div className="hist-empty">
          <Icon name="clock" size={32} style={{ color: "var(--fw-ink-4)", marginBottom: 14 }} />
          <p className="hist-empty-title">Nothing here yet</p>
          <p className="hist-empty-sub">Start watching a video and it'll show up here.</p>
          <button className="hist-cta" onClick={() => navigate("/app")}>
            Add a video <Icon name="arrow" size={12} />
          </button>
        </div>
      ) : (
        <>
          {inProgress.length > 0 && (
            <section className="hist-section">
              <div className="hist-section-head">
                <h2 className="hist-section-title">In progress</h2>
                <span className="hist-section-count">{inProgress.length}</span>
              </div>
              <div className="hist-list">
                {inProgress.map((v) => (
                  <HistoryRow key={v._id} v={v} onOpen={() => navigate(`/app/video/${v._id}`)} />
                ))}
              </div>
            </section>
          )}

          {recent.length > 0 && (
            <section className="hist-section">
              <div className="hist-section-head">
                <h2 className="hist-section-title">Recently added</h2>
                <span className="hist-section-count">{recent.length}</span>
              </div>
              <div className="hist-list">
                {recent.map((v) => (
                  <HistoryRow key={v._id} v={v} onOpen={() => navigate(`/app/video/${v._id}`)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function HistoryRow({ v, onOpen }) {
  const ytId = v.url?.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1];
  const thumb = ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null;
  const mode = v.modeOverride && v.modeOverride !== "auto" ? v.modeOverride : v.detectedMode;
  const pct = v.durationSeconds > 0 ? Math.round((v.lastPositionSeconds / v.durationSeconds) * 100) : 0;
  const showProgress = pct > 2;

  return (
    <button className="hist-row" onClick={onOpen}>
      <div className="hist-row-thumb">
        {thumb
          ? <img src={thumb} alt="" />
          : <div className="hist-row-thumb-ph"><Icon name="youtube" size={16} style={{ color: "var(--fw-ink-4)" }} /></div>
        }
        {showProgress && (
          <div className="hist-row-bar-wrap">
            <div className="hist-row-bar" style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
        )}
      </div>
      <div className="hist-row-info">
        <p className="hist-row-title">{v.title || "Untitled"}</p>
        <div className="hist-row-meta">
          {mode && mode !== "general" && (
            <span className={`hist-row-pill ${mode}`}>
              <Icon name={mode === "dance" ? "dance" : "queue"} size={10} />
              {mode === "dance" ? "Dance" : "Study"}
            </span>
          )}
          {showProgress && (
            <span className="hist-row-time">
              <Icon name="clock" size={11} />
              {formatTime(v.lastPositionSeconds)} · {pct}%
            </span>
          )}
          <span className="hist-row-age">{timeAgo(v.lastWatchedAt || v.updatedAt || v.createdAt)}</span>
        </div>
      </div>
      <Icon name="chevron" size={13} style={{ color: "var(--fw-ink-4)", flexShrink: 0 }} />
    </button>
  );
}
