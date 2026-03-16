"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setToken } from "@/lib/api";

type View = "login" | "forgot" | "reset";

export default function LoginPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("login");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

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
      router.push("/dashboard/chat");
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

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg-base)", fontFamily: "var(--font-sans)" }}>
      {/* Left panel — brand art */}
      <div
        className="hidden lg:flex flex-col relative overflow-hidden"
        style={{
          width: "48%",
          background: "linear-gradient(160deg, #040b16 0%, #060e1c 40%, #071528 100%)",
          borderRight: "1px solid var(--border)",
        }}
      >
        {/* Animated grid lines */}
        <svg
          className="absolute inset-0 w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
          style={{ opacity: 0.06 }}
        >
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#10d9a0" strokeWidth="0.5" />
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

        {/* Radial glow behind logo */}
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

        {/* Scan line animation */}
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
          {/* Logo top */}
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "10px",
                background: "rgba(16,217,160,0.08)",
                border: "1px solid rgba(16,217,160,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 36 36" fill="none">
                <path
                  d="M18 3L4 9v10c0 8.284 5.954 16.027 14 18 8.046-1.973 14-9.716 14-18V9L18 3z"
                  fill="rgba(16,217,160,0.15)"
                  stroke="#10d9a0"
                  strokeWidth="1.5"
                />
                <path
                  d="M13 18l3 3 7-7"
                  stroke="#10d9a0"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.04em" }}>
                ARIA
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.02em" }}>
                Ali &amp; Sons Holding
              </div>
            </div>
          </div>

          {/* Center hero */}
          <div>
            {/* Large shield */}
            <div
              className="mb-10"
              style={{
                width: 100,
                height: 100,
                borderRadius: "24px",
                background: "linear-gradient(135deg, rgba(16,217,160,0.12) 0%, rgba(245,166,35,0.08) 100%)",
                border: "1px solid rgba(16,217,160,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                animation: "float 5s ease-in-out infinite",
                boxShadow: "0 0 40px rgba(16,217,160,0.1)",
              }}
            >
              <svg width="52" height="52" viewBox="0 0 36 36" fill="none">
                <path
                  d="M18 3L4 9v10c0 8.284 5.954 16.027 14 18 8.046-1.973 14-9.716 14-18V9L18 3z"
                  fill="rgba(16,217,160,0.2)"
                  stroke="#10d9a0"
                  strokeWidth="1.2"
                />
                <path
                  d="M12 18l4 4 8-8"
                  stroke="#10d9a0"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <h1
              style={{
                fontSize: 42,
                fontWeight: 800,
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
                marginBottom: 16,
                color: "var(--text-primary)",
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
                color: "var(--text-secondary)",
                maxWidth: 340,
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
                    padding: "4px 10px",
                    borderRadius: 6,
                    background: "rgba(16,217,160,0.07)",
                    border: "1px solid rgba(16,217,160,0.18)",
                    color: "#10d9a0",
                    letterSpacing: "0.04em",
                  }}
                >
                  {b}
                </span>
              ))}
            </div>
          </div>

          {/* Bottom */}
          <div>
            <div
              style={{
                display: "flex",
                gap: 24,
                paddingTop: 24,
                borderTop: "1px solid var(--border)",
              }}
            >
              {[
                { value: "25+", label: "Policies" },
                { value: "RAG", label: "AI Engine" },
                { value: "24/7", label: "Monitoring" },
              ].map(({ value, label }) => (
                <div key={label}>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: "#10d9a0",
                      lineHeight: 1,
                    }}
                  >
                    {value}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right panel — auth form */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-8 py-12"
        style={{ background: "var(--bg-base)" }}
      >
        <div style={{ width: "100%", maxWidth: 400 }}>
          {/* Mobile logo */}
          <div className="flex lg:hidden flex-col items-center mb-8 gap-3">
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: "rgba(16,217,160,0.08)",
                border: "1px solid rgba(16,217,160,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="28" height="28" viewBox="0 0 36 36" fill="none">
                <path
                  d="M18 3L4 9v10c0 8.284 5.954 16.027 14 18 8.046-1.973 14-9.716 14-18V9L18 3z"
                  fill="rgba(16,217,160,0.15)"
                  stroke="#10d9a0"
                  strokeWidth="1.5"
                />
                <path
                  d="M13 18l3 3 7-7"
                  stroke="#10d9a0"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div style={{ fontWeight: 700, fontSize: 22, color: "var(--text-primary)" }}>ARIA</div>
          </div>

          {/* Form header */}
          <div className="mb-8">
            <h2 style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
              {view === "login" ? "Secure Access" : view === "forgot" ? "Password Recovery" : "Reset Password"}
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {view === "login"
                ? "Sign in to ARIA IT Policy Manager"
                : view === "forgot"
                ? "Enter your username to retrieve your security question"
                : "Answer your security question to reset your password"}
            </p>
          </div>

          {/* Login form */}
          {view === "login" && (
            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--text-muted)",
                    marginBottom: 7,
                  }}
                >
                  Admin Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  className="input-field"
                  placeholder="Enter your username"
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--text-muted)",
                    marginBottom: 7,
                  }}
                >
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="input-field"
                  placeholder="Enter your password"
                />
              </div>
              {error && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    color: "var(--danger)",
                    fontSize: 13,
                  }}
                >
                  {error}
                </div>
              )}
              {success && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: "rgba(16,217,160,0.08)",
                    border: "1px solid rgba(16,217,160,0.2)",
                    color: "var(--success)",
                    fontSize: 13,
                  }}
                >
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
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    color: "var(--accent)",
                    fontFamily: "var(--font-sans)",
                  }}
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
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--text-muted)",
                    marginBottom: 7,
                  }}
                >
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="input-field"
                  placeholder="Enter your username"
                />
              </div>
              {error && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    color: "var(--danger)",
                    fontSize: 13,
                  }}
                >
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="btn-primary"
                style={{ padding: "13px 20px", width: "100%", fontSize: 14 }}
              >
                {loading ? "Fetching..." : "Get Security Question"}
              </button>
              <div style={{ textAlign: "center" }}>
                <button
                  type="button"
                  onClick={goBack}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  &larr; Back to Login
                </button>
              </div>
            </form>
          )}

          {/* Reset password form */}
          {view === "reset" && (
            <form onSubmit={handleResetPassword} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: 8,
                  background: "rgba(245,166,35,0.07)",
                  border: "1px solid rgba(245,166,35,0.2)",
                  color: "var(--gold)",
                  fontSize: 13,
                  fontStyle: "italic",
                  lineHeight: 1.5,
                }}
              >
                &ldquo;{securityQuestion}&rdquo;
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--text-muted)",
                    marginBottom: 7,
                  }}
                >
                  Your Answer
                </label>
                <input
                  type="text"
                  value={securityAnswer}
                  onChange={(e) => setSecurityAnswer(e.target.value)}
                  required
                  className="input-field"
                  placeholder="Type your answer"
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--text-muted)",
                    marginBottom: 7,
                  }}
                >
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="input-field"
                  placeholder="Enter new password"
                />
              </div>
              {error && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    color: "var(--danger)",
                    fontSize: 13,
                  }}
                >
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="btn-primary"
                style={{ padding: "13px 20px", width: "100%", fontSize: 14 }}
              >
                {loading ? "Resetting..." : "Reset Password"}
              </button>
              <div style={{ textAlign: "center" }}>
                <button
                  type="button"
                  onClick={goBack}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <p
            style={{
              textAlign: "center",
              fontSize: 11,
              color: "var(--text-muted)",
              marginTop: 32,
              lineHeight: 1.8,
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
