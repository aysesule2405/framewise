import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import FramewiseMark from "../components/FramewiseMark";
import Icon from "../components/Icon";
import { useTheme } from "../hooks/useTheme";
const studyCaptionDemo = null;
const dancePracticeDemo = null;
import "./LandingPage.css";

const FEATURES = [
  { icon: "topics", tone: "rust",  title: "topic timeline",     body: "Every video becomes a labeled timeline. Click any chapter to jump straight in." },
  { icon: "chat",   tone: "peach", title: "chat with the video", body: "Ask anything. Answers cite the exact timestamp where it's discussed." },
  { icon: "mic",    tone: "sage",  title: "voice replies",       body: "ElevenLabs reads every answer aloud while you keep your eyes on the video." },
  { icon: "dance",  tone: "rust",  title: "practice mode",       body: "Loop and slow-down any section. Built for dance, language, code, recipes." },
];

export default function LandingPage() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const appLink = user ? "/app" : "/login";

  return (
    <div className={`lp fw fw-b fw-${theme}`}>
      {/* Peach blush glows */}
      <div className="lp-glow-tr" />
      <div className="lp-glow-bl" />

      {/* Nav */}
      <header className="lp-nav">
        <div className="lp-nav-left">
          <FramewiseMark size={22} variant="gradient" />
          <span className="lp-wordmark">framewise<span className="lp-dot">.</span></span>
        </div>
        <nav className="lp-nav-links">
          <Link to="/" className="lp-nav-active">home</Link>
          <Link to={appLink}>library</Link>
          <Link to="/extension">extension</Link>
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
                  <button className="lp-nav-signout" onClick={logout} title="Sign out">Sign out</button>
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
      <section className="lp-hero">
        <div className="lp-hero-pill">
          <span className="lp-hero-dot" />
          <span className="lp-hero-pill-text">7,200 VIDEOS ANALYZED THIS WEEK</span>
        </div>
        <h1 className="lp-hero-title">
          framewise<span className="lp-dot">.</span>
        </h1>
        <p className="lp-hero-sub">
          built to help you actually <em className="lp-italic">learn</em> from video.
          an AI layer for every YouTube tab — timeline, chat, voice replies.
        </p>
        <div className="lp-hero-ctas">
          <button className="lp-btn-primary" onClick={() => navigate(appLink)}>
            Start analyzing <Icon name="arrow" size={13} />
          </button>
          {!user && (
            <button className="lp-btn-ghost lp-btn-auth" onClick={() => navigate("/login?mode=register")}>
              Login / Sign up
            </button>
          )}
          <a className="lp-btn-ghost" href="chrome://extensions/">
            <Icon name="extension" size={13} /> chrome://extensions
          </a>
          <button className="lp-btn-ghost" onClick={() => navigate("/extension")}>
            Setup guide
          </button>
          <span className="lp-hero-note">free · no card</span>
        </div>
      </section>

      {/* Product showcase */}
      <section className="lp-showcase-section">
        <DemoBrowser />
      </section>

      {/* Features */}
      <section className="lp-features-section">
        <div className="lp-features-head">
          <h2 className="lp-features-title">
            everything you need to <em className="lp-italic">learn</em> from video.
          </h2>
          <span className="lp-tc">04 / FEATURES</span>
        </div>
        <div className="lp-features-grid">
          {FEATURES.map((f) => <FeatureCard key={f.title} {...f} />)}
        </div>
      </section>

      {/* CTA */}
      <section className="lp-cta-section">
        <div className="lp-cta-box">
          <SprocketStrip pos="top" />
          <SprocketStrip pos="bottom" />
          <div className="lp-cta-glow" />
          <div className="lp-cta-content">
            <span className="lp-tc lp-cta-eyebrow">— TAKE A SEAT</span>
            <h2 className="lp-cta-title">
              ready to try<br />
              <em className="lp-italic">framewise?</em>
            </h2>
            <p className="lp-cta-body">
              free to use, no credit card. brings every YouTube tab to life with a smarter layer on top.
            </p>
            <div className="lp-cta-btns">
              <button className="lp-cta-btn-primary" onClick={() => navigate(appLink)}>
                Open your library <Icon name="arrow" size={13} />
              </button>
              <a className="lp-cta-btn-ghost" href="chrome://extensions/">
                <Icon name="extension" size={13} /> Open extensions
              </a>
              <button className="lp-cta-btn-ghost" onClick={() => navigate("/extension")}>
                Setup guide
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-footer-brand">
          <FramewiseMark size={20} variant="gradient" />
          <span className="lp-footer-name">framewise<span className="lp-dot">.</span></span>
        </div>
        <div className="lp-footer-links">
          <span>built with gemini · elevenlabs · mongodb</span>
          <span>privacy</span>
          <span>terms</span>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, tone, title, body }) {
  const tones = {
    rust:  { bg: "var(--fw-rust-soft)",  fg: "var(--fw-rust)" },
    peach: { bg: "var(--fw-peach-soft)", fg: "var(--fw-rust)" },
    sage:  { bg: "var(--fw-sage-soft)",  fg: "var(--fw-sage)" },
  }[tone];
  return (
    <div className="lp-feat-card">
      <div className="lp-feat-icon" style={{ background: tones.bg, color: tones.fg }}>
        <Icon name={icon} size={16} />
      </div>
      <div className="lp-feat-title">{title}</div>
      <p className="lp-feat-body">{body}</p>
    </div>
  );
}

