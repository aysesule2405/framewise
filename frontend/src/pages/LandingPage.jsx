import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import FramewiseMark from "../components/FramewiseMark";
import Icon from "../components/Icon";
import { useTheme } from "../hooks/useTheme";
import framewiseDemo from "../assets/Framewise Demo.mov";
import "./LandingPage.css";

const FEATURES = [
  { icon: "topics", tone: "rust",  title: "topic timeline",     body: "Gemini watches your video and builds a labeled, clickable chapter list. Jump to any moment in one click." },
  { icon: "chat",   tone: "peach", title: "AI tutor",            body: "Ask anything about the video. Answers link directly to the exact second being discussed." },
  { icon: "mic",    tone: "sage",  title: "voice replies",       body: "Every AI answer is read aloud so you can keep your eyes on the screen while you learn." },
  { icon: "dance",  tone: "rust",  title: "practice mode",       body: "Loop any section at any speed. Built for dance tutorials, language drills, and anything you need to repeat." },
  { icon: "youtube", tone: "peach", title: "any platform",       body: "YouTube, Vimeo, TikTok, Canvas, and any page with a video. The Chrome extension captures and analyzes them all." },
  { icon: "cc",     tone: "sage",  title: "captions & notes",   body: "Auto-generate, correct, and translate captions. Save timestamped notes and bookmarks synced to your library." },
];

export default function LandingPage() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

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
          <Link to={user ? "/app" : "/login"}>library</Link>
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
          <span className="lp-hero-pill-text">AI-POWERED VIDEO LEARNING</span>
        </div>
        <h1 className="lp-hero-title">
          framewise<span className="lp-dot">.</span>
        </h1>
        <p className="lp-hero-sub">
          paste a video link — YouTube, Vimeo, TikTok, Canvas, or anything. get a clickable topic timeline, an AI tutor that cites exact timestamps, voice replies, and a <em className="lp-italic">practice loop</em> — all in one screen.
        </p>
        <div className="lp-hero-ctas">
          {user
            ? <button className="lp-btn-primary" onClick={() => navigate("/app")}>
                Open library <Icon name="arrow" size={13} />
              </button>
            : <>
                <button className="lp-btn-primary" onClick={() => navigate("/login?mode=register")}>
                  Get started free <Icon name="arrow" size={13} />
                </button>
                <button className="lp-btn-ghost lp-btn-auth" onClick={() => navigate("/login")}>
                  Sign in
                </button>
              </>
          }
          <button className="lp-btn-ghost" onClick={() => navigate("/extension")}>
            <FramewiseMark size={16} variant="outline-gradient" /> Chrome extension
          </button>
        </div>
      </section>

      {/* Product showcase */}
      <section className="lp-showcase-section">
        <div className="lp-showcase-header">
          <span className="lp-tc">— SEE IT IN ACTION</span>
          <p className="lp-showcase-sub">framewise running on a real YouTube video</p>
        </div>
        <DemoBrowser />
      </section>

      {/* Features */}
      <section className="lp-features-section">
        <div className="lp-features-head">
          <h2 className="lp-features-title">
            everything you need to actually <em className="lp-italic">learn</em> from video.
          </h2>
          <span className="lp-tc">06 / FEATURES</span>
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
            <span className="lp-tc lp-cta-eyebrow">— GET STARTED</span>
            <h2 className="lp-cta-title">
              your next video,<br />
              <em className="lp-italic">understood.</em>
            </h2>
            <p className="lp-cta-body">
              free to use, no credit card needed. paste any video link and framewise builds your study layer in seconds.
            </p>
            <div className="lp-cta-btns">
              <button className="lp-cta-btn-primary" onClick={() => navigate(user ? "/app" : "/login?mode=register")}>
                {user ? "Open my library" : "Get started free"} <Icon name="arrow" size={13} />
              </button>
              <button className="lp-cta-btn-ghost" onClick={() => navigate("/extension")}>
                <FramewiseMark size={16} variant="outline-gradient" /> Chrome extension
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
          <span>© 2025 framewise</span>
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

function DemoBrowser() {
  return (
    <div className="demo-video-showcase">
      <video
        src={framewiseDemo}
        autoPlay
        loop
        muted
        playsInline
        aria-label="Framewise demo"
      />
    </div>
  );
}
