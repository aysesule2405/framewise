import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { authAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../hooks/useTheme";
import FramewiseMark from "../components/FramewiseMark";
import Icon from "../components/Icon";

export default function LoginPage() {
  const { login } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState(searchParams.get("mode") === "register" ? "register" : "login");
  const [form, setForm] = useState({ email: "", password: "", confirmPassword: "", displayName: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (mode === "register" && form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      let res;
      if (mode === "login") {
        res = await authAPI.login(form.email, form.password);
      } else {
        res = await authAPI.register(form.email, form.password, form.displayName);
      }
      login(res.data.token, res.data.user);
      navigate("/app");
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    setError("");
    setLoading(true);
    try {
      const res = await authAPI.googleAuth(credentialResponse.credential);
      login(res.data.token, res.data.user);
      navigate("/app");
    } catch (err) {
      setError(err.response?.data?.error || "Google sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    setError("");
    setForm({ email: form.email, password: "", confirmPassword: "", displayName: "" });
  };

  return (
    <div className={`fw fw-b fw-${theme}`} style={{
      minHeight: "100vh",
      background: "var(--fw-bg)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      fontFamily: "'Geist', system-ui, sans-serif",
    }}>
      {/* Background glows */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at 30% 110%, rgba(160,184,132,.18), transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(224,129,88,.12), transparent 55%)" }} />

      <div style={{
        width: 540, position: "relative", zIndex: 1,
        background: "var(--fw-surface)", borderRadius: 12,
        border: "1px solid var(--fw-rule)", boxShadow: "var(--fw-shadow-2)",
        padding: "36px 40px", display: "flex", flexDirection: "column", gap: 18,
      }}>
        {/* Sprocket top */}
        <div style={{ position: "absolute", top: -1, left: 0, right: 0, height: 18, background: "#0E0805", borderTopLeftRadius: 12, borderTopRightRadius: 12, display: "flex", justifyContent: "space-between", padding: "0 8px", alignItems: "center" }}>
          {Array.from({ length: 28 }).map((_, i) => (
            <span key={i} style={{ width: 5, height: 7, background: "#3A2A1D", borderRadius: 1 }} />
          ))}
        </div>
        <div style={{ height: 10 }} />

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <FramewiseMark size={34} variant="gradient" />
          <div>
            <div style={{ fontFamily: "'Geist', system-ui, sans-serif", fontWeight: 600, fontSize: 16, letterSpacing: "-.022em", color: "var(--fw-ink)" }}>
              Frame<em style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 400, fontVariationSettings: '"SOFT" 100, "WONK" 1', letterSpacing: "-.02em" }}>wise</em>
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: ".04em", color: "var(--fw-ink-3)", textTransform: "uppercase" }}>
              — a learning layer for video
            </div>
          </div>
        </div>

        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--fw-rust)", fontWeight: 500 }}>
            {mode === "login" ? "Take your seat" : "Open the door"}
          </div>
          <h2 style={{ fontFamily: "'Geist', system-ui, sans-serif", fontWeight: 500, fontSize: 28, letterSpacing: "-.028em", lineHeight: 1.08, marginTop: 8, color: "var(--fw-ink)" }}>
            {mode === "login"
              ? <>The screening's<br /><em style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 400, fontVariationSettings: '"SOFT" 100, "WONK" 1', color: "var(--fw-rust)" }}>starting.</em></>
              : <>Create your<br /><em style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 400, fontVariationSettings: '"SOFT" 100, "WONK" 1', color: "var(--fw-rust)" }}>account.</em></>
            }
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: "var(--fw-ink-2)", marginTop: 10 }}>
            {mode === "login"
              ? "Sign in to your library, or open the door to a new account in under a minute."
              : "Start analyzing videos for free. No credit card required."}
          </p>
        </div>

        {/* Google */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => setError("Google sign-in failed")}
            text={mode === "login" ? "signin_with" : "signup_with"}
            shape="rectangular"
            width="460"
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, height: 1, background: "var(--fw-rule)" }} />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: ".04em", color: "var(--fw-ink-3)", textTransform: "uppercase" }}>or with email</span>
          <div style={{ flex: 1, height: 1, background: "var(--fw-rule)" }} />
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {mode === "register" && (
            <input className="fw-input" placeholder="Username" value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          )}
          <input className="fw-input" type="email" placeholder="Email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <input className="fw-input" type="password" placeholder="Password" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          {mode === "register" && (
            <input className="fw-input" type="password" placeholder="Confirm password"
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} required
              style={{ borderColor: form.confirmPassword && form.password !== form.confirmPassword ? "var(--fw-err)" : undefined }}
            />
          )}

          {error && (
            <p style={{ fontSize: 12.5, color: "var(--fw-err)", padding: "7px 10px", background: "var(--fw-rust-soft)", borderRadius: "var(--fw-r-sm)", border: "1px solid rgba(197,106,67,.25)" }}>
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: 14, border: "none", borderRadius: "var(--fw-r-sm)",
            background: "var(--fw-rust)", color: "#fff",
            fontFamily: "'Geist', system-ui, sans-serif", fontSize: 14, fontWeight: 500,
            cursor: loading ? "not-allowed" : "pointer", opacity: loading ? .7 : 1,
            marginTop: 4,
          }}>
            <Icon name="play" size={12} />
            {loading ? "Please wait…" : mode === "login" ? "Open your library" : "Create account"}
          </button>
        </form>

        <p style={{ textAlign: "center", fontSize: 12.5, color: "var(--fw-ink-3)" }}>
          {mode === "login" ? "No account? " : "Already have one? "}
          <span onClick={() => switchMode(mode === "login" ? "register" : "login")}
            style={{ color: "var(--fw-rust)", cursor: "pointer", fontWeight: 500 }}>
            {mode === "login" ? "Sign up free" : "Sign in"}
          </span>
        </p>

        {/* Sprocket bottom */}
        <div style={{ position: "absolute", bottom: -1, left: 0, right: 0, height: 18, background: "#0E0805", borderBottomLeftRadius: 12, borderBottomRightRadius: 12, display: "flex", justifyContent: "space-between", padding: "0 8px", alignItems: "center" }}>
          {Array.from({ length: 28 }).map((_, i) => (
            <span key={i} style={{ width: 5, height: 7, background: "#3A2A1D", borderRadius: 1 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
