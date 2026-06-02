import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../hooks/useTheme";
import FramewiseMark from "../components/FramewiseMark";
import Icon from "../components/Icon";
import "./LandingPage.css";
import "./ExtensionPage.css";

const STEPS = [
  {
    n: "01",
    icon: "download",
    tone: "rust",
    title: "Load the extension in Chrome",
    body: "Open Chrome's extensions manager, enable developer mode, then point Chrome at the extension folder.",
    steps: [
      { label: "Open", code: "chrome://extensions" },
      { label: "Enable", note: "\"Developer mode\" toggle — top-right corner" },
      { label: "Click", note: "\"Load unpacked\" → select the", code: "extension/", tail: "folder" },
    ],
  },
  {
    n: "02",
    icon: "user",
    tone: "sage",
    title: "Sign in on the web app",
    body: "The extension shares your account with the web app. Sign in there first so the side panel can see your library.",
    steps: [
      { label: "Go to", code: "localhost:5174", note: "(or your deployed URL)" },
      { label: "Sign in", note: "or create a new account — takes 30 seconds" },
    ],
  },
  {
    n: "03",
    icon: "youtube",
    tone: "peach",
    title: "Open a video — any platform",
    body: "Navigate to a video in Chrome. YouTube and Shorts work natively. For Vimeo, TikTok, Canvas, or any page with a video player, click Capture & Analyze in the side panel.",
    steps: [
      { label: "YouTube", note: "opens automatically — panel detects it instantly" },
      { label: "Other", note: "open any page with a video, then click Capture & Analyze" },
      { label: "Side panel", note: "opens — you're ready" },
    ],
  },
  {
    n: "04",
    icon: "analyze",
    tone: "rust",
    title: "Analyze your first video",
    body: "YouTube? click Analyze. Any other platform? click Capture & Analyze — the extension records the tab and sends it to Gemini. The timeline auto-loads next time.",
    steps: [
      { label: "YouTube", note: "click Analyze — Gemini processes it directly" },
      { label: "Other", note: "click Capture & Analyze — records the playing video" },
      { label: "Done", note: "timeline, chat, and captions are ready" },
    ],
  },
];

const FEATURES = [
  { icon: "topics",   tone: "rust",  label: "Topic timeline",      desc: "Auto-loaded chapter list. Click any segment to jump the video." },
  { icon: "chat",     tone: "sage",  label: "Chat with video",     desc: "Ask anything, get timestamped answers from Gemini." },
  { icon: "cc",       tone: "peach", label: "Caption injection",   desc: "Framewise captions overlay timed to playback — on YouTube or any captured video." },
  { icon: "mic",      tone: "rust",  label: "Voice replies",       desc: "ElevenLabs reads every chat answer aloud while you watch." },
  { icon: "youtube",  tone: "sage",  label: "Multi-platform",      desc: "YouTube, Vimeo, TikTok, Canvas — Capture & Analyze records any tab Gemini can't reach directly." },
  { icon: "bookmark", tone: "peach", label: "Bookmarks & notes",   desc: "Save timestamps and quick notes synced to your library." },
];

