import { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { collectionAPI, videoAPI } from "../services/api";
import Icon from "../components/Icon";
import { useToast } from "../context/ToastContext";
import { SkeletonCard, SkeletonRow } from "../components/Skeleton";
import "./LibraryPage.css";

const FOLDER_COLORS = ["#C56A43", "#72875B", "#FEC9AF", "#97AC6D", "#E0A882", "#B5CC92", "#8B6B53"];

function folderColor(name) {
  let n = 0;
  for (let i = 0; i < (name || "").length; i++) n += name.charCodeAt(i);
  return FOLDER_COLORS[n % FOLDER_COLORS.length];
}

function extractYouTubeId(url) {
  const match = url?.match(/(?:v=|youtu\.be\/)([^&?/]+)/);
  return match ? match[1] : null;
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const TABS = [
  { key: "",      label: "All videos",     icon: "library" },
  { key: "dance", label: "Dance Practice", icon: "dance"   },
  { key: "study", label: "Study Queue",    icon: "queue"   },
];

export default function LibraryPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "";
  const initQ = searchParams.get("q") || "";

  const [videos, setVideos] = useState([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [search, setSearch] = useState(initQ);
  const [sort, setSort] = useState("newest");
  const [gridMode, setGridMode] = useState("grid");
  const [collections, setCollections] = useState([]);
  const [activeCollection, setActiveCollection] = useState("");
  const [newCollectionName, setNewCollectionName] = useState("");
  const [collectionError, setCollectionError] = useState("");
  const [draggingVideoId, setDraggingVideoId] = useState(null);
  const [showFolders, setShowFolders] = useState(true);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    collectionAPI.list().then((res) => setCollections(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setVideosLoading(true);
    const timer = setTimeout(() => {
      const req = search.trim()
        ? videoAPI.search(search.trim(), activeCollection)
        : videoAPI.list(activeCollection);
      req.then((res) => setVideos(res.data)).catch(() => {}).finally(() => setVideosLoading(false));
    }, 220);
    return () => clearTimeout(timer);
  }, [search, activeCollection]);

  const setTab = (key) => {
    const next = new URLSearchParams(searchParams);
    if (key) next.set("tab", key); else next.delete("tab");
    next.delete("q");
    setSearchParams(next);
    setSearch("");
  };

  const createCollection = async (e) => {
    e.preventDefault();
    const name = newCollectionName.trim();
    if (!name) return;
    setCollectionError("");
    try {
      const res = await collectionAPI.create(name);
      setCollections((prev) => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCollectionName("");
      toast(`Folder "${name}" created`, { type: "success" });
    } catch (err) {
      const msg = err.response?.data?.error || "Could not create collection";
      setCollectionError(msg);
      toast(msg, { type: "error" });
    }
  };

  const addToCollection = async (collectionId, videoId) => {
    if (!collectionId || !videoId) return;
    try {
      const res = await collectionAPI.addVideo(collectionId, videoId);
      setCollections((prev) => prev.map((c) => c._id === collectionId ? res.data : c));
      setVideos((prev) => prev.map((v) =>
        v._id === videoId
          ? { ...v, collectionIds: Array.from(new Set([...(v.collectionIds || []), collectionId])) }
          : v
      ));
      const col = collections.find((c) => c._id === collectionId);
      if (col) toast(`Added to "${col.name}"`, { type: "success" });
    } catch {
      setCollectionError("Could not add video to collection");
      toast("Could not add to folder", { type: "error" });
    }
  };

  const deleteVideo = async (videoId) => {
    if (!window.confirm("Delete this video and its timeline, chat, captions, notes, and bookmarks?")) return;
    setVideos((prev) => prev.filter((v) => v._id !== videoId));
    try {
      await videoAPI.delete(videoId);
      setCollections((prev) => prev.map((c) => ({
        ...c,
        videoIds: (c.videoIds || []).filter((id) => id !== videoId),
      })));
      toast("Video deleted", { type: "info" });
    } catch {
      const req = search.trim()
        ? videoAPI.search(search.trim(), activeCollection)
        : videoAPI.list(activeCollection);
      req.then((res) => setVideos(res.data)).catch(() => {});
      toast("Failed to delete video", { type: "error" });
    }
  };

  const handleCollectionDrop = async (collectionId, e) => {
    e.preventDefault();
    const videoId = e.dataTransfer.getData("text/plain") || draggingVideoId;
    setDraggingVideoId(null);
    await addToCollection(collectionId, videoId);
  };

  const startRename = (c, e) => {
    e.stopPropagation();
    setRenamingId(c._id);
    setRenameValue(c.name);
  };

  const commitRename = async (collectionId) => {
    const name = renameValue.trim();
    setRenamingId(null);
    if (!name) return;
    const prev = collections.find((c) => c._id === collectionId)?.name;
    if (name === prev) return;
    try {
      const res = await collectionAPI.rename(collectionId, name);
      setCollections((cols) => cols.map((c) => c._id === collectionId ? { ...c, name: res.data.name } : c));
      toast(`Folder renamed to "${name}"`, { type: "success" });
    } catch {
      toast("Failed to rename folder", { type: "error" });
    }
  };

  const deleteCollection = async (collectionId, e) => {
    e.stopPropagation();
    const col = collections.find((c) => c._id === collectionId);
    if (!window.confirm(`Delete folder "${col?.name}"? Videos inside won't be deleted.`)) return;
    setCollections((prev) => prev.filter((c) => c._id !== collectionId));
    if (activeCollection === collectionId) setActiveCollection("");
    try {
      await collectionAPI.delete(collectionId);
      toast(`Folder deleted`, { type: "info" });
    } catch {
      collectionAPI.list().then((r) => setCollections(r.data)).catch(() => {});
      toast("Failed to delete folder", { type: "error" });
    }
  };

  const removeFromCollection = async (collectionId, videoId) => {
    setCollections((prev) => prev.map((c) =>
      c._id === collectionId ? { ...c, videoIds: (c.videoIds || []).filter((id) => id !== videoId) } : c
    ));
    setVideos((prev) => prev.map((v) =>
      v._id === videoId ? { ...v, collectionIds: (v.collectionIds || []).filter((id) => id !== collectionId) } : v
    ));
    try {
      await collectionAPI.removeVideo(collectionId, videoId);
      toast("Removed from folder", { type: "info" });
    } catch {
      collectionAPI.list().then((r) => setCollections(r.data)).catch(() => {});
      toast("Failed to remove from folder", { type: "error" });
    }
  };

  const filtered = useMemo(() => {
    let list = [...videos];
    if (tab === "dance") list = list.filter((v) => {
      const mode = v.modeOverride && v.modeOverride !== "auto" ? v.modeOverride : v.detectedMode;
      return mode === "dance";
    });
    if (tab === "study") list = list.filter((v) => {
      const mode = v.modeOverride && v.modeOverride !== "auto" ? v.modeOverride : v.detectedMode;
      return mode === "study" || mode === "general";
    });
    if (sort === "newest") list = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    else if (sort === "oldest") list = [...list].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    else if (sort === "title") list = [...list].sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    return list;
  }, [videos, sort, tab]);

  const currentTabInfo = TABS.find((t) => t.key === tab) || TABS[0];
  const emptyMsg = tab === "dance"
    ? "No dance videos yet. Analyze a dance video and Framewise will detect it automatically."
    : tab === "study"
    ? "No study videos yet. Analyze an educational video and it'll appear here."
    : search ? "No results for that search." : "No videos yet. Go to Dashboard to add one.";

  return (
    <div className="lib">
      {/* Header */}
      <div className="lib-page-header">
        <div className="lib-page-header-left">
          <div className="lib-eyebrow">— Your videos</div>
          <h1 className="lib-page-title">Library</h1>
        </div>
        <button className="lib-add-btn" onClick={() => navigate("/app")}>
          <Icon name="plus" size={13} /> Add video
        </button>
      </div>

      {/* Mode sub-tabs */}
      <div className="lib-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`lib-tab${tab === t.key ? " active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            <Icon name={t.icon} size={13} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Mode description for filtered tabs */}
      {tab === "dance" && (
        <div className="lib-mode-banner lib-mode-dance">
          <Icon name="dance" size={14} />
          <span>Videos detected or marked as <strong>Dance Practice</strong> — choreography, routines, and movement tutorials.</span>
        </div>
      )}
      {tab === "study" && (
        <div className="lib-mode-banner lib-mode-study">
          <Icon name="queue" size={14} />
          <span>Videos detected or marked as <strong>Study Queue</strong> — lectures, courses, and educational content.</span>
        </div>
      )}

      {/* Folders (all-tab only) */}
      {tab === "" && (
        <section className="lib-section">
          <div className="lib-section-head">
            <div className="lib-section-head-left">
              <h3 className="lib-section-title">Folders</h3>
              {collections.length > 0 && <span className="lib-section-meta">{collections.length}</span>}
              <button className="lib-section-toggle" onClick={() => setShowFolders((v) => !v)}>
                <Icon name="chevronDown" size={12} style={{ transform: showFolders ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .15s" }} />
              </button>
            </div>
            <form onSubmit={createCollection} className="lib-folder-form">
              <input
                className="fw-input lib-folder-input"
                value={newCollectionName}
                onChange={(e) => { setNewCollectionName(e.target.value); setCollectionError(""); }}
                placeholder="New folder…"
                maxLength={80}
              />
              <button type="submit" className="lib-folder-btn">+ Add</button>
            </form>
          </div>
          {collectionError && <p className="lib-collection-error">{collectionError}</p>}
          {showFolders && (
            collections.length === 0
              ? <p className="lib-folder-empty">Create folders to organise your library.</p>
              : <div className="lib-grid-4">
                  {collections.map((c) => (
                    <FolderCard
                      key={c._id}
                      c={c}
                      active={activeCollection === c._id}
                      droppable={!!draggingVideoId}
                      renaming={renamingId === c._id}
                      renameValue={renameValue}
                      onRenameChange={(v) => setRenameValue(v)}
                      onClick={() => setActiveCollection((cur) => cur === c._id ? "" : c._id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleCollectionDrop(c._id, e)}
                      onRename={(e) => startRename(c, e)}
                      onRenameCommit={() => commitRename(c._id)}
                      onDelete={(e) => deleteCollection(c._id, e)}
                    />
                  ))}
                </div>
          )}
        </section>
      )}

      {/* Videos */}
      <section className="lib-section">
        <div className="lib-section-head">
          <div className="lib-section-head-left">
            <h3 className="lib-section-title">
              {activeCollection
                ? collections.find((c) => c._id === activeCollection)?.name || "Collection"
                : currentTabInfo.label}
            </h3>
            {filtered.length > 0 && (
              <span className="lib-section-meta">{filtered.length} video{filtered.length !== 1 ? "s" : ""}</span>
            )}
          </div>
          <div className="lib-section-head-right">
            <input
              className="lib-search"
              type="search"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="lib-sort">
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="title">A → Z</option>
            </select>
            {tab === "" && collections.length > 0 && (
              <select value={activeCollection} onChange={(e) => setActiveCollection(e.target.value)} className="lib-sort">
                <option value="">All folders</option>
                {collections.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            )}
            <div className="lib-view-toggle">
              <button className={`lib-view-btn${gridMode === "grid" ? " active" : ""}`} onClick={() => setGridMode("grid")} aria-label="Grid view">
                <Icon name="grid" size={13} />
              </button>
              <button className={`lib-view-btn${gridMode === "list" ? " active" : ""}`} onClick={() => setGridMode("list")} aria-label="List view">
                <Icon name="list" size={13} />
              </button>
            </div>
          </div>
        </div>

        {videosLoading ? (
          gridMode === "grid" ? (
            <div className="lib-grid-4">
              {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : (
            <div className="lib-list">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
            </div>
          )
        ) : filtered.length === 0 ? (
          <div className="lib-empty">
            <Icon name={tab === "dance" ? "dance" : tab === "study" ? "queue" : search ? "search" : "library"} size={28} style={{ color: "var(--fw-ink-4)", marginBottom: 12 }} />
            <p className="lib-empty-title">{search ? "No results" : "Nothing here yet"}</p>
            <p className="lib-empty-sub">{emptyMsg}</p>
          </div>
        ) : gridMode === "grid" ? (
          <div className="lib-grid-4">
            {filtered.map((v) => (
              <VideoCard
                key={v._id} v={v} collections={collections}
                activeCollection={activeCollection}
                onOpen={() => navigate(`/app/video/${v._id}`)}
                onDelete={deleteVideo} onAddToCollection={addToCollection}
                onRemoveFromCollection={removeFromCollection}
                onDragStart={setDraggingVideoId} onDragEnd={() => setDraggingVideoId(null)}
              />
            ))}
          </div>
        ) : (
          <div className="lib-list">
            {filtered.map((v) => (
              <VideoRow
                key={v._id} v={v} collections={collections}
                activeCollection={activeCollection}
                onOpen={() => navigate(`/app/video/${v._id}`)}
                onDelete={deleteVideo} onAddToCollection={addToCollection}
                onRemoveFromCollection={removeFromCollection}
                onDragStart={setDraggingVideoId} onDragEnd={() => setDraggingVideoId(null)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function FolderCard({
  c, active, droppable, renaming, renameValue,
  onClick, onDragOver, onDrop,
  onRename, onRenameChange, onRenameCommit, onDelete,
}) {
  const color = folderColor(c.name);

  if (renaming) {
    return (
      <div className="lib-folder-card lib-folder-renaming">
        <span className="lib-folder-dot" style={{ background: color }} />
        <input
          className="lib-folder-rename-input"
          autoFocus
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onBlur={onRenameCommit}
          onKeyDown={(e) => { if (e.key === "Enter") onRenameCommit(); if (e.key === "Escape") onRenameCommit(); }}
          maxLength={80}
        />
      </div>
    );
  }

  return (
    <div
      className={`lib-folder-card${active ? " active" : ""}${droppable ? " droppable" : ""}`}
      onClick={onClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <span className="lib-folder-dot" style={{ background: color }} />
      <span className="lib-folder-name">{c.name}</span>
      <span className="lib-folder-count">{c.videoIds?.length || 0}</span>
      <span className="lib-folder-actions" onClick={(e) => e.stopPropagation()}>
        <button className="lib-folder-action-btn" title="Rename" onClick={onRename}>✎</button>
        <button className="lib-folder-action-btn lib-folder-action-del" title="Delete folder" onClick={onDelete}>✕</button>
      </span>
    </div>
  );
}

function VideoCard({ v, collections, activeCollection, onOpen, onDelete, onAddToCollection, onRemoveFromCollection, onDragStart, onDragEnd }) {
  const ytId = extractYouTubeId(v.url);
  const thumb = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null;
  const hasProgress = Number(v.lastPositionSeconds) > 5;
  const duration = v.duration ? formatTime(v.duration) : null;
  const progressPct = hasProgress && v.duration
    ? Math.min(100, (Number(v.lastPositionSeconds) / Number(v.duration)) * 100)
    : 0;
  const segCount = v.segments?.length || v.topics?.length || 0;
  const dateStr = new Date(v.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div
      className="lib-card"
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", v._id); onDragStart(v._id); }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
    >
      <div className="lib-card-thumb">
        {thumb
          ? <img src={thumb} alt={v.title} loading="lazy" />
          : <div className="lib-card-thumb-fallback">
              <Icon name="youtube" size={22} style={{ color: "rgba(255,242,224,.4)" }} />
            </div>
        }
        <div className="lib-card-thumb-overlay" />

        {segCount > 0 && (
          <div className="lib-card-chip lib-card-chip-tl">
            <span className="lib-card-chip-dot" />
            <span>{segCount} CHAPTERS</span>
          </div>
        )}
        {duration && (
          <div className="lib-card-chip lib-card-chip-tr">{duration}</div>
        )}
        <div className="lib-card-play">
          <Icon name="play" size={14} />
        </div>
        {hasProgress && progressPct > 0 && (
          <div className="lib-card-progress-bar">
            <div className="lib-card-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
        )}
      </div>

      <div className="lib-card-body">
        <p className="lib-card-title">{v.title || "Untitled video"}</p>
        <div className="lib-card-meta">
          <span className="lib-card-date">{dateStr}</span>
          {hasProgress
            ? <span className="lib-card-badge lib-card-badge-rust">
                <Icon name="play" size={9} /> {formatTime(v.lastPositionSeconds)}
              </span>
            : <span className="lib-card-badge lib-card-badge-sage">
                <span className="lib-card-badge-dot" /> READY
              </span>
          }
        </div>
        <div className="lib-card-actions" onClick={(e) => e.stopPropagation()}>
          {activeCollection ? (
            <button className="lib-card-remove-folder" onClick={(e) => { e.stopPropagation(); onRemoveFromCollection(activeCollection, v._id); }} title="Remove from folder">
              ✕ Remove
            </button>
          ) : collections.length > 0 && (
            <select
              className="lib-card-select"
              defaultValue=""
              onChange={(e) => { onAddToCollection(e.target.value, v._id); e.target.value = ""; }}
            >
              <option value="" disabled>Add to folder</option>
              {collections.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          )}
          <button className="lib-card-delete" onClick={(e) => { e.stopPropagation(); onDelete(v._id); }}>
            <Icon name="trash" size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}

function VideoRow({ v, collections, activeCollection, onOpen, onDelete, onAddToCollection, onRemoveFromCollection, onDragStart, onDragEnd }) {
  const ytId = extractYouTubeId(v.url);
  const thumb = ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null;
  const hasProgress = Number(v.lastPositionSeconds) > 5;
  const segCount = v.segments?.length || v.topics?.length || 0;
  const dateStr = new Date(v.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div
      className="lib-row"
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", v._id); onDragStart(v._id); }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
    >
      <div className="lib-row-thumb">
        {thumb
          ? <img src={thumb} alt={v.title} loading="lazy" />
          : <div className="lib-row-thumb-fallback"><Icon name="youtube" size={16} /></div>
        }
      </div>
      <div className="lib-row-body">
        <p className="lib-row-title">{v.title || "Untitled video"}</p>
        <div className="lib-row-meta">
          <span className="lib-card-date">{dateStr}</span>
          {segCount > 0 && <span className="lib-section-meta">{segCount} chapters</span>}
        </div>
      </div>
      <div className="lib-row-right" onClick={(e) => e.stopPropagation()}>
        {hasProgress && (
          <span className="lib-card-badge lib-card-badge-rust">
            <Icon name="play" size={9} /> {formatTime(v.lastPositionSeconds)}
          </span>
        )}
        {activeCollection ? (
          <button className="lib-card-remove-folder" onClick={(e) => { e.stopPropagation(); onRemoveFromCollection(activeCollection, v._id); }} title="Remove from folder">
            ✕ Remove
          </button>
        ) : collections.length > 0 && (
          <select
            className="lib-card-select"
            defaultValue=""
            onChange={(e) => { onAddToCollection(e.target.value, v._id); e.target.value = ""; }}
          >
            <option value="" disabled>Folder</option>
            {collections.map((c) => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
        )}
        <button className="lib-card-delete" onClick={(e) => { e.stopPropagation(); onDelete(v._id); }}>
          <Icon name="trash" size={11} />
        </button>
      </div>
    </div>
  );
}
