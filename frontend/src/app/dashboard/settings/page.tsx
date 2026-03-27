"use client";

import React, { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface MonitoringStatus {
  last_run: string | null;
  last_status: string;
  chunks_added: number;
  total_runs: number;
  last_error: string | null;
}

interface FormState {
  loading: boolean;
  success: string;
  error: string;
}

const defaultFormState: FormState = { loading: false, success: "", error: "" };

function SectionHeader({ icon, title, subtitle, iconColor = "var(--accent)" }: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  iconColor?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 20 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 9,
          background: `${iconColor === "var(--accent)" ? "rgba(16,217,160,0.08)" : iconColor === "var(--gold)" ? "rgba(245,166,35,0.08)" : "rgba(16,185,129,0.08)"}`,
          border: `1px solid ${iconColor === "var(--accent)" ? "rgba(16,217,160,0.18)" : iconColor === "var(--gold)" ? "rgba(245,166,35,0.18)" : "rgba(16,185,129,0.18)"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: iconColor,
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.2 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.5 }}>{subtitle}</div>}
      </div>
    </div>
  );
}

function FormFeedback({ state }: { state: FormState }) {
  if (!state.error && !state.success) return null;
  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 8,
        background: state.error ? "rgba(239,68,68,0.07)" : "rgba(16,217,160,0.07)",
        border: `1px solid ${state.error ? "rgba(239,68,68,0.2)" : "rgba(16,217,160,0.2)"}`,
        color: state.error ? "var(--danger)" : "var(--success)",
        fontSize: 13,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {state.error ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        )}
      </svg>
      {state.error || state.success}
    </div>
  );
}

const inputFocusStyle = (color = "var(--accent)", rgba = "rgba(16,217,160,0.1)") => ({
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = color;
    e.currentTarget.style.boxShadow = `0 0 0 3px ${rgba}`;
  },
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "var(--border)";
    e.currentTarget.style.boxShadow = "none";
  },
});

// ── Password Strength Meter ────────────────────────────────────────────────

function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;

  const checks = [
    { label: "12+ characters", pass: password.length >= 12 },
    { label: "Uppercase letter", pass: /[A-Z]/.test(password) },
    { label: "Lowercase letter", pass: /[a-z]/.test(password) },
    { label: "Digit", pass: /\d/.test(password) },
    { label: "Special character", pass: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?`~]/.test(password) },
  ];
  const score = checks.filter((c) => c.pass).length;

  const barColor =
    score <= 2 ? "var(--danger)" :
    score <= 3 ? "var(--warning)" :
    score <= 4 ? "var(--gold)" :
    "var(--success)";

  const label =
    score <= 2 ? "Weak" :
    score <= 3 ? "Fair" :
    score <= 4 ? "Good" :
    "Strong";

  return (
    <div style={{ marginTop: 8 }}>
      {/* Strength bar */}
      <div style={{ display: "flex", gap: 3, marginBottom: 6 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              background: i <= score ? barColor : "var(--bg-surface-3)",
              transition: "background 0.2s ease",
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: barColor }}>{label}</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {checks.map((c) => (
            <span
              key={c.label}
              style={{
                fontSize: 10,
                color: c.pass ? "var(--success)" : "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                gap: 2,
              }}
            >
              {c.pass ? "\u2713" : "\u2717"} {c.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Audit Log Section ──────────────────────────────────────────────────────

interface AuditEntry {
  id: number;
  timestamp: string;
  event_type: string;
  username: string;
  client_ip: string;
  detail: string;
}

function AuditLogSection() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const fetchLogs = () => {
    setLoading(true);
    apiFetch("/api/admin/secure/audit-log?limit=30")
      .then((r) => r.json())
      .then((data) => { setLogs(data.logs || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchLogs(); }, []);

  const eventColor = (type: string) => {
    if (type.includes("FAILED") || type.includes("ERROR")) return "var(--danger)";
    if (type.includes("SUCCESS") || type.includes("CHANGED") || type.includes("RESET")) return "var(--success)";
    if (type.includes("RATE")) return "var(--warning)";
    return "var(--text-secondary)";
  };

  const eventIcon = (type: string) => {
    if (type.includes("LOGIN")) return "sign-in";
    if (type.includes("PASSWORD")) return "key";
    if (type.includes("EXPORT")) return "download";
    return "event";
  };

  const formatTs = (ts: string) => {
    try {
      return new Date(ts).toLocaleString("en-AE", {
        month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
      });
    } catch { return ts; }
  };

  const cardStyle = {
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: "22px 24px",
    marginBottom: 18,
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
        <SectionHeader
          icon={
            <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
          }
          title="Security Audit Log"
          subtitle="Recent login attempts, password changes, and security events"
          iconColor="var(--danger)"
        />
        <button
          onClick={fetchLogs}
          className="btn-ghost"
          style={{ padding: "5px 12px", fontSize: 12, flexShrink: 0, marginTop: 2 }}
        >
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ display: "inline", marginRight: 5 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 38, borderRadius: 7 }} />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div style={{ padding: "16px", textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>
          No audit events recorded yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {(expanded ? logs : logs.slice(0, 8)).map((log) => (
            <div
              key={log.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "8px 12px",
                background: "var(--bg-surface-2)",
                borderRadius: 7,
                border: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: eventColor(log.event_type),
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: "var(--font-mono)",
                      color: eventColor(log.event_type),
                      letterSpacing: "0.03em",
                    }}
                  >
                    {log.event_type}
                  </span>
                  {log.username && (
                    <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                      {log.username}
                    </span>
                  )}
                  {log.client_ip && (
                    <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                      {log.client_ip}
                    </span>
                  )}
                </div>
              </div>
              <span style={{ fontSize: 10.5, color: "var(--text-muted)", flexShrink: 0 }}>
                {formatTs(log.timestamp)}
              </span>
            </div>
          ))}
          {logs.length > 8 && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 12,
                color: "var(--accent)",
                fontFamily: "var(--font-sans)",
                padding: "6px 0",
                textAlign: "center",
              }}
            >
              {expanded ? "Show less" : `Show all ${logs.length} events`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdState, setPwdState] = useState<FormState>(defaultFormState);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [secState, setSecState] = useState<FormState>(defaultFormState);

  const [monitoring, setMonitoring] = useState<MonitoringStatus | null>(null);
  const [monitorLoading, setMonitorLoading] = useState(true);

  const fetchMonitoring = () => {
    setMonitorLoading(true);
    apiFetch("/api/admin/secure/monitoring-status")
      .then((r) => r.json())
      .then((data: MonitoringStatus) => { setMonitoring(data); setMonitorLoading(false); })
      .catch(() => setMonitorLoading(false));
  };

  useEffect(() => { fetchMonitoring(); }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPwdState({ loading: false, success: "", error: "New passwords do not match." });
      return;
    }
    if (newPassword.length < 8) {
      setPwdState({ loading: false, success: "", error: "Password must be at least 8 characters." });
      return;
    }
    setPwdState({ loading: true, success: "", error: "" });
    try {
      const res = await apiFetch("/api/admin/secure/change-password", {
        method: "POST",
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to update password.");
      setPwdState({ loading: false, success: "Password updated successfully.", error: "" });
      setOldPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (err: unknown) {
      setPwdState({ loading: false, success: "", error: err instanceof Error ? err.message : "An error occurred." });
    }
  };

  const handleSetSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !answer.trim()) {
      setSecState({ loading: false, success: "", error: "Both question and answer are required." });
      return;
    }
    setSecState({ loading: true, success: "", error: "" });
    try {
      const res = await apiFetch("/api/admin/secure/set-security-question", {
        method: "POST",
        body: JSON.stringify({ question: question.trim(), answer: answer.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to update security question.");
      setSecState({ loading: false, success: "Security question configured successfully.", error: "" });
      setQuestion(""); setAnswer("");
    } catch (err: unknown) {
      setSecState({ loading: false, success: "", error: err instanceof Error ? err.message : "An error occurred." });
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "Never";
    try {
      return new Date(iso).toLocaleString("en-AE", { dateStyle: "medium", timeStyle: "short" });
    } catch { return iso; }
  };

  const statusColor = (s: string) => {
    if (s === "completed_ok") return "var(--success)";
    if (s === "error") return "var(--danger)";
    if (s === "running") return "var(--gold)";
    return "var(--text-muted)";
  };

  const statusLabel = (s: string) => {
    if (s === "completed_ok") return "Completed OK";
    if (s === "error") return "Error";
    if (s === "running") return "Running";
    return s.replace(/_/g, " ");
  };

  const inputStyle = {
    width: "100%",
    padding: "9px 12px",
    background: "var(--bg-surface-2)",
    border: "1px solid var(--border)",
    borderRadius: 7,
    color: "var(--text-primary)",
    fontFamily: "var(--font-sans)",
    fontSize: 13.5,
    outline: "none",
    boxSizing: "border-box" as const,
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
  };

  const cardStyle = {
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: "22px 24px",
    marginBottom: 18,
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      {/* Header */}
      <div
        style={{
          flexShrink: 0,
          padding: "16px 24px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-surface)",
        }}
      >
        <h1
          style={{
            fontSize: 18,
            fontWeight: 700,
            background: "linear-gradient(135deg, var(--accent-hover), var(--gold))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            marginBottom: 2,
          }}
        >
          Security Settings
        </h1>
        <p style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
          Admin account security and monitoring configuration
        </p>
      </div>

      <div style={{ flex: 1, padding: "24px", maxWidth: 680 }}>

        {/* Monitoring metrics row */}
        {monitoring && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 12,
              marginBottom: 22,
            }}
          >
            {[
              {
                label: "Status",
                value: statusLabel(monitoring.last_status),
                color: statusColor(monitoring.last_status),
                icon: (
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ),
              },
              {
                label: "Total Cycles",
                value: monitoring.total_runs.toString(),
                color: "var(--text-primary)",
                icon: (
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                ),
              },
              {
                label: "Chunks Added",
                value: monitoring.chunks_added.toLocaleString(),
                color: "var(--accent)",
                icon: (
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                ),
              },
              {
                label: "Last Run",
                value: monitoring.last_run ? new Date(monitoring.last_run).toLocaleTimeString("en-AE", { hour: "2-digit", minute: "2-digit" }) : "Never",
                color: "var(--text-secondary)",
                icon: (
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ),
              },
            ].map(({ label, value, color, icon }) => (
              <div
                key={label}
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "14px 16px",
                }}
              >
                <div style={{ color: "var(--text-muted)", marginBottom: 8 }}>{icon}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color, lineHeight: 1, marginBottom: 4 }}>{value}</div>
                <div style={{ fontSize: 10.5, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Change Password */}
        <div style={cardStyle}>
          <SectionHeader
            icon={
              <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            }
            title="Change Password"
            subtitle="Update your administrator account password"
            iconColor="var(--accent)"
          />
          <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { label: "Current Password", value: oldPassword, setter: setOldPassword },
              { label: "New Password", value: newPassword, setter: setNewPassword },
              { label: "Confirm New Password", value: confirmPassword, setter: setConfirmPassword },
            ].map(({ label, value, setter }) => (
              <div key={label}>
                <label
                  style={{
                    display: "block",
                    fontSize: 10.5,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--text-muted)",
                    marginBottom: 6,
                  }}
                >
                  {label}
                </label>
                <input
                  type="password"
                  required
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  style={inputStyle}
                  {...inputFocusStyle()}
                />
              </div>
            ))}
            <PasswordStrengthMeter password={newPassword} />
            <FormFeedback state={pwdState} />
            <button type="submit" disabled={pwdState.loading} className="btn-primary" style={{ padding: "10px 20px", alignSelf: "flex-start", fontSize: 13 }}>
              {pwdState.loading ? (
                <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span className="spinner" style={{ width: 13, height: 13 }} />
                  Updating...
                </span>
              ) : "Update Password"}
            </button>
          </form>
        </div>

        {/* Security Question */}
        <div style={cardStyle}>
          <SectionHeader
            icon={
              <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
            title="Security Question"
            subtitle="Configure a security question to enable password recovery without admin intervention."
            iconColor="var(--gold)"
          />
          <form onSubmit={handleSetSecurity} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 10.5,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--text-muted)",
                  marginBottom: 6,
                }}
              >
                Security Question
              </label>
              <input
                type="text"
                required
                placeholder="e.g. What is the name of your first pet?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                style={inputStyle}
                {...inputFocusStyle("var(--gold)", "rgba(245,166,35,0.1)")}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 10.5,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--text-muted)",
                  marginBottom: 6,
                }}
              >
                Answer
              </label>
              <input
                type="text"
                required
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                style={inputStyle}
                {...inputFocusStyle("var(--gold)", "rgba(245,166,35,0.1)")}
              />
            </div>
            <FormFeedback state={secState} />
            <button
              type="submit"
              disabled={secState.loading}
              className="btn-gold"
              style={{ padding: "10px 20px", alignSelf: "flex-start", fontSize: 13 }}
            >
              {secState.loading ? (
                <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span className="spinner" style={{ width: 13, height: 13 }} />
                  Saving...
                </span>
              ) : "Save Security Question"}
            </button>
          </form>
        </div>

        {/* Auto-Monitor */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
            <SectionHeader
              icon={
                <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              }
              title="Auto-Monitoring Agent"
              subtitle="Crawls UAE NESA, ISO 27001:2022, UAE PDPL, and related standards every 6 hours"
              iconColor="var(--success)"
            />
            <div style={{ display: "flex", gap: 6, flexShrink: 0, marginTop: 2 }}>
              <button
                onClick={async () => {
                  try {
                    const res = await apiFetch("/api/admin/secure/monitoring-run", { method: "POST" });
                    const data = await res.json();
                    if (data.status === "already_running") alert("Monitor is already running.");
                    else { alert("Monitoring cycle started. Check back in a few minutes."); setTimeout(fetchMonitoring, 5000); }
                  } catch { alert("Failed to trigger monitoring."); }
                }}
                className="btn-primary"
                style={{ padding: "5px 12px", fontSize: 12 }}
              >
                Run Now
              </button>
              <button
                onClick={fetchMonitoring}
                className="btn-ghost"
                style={{ padding: "5px 12px", fontSize: 12 }}
              >
                Refresh
              </button>
            </div>
          </div>

          {monitorLoading ? (
            <div style={{ display: "flex", gap: 6, padding: "8px 0" }}>
              {[...Array(3)].map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 20, borderRadius: 5, flex: 1 }} />
              ))}
            </div>
          ) : monitoring ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { label: "Status", value: statusLabel(monitoring.last_status), color: statusColor(monitoring.last_status) },
                  { label: "Last Run", value: formatDate(monitoring.last_run), color: "var(--text-secondary)" },
                  { label: "Total Monitoring Cycles", value: monitoring.total_runs.toString(), color: "var(--text-primary)" },
                  { label: "Chunks Ingested into ChromaDB", value: monitoring.chunks_added.toLocaleString(), color: "var(--accent)" },
                ].map(({ label, value, color }) => (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      background: "var(--bg-surface-2)",
                      borderRadius: 7,
                      border: "1px solid var(--border)",
                    }}
                  >
                    <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color }}>{value}</span>
                  </div>
                ))}
              </div>

              {monitoring.last_error && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: "rgba(239,68,68,0.07)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    color: "var(--danger)",
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  <strong>Last error:</strong> {monitoring.last_error}
                </div>
              )}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Unable to load monitoring status.</p>
          )}
        </div>

        {/* Audit Log */}
        <AuditLogSection />

        {/* Keyboard Shortcuts */}
        <div style={cardStyle}>
          <SectionHeader
            icon={
              <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
              </svg>
            }
            title="Keyboard Shortcuts"
            subtitle="Quick navigation with keyboard"
            iconColor="var(--sapphire)"
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { keys: "Ctrl + 1", action: "Policy Advisor" },
              { keys: "Ctrl + 2", action: "Policy Generator" },
              { keys: "Ctrl + 3", action: "Security Settings" },
              { keys: "Escape", action: "Clear input focus" },
            ].map(({ keys, action }) => (
              <div
                key={keys}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "7px 12px",
                  background: "var(--bg-surface-2)",
                  borderRadius: 7,
                  border: "1px solid var(--border)",
                }}
              >
                <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{action}</span>
                <kbd
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    padding: "2px 8px",
                    borderRadius: 5,
                    background: "var(--bg-surface-3)",
                    border: "1px solid var(--border)",
                    color: "var(--text-muted)",
                  }}
                >
                  {keys}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