export default function ExtensionPage() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  return (
    <div className={`ep fw fw-b fw-${theme}`}>
      <div className="ep-glow-tr" />
      <div className="ep-glow-bl" />

      {/* Nav */}
      <header className="lp-nav">
        <div className="lp-nav-left">
          <FramewiseMark size={22} variant="gradient" />
          <span className="lp-wordmark">framewise<span className="lp-dot">.</span></span>
        </div>
        <nav className="lp-nav-links">
          <Link to="/">home</Link>
          <Link to={user ? "/app" : "/login"}>library</Link>
          <Link to="/extension" className="lp-nav-active">extension</Link>
        </nav>
        <div className="lp-nav-right">
          <button className="lp-icon-btn" onClick={toggleTheme} aria-label="Toggle theme">
            <Icon name={theme === "dark" ? "sun" : "moon"} size={14} />
          </button>
          {user
            ? <>
                <Link to="/app" className="lp-btn-outline">Library →</Link>
                <span className="lp-nav-user-chip">
                  <span className="lp-nav-avatar">{(user.displayName || user.email || "?")[0].toUpperCase()}</span>
                  <span className="lp-nav-user-name">{user.displayName || user.email}</span>
                  <button className="lp-nav-signout" onClick={logout}>Sign out</button>
                </span>
              </>
            : <>
                <Link to="/login" className="lp-nav-signin">Sign in</Link>
                <Link to="/login?mode=register" className="lp-btn-outline">Get started</Link>
              </>
          }
        </div>
      </header>

      {/* Hero */}
      <section className="ep-hero">
        <div className="ep-hero-text">
          <div className="ep-hero-badge">
            <FramewiseMark size={14} variant="outline-gradient" />
            <span>CHROME EXTENSION · MANIFEST V3</span>
          </div>
          <h1 className="ep-hero-title">
            Any video tab,<br />
            <em className="ep-italic">annotated.</em>
          </h1>
          <p className="ep-hero-sub">
            Timeline, chat, captions, and practice mode — on YouTube, Vimeo, TikTok, Canvas, and more.
            Four steps and you're watching smarter.
          </p>
          <div className="ep-hero-actions">
            <button className="ep-cta-btn" onClick={() => navigate(user ? "/app" : "/login?mode=register")}>
              {user ? "Open library →" : "Create account first →"}
            </button>
            <a className="lp-nav-signin ep-scroll-link" href="#steps">See setup steps ↓</a>
          </div>
        </div>

        {/* Filmstrip preview of the panel */}
        <div className="ep-panel-preview">
          <div className="ep-panel-frame">
            <div className="ep-panel-strip" />
            <div className="ep-panel-inner">
              <div className="ep-panel-tabs">
                {["Timeline", "Chat", "Captions", "Practice"].map((t, i) => (
                  <span key={t} className={`ep-panel-tab${i === 0 ? " active" : ""}`}>{t}</span>
                ))}
              </div>
              <div className="ep-panel-segments">
                {[
                  { w: "68%", t: "00:00", label: "Introduction" },
                  { w: "52%", t: "04:12", label: "Core concepts" },
                  { w: "74%", t: "11:38", label: "Practical demo" },
                  { w: "45%", t: "19:05", label: "Q&A" },
                ].map((s) => (
                  <div key={s.t} className="ep-panel-seg">
                    <span className="ep-panel-seg-t">{s.t}</span>
                    <div className="ep-panel-seg-bar">
                      <div className="ep-panel-seg-fill" style={{ width: s.w }} />
                    </div>
                    <span className="ep-panel-seg-label">{s.label}</span>
                  </div>
                ))}
              </div>
              <div className="ep-panel-chat-row">
                <div className="ep-panel-bubble user">How does this technique work?</div>
                <div className="ep-panel-bubble ai">At <span className="ep-panel-ts">04:12</span> the instructor breaks it down into three phases…</div>
              </div>
            </div>
            <div className="ep-panel-strip" />
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="ep-steps" id="steps">
        <div className="ep-section-label">
          <span className="ep-eyebrow">— SETUP GUIDE</span>
          <h2 className="ep-section-title">Up in four steps.</h2>
        </div>

        <div className="ep-steps-list">
          {STEPS.map((step, i) => (
            <div key={step.n} className="ep-step">
              <div className={`ep-step-num ep-step-num-${step.tone}`}>{step.n}</div>
              <div className="ep-step-content">
                <div className="ep-step-head">
                  <div className={`ep-step-icon ep-icon-${step.tone}`}>
                    <Icon name={step.icon} size={16} />
                  </div>
                  <h3 className="ep-step-title">{step.title}</h3>
                </div>
                <p className="ep-step-body">{step.body}</p>
                <div className="ep-step-substeps">
                  {step.steps.map((s, j) => (
                    <div key={j} className="ep-substep">
                      <span className="ep-substep-label">{s.label}</span>
                      {s.code && <code className="ep-code">{s.code}</code>}
                      {s.note && <span className="ep-substep-note">{s.note}</span>}
                      {s.tail && <span className="ep-substep-note">{s.tail}</span>}
                    </div>
                  ))}
                </div>
              </div>
              {i < STEPS.length - 1 && <div className="ep-step-connector" />}
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="ep-features">
        <div className="ep-section-label">
          <span className="ep-eyebrow">— WHAT YOU GET</span>
          <h2 className="ep-section-title">Inside the panel.</h2>
        </div>
        <div className="ep-features-grid">
          {FEATURES.map((f) => (
            <div key={f.label} className="ep-feature-card">
              <div className={`ep-feature-icon ep-icon-${f.tone}`}>
                <Icon name={f.icon} size={18} />
              </div>
              <div className="ep-feature-text">
                <div className="ep-feature-label">{f.label}</div>
                <p className="ep-feature-desc">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Requirements note */}
      <section className="ep-note-section">
        <div className="ep-note-card">
          <span className="ep-eyebrow" style={{ display: "block", marginBottom: 8 }}>— REQUIREMENTS</span>
          <div className="ep-note-grid">
            <NoteItem icon="check" text="Chrome (any recent version)" />
            <NoteItem icon="check" text="Developer mode enabled in chrome://extensions" />
            <NoteItem icon="check" text="Framewise account (free)" />
            <NoteItem icon="check" text="Backend running at localhost:3001" />
          </div>
          <p className="ep-note-hint">
            Extension API and app URLs are configured in{" "}
            <code className="ep-code">extension/src/config.js</code>.
            Update before a production build.
          </p>
        </div>
      </section>

      {/* CTA footer */}
      <section className="ep-footer-cta">
        <div className="ep-footer-filmstrip">
          {Array.from({ length: 120 }).map((_, i) => (
            <span key={i} className="ep-filmstrip-hole" />
          ))}
        </div>
        <div className="ep-footer-cta-body">
          <p className="ep-eyebrow" style={{ marginBottom: 28 }}>— READY?</p>
          <h2 className="ep-cta-title">
            Start with a video.<br />
            <em className="ep-italic">See the difference.</em>
          </h2>
          <p className="ep-cta-sub">
            Free to use. Open any video and framewise builds your study layer in seconds.
          </p>
          <div className="ep-cta-row">
            <button className="ep-cta-btn" onClick={() => navigate(user ? "/app" : "/login?mode=register")}>
              {user ? "Go to my library →" : "Create free account →"}
            </button>
            <Link to="/" className="lp-nav-signin">← Back to home</Link>
          </div>
        </div>
        <div className="ep-footer-filmstrip">
          {Array.from({ length: 120 }).map((_, i) => (
            <span key={i} className="ep-filmstrip-hole" />
          ))}
        </div>
      </section>
    </div>
  );
}

function NoteItem({ icon, text }) {
  return (
    <div className="ep-note-item">
      <Icon name={icon} size={13} style={{ color: "var(--fw-sage)", flexShrink: 0 }} />
      <span>{text}</span>
    </div>
  );
}
