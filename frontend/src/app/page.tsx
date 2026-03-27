"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { setToken } from "@/lib/api";

type View = "login" | "forgot" | "reset";
type Theme = "dark" | "light";

export default function LoginPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("login");
  const [theme, setTheme] = useState<Theme>("light");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("aegis-theme") as Theme | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("aegis-theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  // Theme-aware colors
  const t = theme === "dark"
    ? {
        bg: "#060e1c",
        bgPanel: "linear-gradient(160deg, #040b16 0%, #060e1c 40%, #071528 100%)",
        bgForm: "#060e1c",
        bgInput: "#0f1e38",
        border: "rgba(79,142,247,0.10)",
        borderInput: "rgba(79,142,247,0.15)",
        textPrimary: "#ddeeff",
        textSecondary: "#7a9cc8",
        textMuted: "#3d5a80",
        textLabel: "#5a7da8",
        cardBg: "rgba(10,22,40,0.6)",
        gridStroke: "#10d9a0",
        gridOpacity: 0.06,
        badgeBg: "rgba(16,217,160,0.07)",
        badgeBorder: "rgba(16,217,160,0.18)",
        errorBg: "rgba(239,68,68,0.08)",
        errorBorder: "rgba(239,68,68,0.2)",
        successBg: "rgba(16,217,160,0.08)",
        successBorder: "rgba(16,217,160,0.2)",
      }
    : {
        bg: "#f5f7fa",
        bgPanel: "linear-gradient(160deg, #0f172a 0%, #1a2744 40%, #1e3050 100%)",
        bgForm: "#ffffff",
        bgInput: "#f0f4f8",
        border: "#e2e8f0",
        borderInput: "#d1d9e6",
        textPrimary: "#0f172a",
        textSecondary: "#475569",
        textMuted: "#94a3b8",
        textLabel: "#64748b",
        cardBg: "rgba(255,255,255,0.85)",
        gridStroke: "#10d9a0",
        gridOpacity: 0.08,
        badgeBg: "rgba(16,217,160,0.08)",
        badgeBorder: "rgba(16,217,160,0.25)",
        errorBg: "rgba(239,68,68,0.06)",
        errorBorder: "rgba(239,68,68,0.15)",
        successBg: "rgba(16,217,160,0.06)",
        successBorder: "rgba(16,217,160,0.2)",
      };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Invalid username or password.");
      setToken(data.access_token);
      localStorage.setItem("aegis-theme", theme);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleGetQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/secure/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error retrieving question.");
      setSecurityQuestion(data.question);
      setView("reset");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/secure/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          security_answer: securityAnswer,
          new_password: newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error resetting password.");
      setSuccess("Password reset successfully. You may now log in.");
      setView("login");
      setPassword("");
      setSecurityAnswer("");
      setNewPassword("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    setView("login");
    setError("");
    setSuccess("");
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: t.textLabel,
    marginBottom: 7,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "11px 14px",
    background: t.bgInput,
    border: `1px solid ${t.borderInput}`,
    borderRadius: 8,
    color: t.textPrimary,
    fontFamily: "var(--font-sans)",
    fontSize: 14,
    outline: "none",
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
  };

  return (
    <div
      className="min-h-screen flex"
      style={{ background: t.bg, fontFamily: "var(--font-sans)", transition: "background 0.3s ease" }}
    >
      {/* Left panel — brand art (always dark) */}
      <div
        className="hidden lg:flex flex-col relative overflow-hidden"
        style={{
          width: "48%",
          background: t.bgPanel,
          borderRight: `1px solid ${theme === "dark" ? "rgba(79,142,247,0.10)" : "rgba(0,0,0,0.08)"}`,
        }}
      >
        {/* Animated grid lines */}
        <svg
          className="absolute inset-0 w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
          style={{ opacity: t.gridOpacity }}
        >
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke={t.gridStroke} strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Hex accent top-right */}
        <svg
          className="absolute top-0 right-0"
          width="320" height="320"
          viewBox="0 0 320 320"
          style={{ opacity: 0.07 }}
        >
          <polygon points="160,20 290,90 290,230 160,300 30,230 30,90" fill="none" stroke="#10d9a0" strokeWidth="1" />
          <polygon points="160,50 265,107 265,223 160,280 55,223 55,107" fill="none" stroke="#10d9a0" strokeWidth="1" />
          <polygon points="160,80 240,124 240,216 160,260 80,216 80,124" fill="none" stroke="#10d9a0" strokeWidth="1" />
        </svg>

        {/* Radial glow */}
        <div
          className="absolute"
          style={{
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "400px",
            height: "400px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(16,217,160,0.06) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        {/* Scan line */}
        <div
          className="absolute left-0 right-0"
          style={{
            height: "1px",
            background: "linear-gradient(90deg, transparent, rgba(16,217,160,0.4), transparent)",
            animation: "scan-line 6s linear infinite",
            top: 0,
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between h-full p-12">
          {/* Spacer — branding is in the center hero */}
          <div />

          {/* Center hero */}
          <div>
            <div style={{ marginBottom: 40 }}>
              <div style={{ width: 120, animation: "float 5s ease-in-out infinite" }}>
                <img
                  src="/logo2.png"
                  alt="Ali & Sons"
                  style={{
                    width: 120,
                    height: "auto",
                    filter: "brightness(0) invert(1)",
                  }}
                />
              </div>
            </div>

            <h1
              style={{
                fontSize: 40,
                fontWeight: 800,
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
                marginBottom: 16,
                color: "#fff",
              }}
            >
              AI-Powered<br />
              <span
                style={{
                  background: "linear-gradient(135deg, #10d9a0, #f5a623)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Policy Intelligence
              </span>
            </h1>
            <p
              style={{
                fontSize: 15,
                lineHeight: 1.7,
                color: "rgba(255,255,255,0.6)",
                maxWidth: 360,
                marginBottom: 32,
              }}
            >
              Enterprise-grade compliance management grounded in UAE NESA,
              ISO 27001:2022, and UAE PDPL standards.
            </p>

            {/* Compliance badges */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {["UAE NESA", "ISO 27001:2022", "UAE PDPL", "NIST CSF 2.0"].map((b) => (
                <span
                  key={b}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "5px 12px",
                    borderRadius: 6,
                    background: "rgba(16,217,160,0.08)",
                    border: "1px solid rgba(16,217,160,0.22)",
                    color: "#10d9a0",
                    letterSpacing: "0.04em",
                  }}
                >
                  {b}
                </span>
              ))}
            </div>
          </div>

          {/* Bottom stats */}
          <div
            style={{
              display: "flex",
              gap: 28,
              paddingTop: 24,
              borderTop: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {[
              { value: "25+", label: "Policies" },
              { value: "RAG", label: "AI Engine" },
              { value: "24/7", label: "Monitoring" },
            ].map(({ value, label }) => (
              <div key={label}>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#10d9a0", lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — auth form */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-8 py-12 relative"
        style={{ background: t.bgForm, transition: "background 0.3s ease" }}
      >
        {/* Theme toggle — top right */}
        <button
          onClick={toggleTheme}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          style={{
            position: "absolute",
            top: 20,
            right: 24,
            width: 40,
            height: 40,
            borderRadius: 10,
            border: `1px solid ${t.border}`,
            background: theme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s ease",
            color: t.textSecondary,
          }}
        >
          {theme === "dark" ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="5" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
            </svg>
          )}
        </button>

        <div style={{ width: "100%", maxWidth: 400 }}>
          {/* Mobile logo */}
          <div className="flex lg:hidden flex-col items-center mb-8 gap-3">
            <img
              src="/logo-mark.png"
              alt="Ali & Sons"
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                objectFit: "contain",
                filter: theme === "dark"
                  ? "brightness(1.15) contrast(1.1)"
                  : "none",
                imageRendering: "auto",
                transition: "filter 0.3s ease",
              }}
            />
            <div style={{ fontWeight: 700, fontSize: 22, color: t.textPrimary }}>DIH CyberAI</div>
          </div>

          {/* Form header */}
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 26, fontWeight: 700, color: t.textPrimary, marginBottom: 6, transition: "color 0.3s" }}>
              {view === "login" ? "Secure Access" : view === "forgot" ? "Password Recovery" : "Reset Password"}
            </h2>
            <p style={{ fontSize: 13.5, color: t.textSecondary, lineHeight: 1.6 }}>
              {view === "login"
                ? "Sign in to DIH CyberAI Policy Governance"
                : view === "forgot"
                ? "Enter your username to retrieve your security question"
                : "Answer your security question to reset your password"}
            </p>
          </div>

          {/* Login form */}
          {view === "login" && (
            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <label style={labelStyle}>Admin Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  style={inputStyle}
                  placeholder="Enter your username"
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#10d9a0";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(16,217,160,0.15)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = t.borderInput;
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>
              <div>
                <label style={labelStyle}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  style={inputStyle}
                  placeholder="Enter your password"
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#10d9a0";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(16,217,160,0.15)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = t.borderInput;
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>
              {error && (
                <div style={{ padding: "10px 14px", borderRadius: 8, background: t.errorBg, border: `1px solid ${t.errorBorder}`, color: "#ef4444", fontSize: 13 }}>
                  {error}
                </div>
              )}
              {success && (
                <div style={{ padding: "10px 14px", borderRadius: 8, background: t.successBg, border: `1px solid ${t.successBorder}`, color: "#10d9a0", fontSize: 13 }}>
                  {success}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="btn-primary"
                style={{ padding: "13px 20px", width: "100%", fontSize: 14, marginTop: 4 }}
              >
                {loading ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                    <span className="spinner" style={{ width: 16, height: 16 }} />
                    Authenticating...
                  </span>
                ) : (
                  <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    Sign In to Dashboard
                  </span>
                )}
              </button>
              <div style={{ textAlign: "center" }}>
                <button
                  type="button"
                  onClick={() => { setView("forgot"); setError(""); setSuccess(""); }}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#10d9a0", fontFamily: "var(--font-sans)" }}
                >
                  Forgot password?
                </button>
              </div>
            </form>
          )}

          {/* Forgot password form */}
          {view === "forgot" && (
            <form onSubmit={handleGetQuestion} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <label style={labelStyle}>Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  style={inputStyle}
                  placeholder="Enter your username"
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#10d9a0";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(16,217,160,0.15)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = t.borderInput;
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>
              {error && (
                <div style={{ padding: "10px 14px", borderRadius: 8, background: t.errorBg, border: `1px solid ${t.errorBorder}`, color: "#ef4444", fontSize: 13 }}>
                  {error}
                </div>
              )}
              <button type="submit" disabled={loading} className="btn-primary" style={{ padding: "13px 20px", width: "100%", fontSize: 14 }}>
                {loading ? "Fetching..." : "Get Security Question"}
              </button>
              <div style={{ textAlign: "center" }}>
                <button type="button" onClick={goBack} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: t.textMuted, fontFamily: "var(--font-sans)" }}>
                  &larr; Back to Login
                </button>
              </div>
            </form>
          )}

          {/* Reset password form */}
          {view === "reset" && (
            <form onSubmit={handleResetPassword} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ padding: "12px 16px", borderRadius: 8, background: theme === "dark" ? "rgba(245,166,35,0.07)" : "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.2)", color: "#f5a623", fontSize: 13, fontStyle: "italic", lineHeight: 1.5 }}>
                &ldquo;{securityQuestion}&rdquo;
              </div>
              <div>
                <label style={labelStyle}>Your Answer</label>
                <input
                  type="text"
                  value={securityAnswer}
                  onChange={(e) => setSecurityAnswer(e.target.value)}
                  required
                  style={inputStyle}
                  placeholder="Type your answer"
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#10d9a0";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(16,217,160,0.15)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = t.borderInput;
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>
              <div>
                <label style={labelStyle}>New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  style={inputStyle}
                  placeholder="Enter new password"
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#10d9a0";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(16,217,160,0.15)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = t.borderInput;
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>
              {error && (
                <div style={{ padding: "10px 14px", borderRadius: 8, background: t.errorBg, border: `1px solid ${t.errorBorder}`, color: "#ef4444", fontSize: 13 }}>
                  {error}
                </div>
              )}
              <button type="submit" disabled={loading} className="btn-primary" style={{ padding: "13px 20px", width: "100%", fontSize: 14 }}>
                {loading ? "Resetting..." : "Reset Password"}
              </button>
              <div style={{ textAlign: "center" }}>
                <button type="button" onClick={goBack} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: t.textMuted, fontFamily: "var(--font-sans)" }}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          <p
            style={{
              textAlign: "center",
              fontSize: 11,
              color: t.textMuted,
              marginTop: 32,
              lineHeight: 1.8,
              transition: "color 0.3s",
            }}
          >
            Secure admin access &bull; AES-256 encrypted &bull; JWT authenticated<br />
            UAE NESA compliant &bull; ISO 27001:2022 certified
          </p>
        </div>
      </div>
    </div>
  );
}
