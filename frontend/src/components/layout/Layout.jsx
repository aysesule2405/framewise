import { useRef, useEffect, useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../hooks/useTheme";
import FramewiseMark from "../FramewiseMark";
import Icon from "../Icon";
import "./Layout.css";

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [search, setSearch] = useState("");
  const menuRef = useRef(null);

  const initials = (user?.displayName || user?.email || "?")
    .split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const activeView = new URLSearchParams(location.search).get("tab") || "";

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const isActive = (path, exact = false) => {
    if (exact) return location.pathname === path && !new URLSearchParams(location.search).get("tab");
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (search.trim()) navigate(`/app/library?q=${encodeURIComponent(search.trim())}`);
  };

  return (
    <div className="shell fw fw-b" data-theme={theme}>
      {/* Topbar */}
      <header className="shell-topbar">
        <div className="shell-topbar-left">
          <button className="shell-hamburger" onClick={() => setSideOpen((v) => !v)} aria-label="Toggle menu">
            <span className="shell-hamburger-icon" />
          </button>
          <Link to="/app" className="shell-wordmark">
            <FramewiseMark size={24} variant="gradient" />
            <span className="shell-wordmark-text">
              framewise<span className="shell-wordmark-dot">.</span>
            </span>
          </Link>
        </div>

        <form className="shell-search" onSubmit={handleSearch}>
          <Icon name="search" size={13} style={{ color: "var(--fw-ink-3)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search videos, chapters, quotes…"
            className="shell-search-input"
          />
          <span className="shell-search-kbd">⌘K</span>
        </form>

        <div className="shell-topbar-right" ref={menuRef}>
          <button className="shell-icon-btn" onClick={toggleTheme} aria-label="Toggle theme">
            <Icon name={theme === "dark" ? "sun" : "moon"} size={14} />
          </button>
          <div className="shell-avatar" onClick={() => setMenuOpen((v) => !v)}>
            {initials}
          </div>
          {menuOpen && (
            <div className="shell-dropdown">
              <p className="shell-dropdown-name">{user?.displayName || "User"}</p>
              <p className="shell-dropdown-email">{user?.email}</p>
              <hr className="shell-dropdown-divider" />
              <Link className="shell-dropdown-link" to="/app/settings" onClick={() => setMenuOpen(false)}>Settings</Link>
              <button className="shell-dropdown-logout" onClick={logout}>Log out</button>
            </div>
          )}
        </div>
      </header>

      <div className="shell-body">
        {/* Sidebar */}
        <nav className={`shell-sidebar${sideOpen ? " open" : ""}`}>

          {/* Workspace */}
          <div className="shell-nav-section">
            <span className="shell-nav-label">Workspace</span>
            <NavItem
              to="/app" icon="sparkle" label="Dashboard"
              active={location.pathname === "/app"}
              onClose={() => setSideOpen(false)}
            />
            <NavItem
              to="/app/history" icon="recent" label="History"
              active={isActive("/app/history")}
              onClose={() => setSideOpen(false)}
            />
          </div>

          {/* Library */}
          <div className="shell-nav-section">
            <span className="shell-nav-label">Library</span>
            <NavItem
              to="/app/library" icon="library" label="All videos"
              active={isActive("/app/library") && !activeView}
              onClose={() => setSideOpen(false)}
            />
            <NavItem
              to="/app/library?tab=dance" icon="dance" label="Dance Practice"
              active={isActive("/app/library") && activeView === "dance"}
              onClose={() => setSideOpen(false)}
              sub
            />
            <NavItem
              to="/app/library?tab=study" icon="queue" label="Study Queue"
              active={isActive("/app/library") && activeView === "study"}
              onClose={() => setSideOpen(false)}
              sub
            />
          </div>

          {/* System */}
          <div className="shell-nav-section shell-nav-bottom">
            <span className="shell-nav-label">System</span>
            <NavItem
              to="/app/settings" icon="settings" label="Settings"
              active={isActive("/app/settings")}
              onClose={() => setSideOpen(false)}
            />
          </div>

          {/* Extension footer */}
          <div className="shell-ext-footer">
            <div className="shell-ext-row">
              <span className="shell-ext-label">EXTENSION</span>
              <span className="shell-ext-status">
                <span className="shell-ext-dot" />
                connected
              </span>
            </div>
            <div className="shell-ext-sub">Open a YouTube video to begin</div>
            <div className="shell-ext-bar">
              {Array.from({ length: 14 }).map((_, i) => (
                <span key={i} className={`shell-ext-bar-seg${i < 3 ? " filled" : ""}`} />
              ))}
            </div>
            <Link to="/app/settings?tab=extension" className="shell-ext-link" onClick={() => setSideOpen(false)}>
              Extension options →
            </Link>
          </div>
        </nav>

        {sideOpen && <div className="shell-overlay" onClick={() => setSideOpen(false)} />}

        <main className="shell-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavItem({ to, icon, label, active, onClose, sub = false }) {
  return (
    <Link
      to={to}
      className={`shell-nav-item${active ? " active" : ""}${sub ? " sub" : ""}`}
      onClick={onClose}
    >
      <Icon name={icon} size={sub ? 13 : 14} />
      <span className="shell-nav-item-label">{label}</span>
    </Link>
  );
}