function SprocketStrip({ pos }) {
  return (
    <div className={`lp-sprocket lp-sprocket-${pos}`}>
      {Array.from({ length: 60 }).map((_, i) => (
        <span key={i} className="lp-sprocket-notch" />
      ))}
    </div>
  );
}

// Static product mockup — VideoPage preview inside a browser chrome
function DemoBrowser() {
  const SEGS = [
    { n: 1, tc: "00:00", label: "Introduction", dur: "1:22" },
    { n: 2, tc: "01:22", label: "Core concepts explained", dur: "3:45", active: true },
    { n: 3, tc: "05:07", label: "Live demonstration", dur: "4:12" },
    { n: 4, tc: "09:19", label: "Q&A and wrap-up", dur: "2:58" },
  ];
  return (
    <div className="demo-browser">
      {/* Chrome bar */}
      <div className="demo-chrome">
        <div className="demo-dots">
          <span style={{ background: "#EE6A5F", border: "1px solid #CC4D43" }} />
          <span style={{ background: "#F4BF4F", border: "1px solid #D6A028" }} />
          <span style={{ background: "#62C554", border: "1px solid #4DA63F" }} />
        </div>
        <div className="demo-url-bar">
          <span className="demo-url-dot" />
          <span className="demo-url-text">framewise.app</span>
          <span className="demo-url-kbd">⌘K</span>
        </div>
        <div style={{ width: 80 }} />
      </div>

      {/* App canvas */}
      <div className="demo-canvas">
        {/* Mini topbar */}
        <div className="demo-topbar">
          <div className="demo-topbar-brand">
            <FramewiseMark size={16} variant="gradient" />
            <span className="demo-brand-text">framewise<span style={{ color: "var(--fw-rust)" }}>.</span></span>
          </div>
          <div className="demo-topbar-search">Search videos, chapters…</div>
          <div className="demo-topbar-avatar">AŞ</div>
        </div>

        {/* Content area */}
        <div className="demo-content">
          {/* Sidebar */}
          <div className="demo-sidebar">
            {["Library", "Continue", "Collections"].map((l, i) => (
              <div key={l} className={`demo-nav-item${i === 0 ? " active" : ""}`}>{l}</div>
            ))}
          </div>

          {/* Main */}
          <div className="demo-main">
            {/* Video player mock */}
            <div className="demo-player">
              <div className="demo-player-stage">
                <video
                  className="demo-player-video"
                  src={studyCaptionDemo}
                  autoPlay
                  loop
                  muted
                  playsInline
                  aria-label="Framewise caption integration demo"
                />
                <div className="demo-player-vignette" />
                <div className="demo-player-title">FRAMEWISE</div>
                <div className="demo-play-btn">
                  <Icon name="play" size={18} />
                </div>
                <div className="demo-player-chapter">
                  <span className="demo-chap-num">02</span>
                  <span>Core concepts explained</span>
                </div>
              </div>
              <div className="demo-player-controls">
                <span className="demo-tc">01:22</span>
                <div className="demo-progress">
                  <div className="demo-progress-fill" />
                  <div className="demo-progress-dot" />
                </div>
                <span className="demo-tc">09:17</span>
              </div>
            </div>

            {/* Segment list */}
            <div className="demo-segments">
              {SEGS.map((s) => (
                <div key={s.n} className={`demo-seg${s.active ? " active" : ""}`}>
                  <span className={`demo-seg-num${s.active ? " active" : ""}`}>{String(s.n).padStart(2, "0")}</span>
                  <span className="demo-seg-tc">{s.tc}</span>
                  <span className="demo-seg-label">{s.label}</span>
                  <span className="demo-seg-dur">{s.dur}</span>
                </div>
              ))}
            </div>

            <div className="demo-mode-card">
              <div className="demo-mode-copy">
                <span className="demo-mode-kicker">DANCE PRACTICE</span>
                <p className="demo-mode-title">Loop choreography, track movement, get coach feedback.</p>
              </div>
              <div className="demo-mode-video-wrap">
                <video
                  className="demo-mode-video"
                  src={dancePracticeDemo}
                  autoPlay
                  loop
                  muted
                  playsInline
                  aria-label="Framewise dance practice demo"
                />
                <span className="demo-mode-badge">Practice mode</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
