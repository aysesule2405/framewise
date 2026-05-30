import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../hooks/useTheme";
import { api, authAPI } from "../services/api";
import Icon from "../components/Icon";
import { useToast } from "../context/ToastContext";
import "./SettingsPage.css";

const TABS = [
  { key: "profile",     label: "Profile",     meta: "name · avatar" },
  { key: "preferences", label: "Preferences",  meta: "theme · density" },
  { key: "learning",    label: "Learning",     meta: "voice · resume" },
  { key: "extension",   label: "Extension",    meta: "browser · sync" },
];

export default function SettingsPage() {
  const { user, login, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => searchParams.get("tab") || "profile");
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [learningGoal, setLearningGoal] = useState(user?.learningGoal || "");
  const [avatarColor, setAvatarColor] = useState(user?.avatarColor || "rust");
  const [voiceReplies, setVoiceReplies] = useState(() => localStorage.getItem("fw_voice_replies") !== "off");
  const [voiceProfile, setVoiceProfile] = useState(() => localStorage.getItem("fw_voice_profile") || "default");
  const [autoResume, setAutoResume] = useState(() => localStorage.getItem("fw_auto_resume") !== "off");
  const [density, setDensity] = useState(() => localStorage.getItem("fw_density") || "default");
  const [defaultMode, setDefaultMode] = useState(() => localStorage.getItem("fw_default_mode") || "auto");
  const [timelineStyle, setTimelineStyle] = useState(() => localStorage.getItem("fw_timeline_style") || "adaptive");
  const [captionAutoInject, setCaptionAutoInject] = useState(() => localStorage.getItem("fw_caption_auto_inject") === "on");
  const [captionLanguage, setCaptionLanguage] = useState(() => localStorage.getItem("fw_caption_language") || "Spanish");
  const [extensionAutoOpen, setExtensionAutoOpen] = useState(() => localStorage.getItem("fw_extension_auto_open") !== "off");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [apiStatus, setApiStatus] = useState("checking"); // "checking" | "ok" | "error"
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    api.get("/health")
      .then(() => setApiStatus("ok"))
      .catch(() => setApiStatus("error"));
  }, []);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName || "");
    setBio(user.bio || "");
    setLearningGoal(user.learningGoal || "");
    setAvatarColor(user.avatarColor || "rust");
  }, [user]);

  const initials = (user?.displayName || user?.email || "?")
    .split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setSaving(true); setError(""); setSaved(false);
    try {
      const res = await authAPI.updateMe({
        displayName: displayName.trim(),
        bio,
        learningGoal,
        avatarColor,
      });
      const existingToken = localStorage.getItem("fw_token");
      if (existingToken) login(existingToken, res.data);
      setSaved(true);
      toast("Profile saved", { type: "success" });
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      const msg = err.response?.data?.error || "Failed to save changes";
      setError(msg);
      toast(msg, { type: "error" });
    } finally { setSaving(false); }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      await authAPI.deleteMe();
      logout();
    } catch (err) {
      const msg = err.response?.data?.error || "Failed to delete account";
      setDeleteError(msg);
      toast(msg, { type: "error" });
      setDeleting(false);
    }
  };

  const setPref = (key, value) => {
    localStorage.setItem(key, value);
    window.dispatchEvent(new CustomEvent("fw-preference-change", { detail: { key, value } }));
  };

  return (
    <div className="st">
      {/* Header */}
      <div className="st-header">
        <div className="st-eyebrow">— Control room</div>
        <h1 className="st-title">
          Tune Framewise for the way you{" "}
          <em className="st-italic">watch, study,</em> and practice.
        </h1>
      </div>

      {/* Hairline tabs */}
      <div className="st-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`st-tab${activeTab === tab.key ? " active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span className="st-tab-label">{tab.label}</span>
            <span className="st-tab-meta">{tab.meta}</span>
          </button>
        ))}
      </div>

      {/* Body — two columns */}
      <div className="st-body">
        <div className="st-main">

          {/* Profile */}
          {activeTab === "profile" && (
            <StGroup label="Profile" sub="Who you are inside Framewise.">
              <div className="st-profile-row">
                <div className={`st-avatar-lg ${avatarColor}`}>{initials}</div>
                <div className="st-profile-info">
                  <div className="st-profile-name">{user?.displayName || user?.email || "—"}</div>
                  <div className="st-profile-email">{user?.email}</div>
                  <div className="st-profile-actions">
                    {confirmSignOut ? (
                      <>
                        <span className="st-hint" style={{ marginRight: 8 }}>Sign out of Framewise?</span>
                        <button className="st-btn st-btn-danger" onClick={logout}>Yes, sign out</button>
                        <button className="st-btn st-btn-ghost" onClick={() => setConfirmSignOut(false)}>Cancel</button>
                      </>
                    ) : (
                      <button className="st-btn st-btn-ghost" onClick={() => setConfirmSignOut(true)}>Sign out</button>
                    )}
                  </div>
                </div>
              </div>

              <form onSubmit={handleSave} className="st-form">
                <StField label="DISPLAY NAME">
                  <input
                    className="fw-input"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your display name"
                    maxLength={50}
                  />
                </StField>
                <StField label="EMAIL · LOCKED" hint="Email cannot be changed. Contact support to migrate.">
                  <input
                    className="fw-input"
                    type="email"
                    value={user?.email || ""}
                    disabled
                    style={{ opacity: .6 }}
                  />
                </StField>
                <StField label="BIO">
                  <textarea
                    className="fw-input st-textarea"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="A short note about what you use Framewise for"
                    maxLength={160}
                  />
                </StField>
                <StField label="LEARNING GOAL">
                  <input
                    className="fw-input"
                    value={learningGoal}
                    onChange={(e) => setLearningGoal(e.target.value)}
                    placeholder="e.g. Practice dance covers 4x/week"
                    maxLength={160}
                  />
                </StField>
                <StField label="AVATAR COLOR">
                  <StSwatches
                    options={[
                      ["rust", "Rust"],
                      ["sage", "Sage"],
                      ["peach", "Peach"],
                      ["cocoa", "Cocoa"],
                    ]}
                    active={avatarColor}
                    onChange={setAvatarColor}
                  />
                </StField>
                {error && <p className="st-error">{error}</p>}
                {saved && <p className="st-success">Changes saved.</p>}
                <button type="submit" disabled={saving} className="st-btn st-btn-primary">
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </form>
            </StGroup>
          )}

          {/* Preferences */}
          {activeTab === "preferences" && (
            <StGroup label="Preferences" sub="How Framewise looks and feels.">
              <StRow label="Theme" hint="Used by both the web app and extension.">
                <StSeg
                  options={["Light", "Dark"]}
                  active={theme === "dark" ? "Dark" : "Light"}
                  onChange={(v) => { setTheme(v.toLowerCase()); toast(`Theme set to ${v}`, { type: "info" }); }}
                />
              </StRow>
              <StRow label="Density" hint="Tighter rows, smaller thumbnails.">
                <StSeg
                  options={["Cozy", "Default", "Compact"]}
                  active={density === "cozy" ? "Cozy" : density === "compact" ? "Compact" : "Default"}
                  onChange={(v) => { const k = v.toLowerCase(); setDensity(k); setPref("fw_density", k); }}
                />
              </StRow>
              <StRow label="Default video mode" hint="Used when AI confidence is low.">
                <StSeg
                  options={["Auto", "Study", "Dance"]}
                  active={defaultMode === "study" ? "Study" : defaultMode === "dance" ? "Dance" : "Auto"}
                  onChange={(v) => { const k = v.toLowerCase(); setDefaultMode(k); setPref("fw_default_mode", k); }}
                />
              </StRow>
              <StRow label="Timeline style" hint="Choose how detailed generated sections feel.">
                <StSeg
                  options={["Adaptive", "Dense", "Minimal"]}
                  active={timelineStyle === "dense" ? "Dense" : timelineStyle === "minimal" ? "Minimal" : "Adaptive"}
                  onChange={(v) => { const k = v.toLowerCase(); setTimelineStyle(k); setPref("fw_timeline_style", k); }}
                />
              </StRow>
            </StGroup>
          )}

          {/* Learning */}
          {activeTab === "learning" && (
            <StGroup label="Learning" sub="Habits, voice, and how you pick up where you left off.">
              <StRow label="Voice replies" hint="ElevenLabs reads every AI answer aloud.">
                <StToggle
                  on={voiceReplies}
                  onChange={(v) => { setVoiceReplies(v); setPref("fw_voice_replies", v ? "on" : "off"); toast(v ? "Voice replies on" : "Voice replies off", { type: "info" }); }}
                />
              </StRow>
              <StRow label="Coach voice" hint="Choose which ElevenLabs voice Framewise uses for spoken replies.">
                <StSeg
                  options={["Narrator", "Coach"]}
                  active={voiceProfile === "coach" ? "Coach" : "Narrator"}
                  onChange={(v) => {
                    const preset = v === "Coach" ? "coach" : "default";
                    setVoiceProfile(preset);
                    setPref("fw_voice_profile", preset);
                    toast(`${v} voice selected`, { type: "success" });
                  }}
                />
              </StRow>
              <StRow label="Auto-resume" hint="Pick up where you left off in each video.">
                <StToggle
                  on={autoResume}
                  onChange={(v) => { setAutoResume(v); setPref("fw_auto_resume", v ? "on" : "off"); toast(v ? "Auto-resume on" : "Auto-resume off", { type: "info" }); }}
                />
              </StRow>
              <StRow label="Caption language" hint="Default target for translated subtitles.">
                <input
                  className="fw-input st-compact-input"
                  value={captionLanguage}
                  onChange={(e) => { setCaptionLanguage(e.target.value); setPref("fw_caption_language", e.target.value); }}
                  placeholder="Spanish"
                />
              </StRow>
              <StRow label="Practice loop" hint="Default loop length when you tap a chapter.">
                <StSeg options={["Chapter", "30s", "60s"]} active="Chapter" onChange={() => {}} />
              </StRow>
            </StGroup>
          )}

          {/* Extension */}
          {activeTab === "extension" && (
            <StGroup label="Extension" sub="The YouTube side panel.">
              <div className="st-ext-card">
                <Icon name="extension" size={22} style={{ color: "var(--fw-sage)" }} />
                <div className="st-ext-info">
                  <div className="st-ext-title">Chrome · connected</div>
                  <div className="st-ext-meta">v 0.2.1 · last sync 2 min ago</div>
                </div>
                <div className="st-ext-actions">
                  <button className="st-btn">Re-sync</button>
                  <button className="st-btn st-btn-ghost">Disconnect</button>
                </div>
              </div>
              <StRow label="Auto-open on YouTube" hint="Show the panel whenever you land on a video page.">
                <StToggle
                  on={extensionAutoOpen}
                  onChange={(v) => { setExtensionAutoOpen(v); setPref("fw_extension_auto_open", v ? "on" : "off"); }}
                />
              </StRow>
              <StRow label="Caption injection" hint="Default to injecting generated Framewise captions into YouTube.">
                <StToggle
                  on={captionAutoInject}
                  onChange={(v) => {
                    setCaptionAutoInject(v);
                    setPref("fw_caption_auto_inject", v ? "on" : "off");
                    toast(v ? "Extension captions will auto-inject after generation" : "Extension captions will wait for manual injection", { type: "info" });
                  }}
                />
              </StRow>
              <StRow label="Extension voice" hint="The side panel uses the same selected coach voice when possible.">
                <StSeg
                  options={["Narrator", "Coach"]}
                  active={voiceProfile === "coach" ? "Coach" : "Narrator"}
                  onChange={(v) => {
                    const preset = v === "Coach" ? "coach" : "default";
                    setVoiceProfile(preset);
                    setPref("fw_voice_profile", preset);
                  }}
                />
              </StRow>
              <p className="st-hint">
                The extension also exposes caption injection inside its Captions section. Load the <code>extension/</code> folder in Chrome Developer Mode, then sign in here before opening the side panel.
              </p>
            </StGroup>
          )}
        </div>

        {/* Right rail */}
        <aside className="st-rail">
          <div className="st-rail-card">
            <span className="st-eyebrow" style={{ display: "block", marginBottom: 12 }}>— You, in numbers</span>
            <div className="st-stats-grid">
              <BigStat n="7"    l="videos" />
              <BigStat n="4"    l="in progress" />
              <BigStat n="36"   l="chapters" />
              <BigStat n="2:47" l="today" mono />
            </div>
            <hr className="st-rule" />
            <div className="st-facts">
              <span><span className="st-fact-dot sage" />watching since Nov 2025</span>
              <span><span className="st-fact-dot sage" />92% sessions resumed</span>
              <span><span className="st-fact-dot rust" />longest streak — 14 days</span>
            </div>
          </div>

          <div className="st-rail-card">
            <span className="st-eyebrow" style={{ display: "block", marginBottom: 12 }}>— Storage</span>
            <div className="st-storage-row">
              <span className="st-storage-label">Transcripts &amp; chat</span>
              <span className="st-meta-chip">142 MB</span>
            </div>
            <div className="st-storage-bar">
              <span style={{ width: "38%", background: "var(--fw-rust)" }} />
              <span style={{ width: "22%", background: "var(--fw-sage)" }} />
              <span style={{ width: "8%",  background: "var(--fw-peach)" }} />
            </div>
            <div className="st-storage-legend">
              <span><span className="st-swatch" style={{ background: "var(--fw-rust)" }} />Chat</span>
              <span><span className="st-swatch" style={{ background: "var(--fw-sage)" }} />Transcripts</span>
              <span><span className="st-swatch" style={{ background: "var(--fw-peach)" }} />Cache</span>
            </div>
            <button className="st-btn st-btn-ghost st-danger-link">
              <Icon name="trash" size={12} /> Clear cache
            </button>
          </div>

          <div className="st-rail-card">
            <span className="st-eyebrow" style={{ display: "block", marginBottom: 12 }}>— API status</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--fw-ink-2)" }}>
              <span
                style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                  background: apiStatus === "ok" ? "var(--fw-sage)" : apiStatus === "error" ? "var(--fw-err)" : "var(--fw-ink-4)",
                  boxShadow: apiStatus === "ok" ? "0 0 0 3px rgba(107,153,125,.18)" : "none",
                }}
              />
              {apiStatus === "ok"       ? "Backend connected"
               : apiStatus === "error" ? "Backend unreachable"
               :                         "Checking…"}
            </div>
          </div>

          <div className="st-rail-card st-danger-card">
            <span className="st-eyebrow" style={{ display: "block", marginBottom: 8 }}>— Danger zone</span>
            <p className="st-rail-body">Permanently delete your account, all videos, transcripts, and chat history.</p>
            {confirmDelete ? (
              <>
                <p className="st-rail-body" style={{ color: "var(--fw-err)", marginTop: 6, marginBottom: 8 }}>
                  This cannot be undone. Are you sure?
                </p>
                {deleteError && <p style={{ fontSize: 12, color: "var(--fw-err)", marginBottom: 8 }}>{deleteError}</p>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="st-btn st-btn-danger" onClick={handleDeleteAccount} disabled={deleting}>
                    {deleting ? "Deleting…" : "Yes, delete everything"}
                  </button>
                  <button className="st-btn st-btn-ghost" onClick={() => { setConfirmDelete(false); setDeleteError(""); }} disabled={deleting}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <button className="st-btn st-btn-danger" onClick={() => setConfirmDelete(true)}>Delete my account</button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function StGroup({ label, sub, children }) {
  return (
    <section className="st-group">
      <div className="st-group-head">
        <div className="st-eyebrow">— {label}</div>
        <p className="st-group-sub">{sub}</p>
      </div>
      <div className="st-group-body">{children}</div>
    </section>
  );
}

function StField({ label, hint, children }) {
  return (
    <div className="st-field">
      <span className="st-meta-chip">{label}</span>
      {children}
      {hint && <span className="st-hint">{hint}</span>}
    </div>
  );
}

function StRow({ label, hint, children }) {
  return (
    <div className="st-row">
      <div className="st-row-left">
        <div className="st-row-label">{label}</div>
        {hint && <div className="st-hint">{hint}</div>}
      </div>
      <div className="st-row-right">{children}</div>
    </div>
  );
}

function StSeg({ options, active, onChange }) {
  return (
    <div className="st-seg">
      {options.map((opt) => (
        <button
          key={opt}
          className={`st-seg-btn${opt === active ? " active" : ""}`}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function StToggle({ on, onChange }) {
  return (
    <button
      className={`st-toggle${on ? " on" : ""}`}
      onClick={() => onChange(!on)}
      aria-pressed={on}
    >
      <span className="st-toggle-knob" />
    </button>
  );
}

function StSwatches({ options, active, onChange }) {
  return (
    <div className="st-swatches">
      {options.map(([value, label]) => (
        <button
          key={value}
          type="button"
          className={`st-swatch-btn ${value}${active === value ? " active" : ""}`}
          onClick={() => onChange(value)}
          aria-label={label}
        >
          <span />
        </button>
      ))}
    </div>
  );
}

function BigStat({ n, l, mono }) {
  return (
    <div className="st-big-stat">
      <span className={`st-big-n${mono ? " mono" : ""}`}>{n}</span>
      <span className="st-meta-chip">{l}</span>
    </div>
  );
}
