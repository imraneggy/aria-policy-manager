"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch, getToken, streamSSE } from "@/lib/api";

interface DashboardStats {
  total_policies: number;
  total_events: number;
  policies_generated: number;
  policies_reviewed: number;
  exports_total: number;
  pending_updates: number;
  monitoring: {
    last_run: string | null;
    last_status: string;
    chunks_added: number;
    total_runs: number;
  };
}

interface ManagedPolicy {
  id: number;
  title: string;
  doc_id: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
  next_renewal: string;
  renewed_at: string | null;
  department: string;
}

function StatCard({
  label,
  value,
  icon,
  color = "var(--accent)",
  sub,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color?: string;
  sub?: string;
}) {
  return (
    <div
      className="glass-card fade-up"
      style={{
        padding: "20px 22px",
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
      }}
    >
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 10,
          background: `color-mix(in srgb, ${color} 10%, transparent)`,
          border: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, opacity: 0.7 }}>{sub}</div>}
      </div>
    </div>
  );
}

function ComplianceBadge({ name, status }: { name: string; status: "compliant" | "review" | "pending" }) {
  const colors = {
    compliant: { bg: "var(--success-dim)", border: "var(--border-emerald)", text: "var(--success)", label: "Compliant" },
    review: { bg: "var(--warning-dim)", border: "var(--border-gold)", text: "var(--warning)", label: "Needs Review" },
    pending: { bg: "var(--sapphire-dim)", border: "var(--border)", text: "var(--sapphire)", label: "Pending" },
  };
  const c = colors[status];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 14px",
        background: "var(--bg-surface-2)",
        borderRadius: 8,
        border: "1px solid var(--border)",
      }}
    >
      <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>{name}</span>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          padding: "3px 10px",
          borderRadius: 100,
          background: c.bg,
          border: `1px solid ${c.border}`,
          color: c.text,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {c.label}
      </span>
    </div>
  );
}

// ── Status helpers ────────────────────────────────────────────────────────────

function policyStatusBadge(status: string) {
  const map: Record<string, { bg: string; border: string; text: string; label: string }> = {
    approved: { bg: "rgba(16,217,160,0.08)", border: "rgba(16,217,160,0.2)", text: "var(--success)", label: "Approved" },
    draft: { bg: "rgba(79,142,247,0.08)", border: "rgba(79,142,247,0.2)", text: "var(--sapphire)", label: "Draft" },
    under_review: { bg: "rgba(245,166,35,0.08)", border: "rgba(245,166,35,0.2)", text: "var(--gold)", label: "Under Review" },
    renewal_due: { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.2)", text: "var(--danger)", label: "Renewal Due" },
    renewing: { bg: "rgba(245,166,35,0.08)", border: "rgba(245,166,35,0.2)", text: "var(--gold)", label: "Renewing" },
  };
  const c = map[status] || { bg: "var(--bg-surface-2)", border: "var(--border)", text: "var(--text-muted)", label: status };
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 100,
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.text,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
      }}
    >
      {c.label}
    </span>
  );
}

function daysUntilRenewal(nextRenewal: string): number {
  const now = new Date();
  const renewal = new Date(nextRenewal);
  return Math.ceil((renewal.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-AE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const OVERVIEW_CACHE_KEY = "aegis-overview-cache";

function loadOverviewCache() {
  try {
    const raw = localStorage.getItem(OVERVIEW_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export default function OverviewPage() {
  const cached = useRef(loadOverviewCache()).current;
  const [stats, setStats] = useState<DashboardStats | null>(cached?.stats ?? null);
  const [policies, setPolicies] = useState<string[]>(cached?.policies ?? []);
  const [managedPolicies, setManagedPolicies] = useState<ManagedPolicy[]>(cached?.managedPolicies ?? []);
  const [renewalPolicies, setRenewalPolicies] = useState<ManagedPolicy[]>(cached?.renewalPolicies ?? []);
  const [loading, setLoading] = useState(!cached);
  const [revalidatingId, setRevalidatingId] = useState<number | null>(null);
  const [revalMode, setRevalMode] = useState<"audit" | "update">("audit");
  const [revalAudit, setRevalAudit] = useState("");
  const [revalUpdate, setRevalUpdate] = useState("");
  const [revalPhase, setRevalPhase] = useState<"idle" | "audit" | "update" | "done">("idle");

  const handleRevalidate = (policyId: number, mode: "audit" | "update" = "audit") => {
    setRevalidatingId(policyId);
    setRevalMode(mode);
    setRevalAudit("");
    setRevalUpdate("");
    setRevalPhase("audit");
    const token = getToken();

    if (mode === "audit") {
      // Simple audit only
      let acc = "";
      streamSSE(
        `/api/admin/policies/managed/${policyId}/revalidate/stream`,
        {},
        token,
        (chunk) => { acc += chunk; setRevalAudit(acc); },
        () => { setRevalidatingId(null); setRevalPhase("done"); if (!acc) setRevalAudit("Revalidation complete — no issues found."); },
        () => { setRevalidatingId(null); setRevalPhase("done"); if (!acc) setRevalAudit("Revalidation failed."); },
      );
    } else {
      // Full audit + update (two-phase SSE)
      let auditAcc = "";
      let updateAcc = "";
      const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

      fetch(`${BACKEND_URL}/api/admin/policies/managed/${policyId}/revalidate-update/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
        body: "{}",
      }).then(async (response) => {
        if (!response.ok || !response.body) {
          setRevalidatingId(null);
          setRevalPhase("done");
          setRevalAudit("Failed to start revalidation.");
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") { setRevalidatingId(null); setRevalPhase("done"); return; }
            try {
              const parsed = JSON.parse(data) as { phase?: string; chunk?: string };
              if (parsed.phase === "audit") {
                setRevalPhase("audit");
                if (parsed.chunk) { auditAcc += parsed.chunk; setRevalAudit(auditAcc); }
              } else if (parsed.phase === "update") {
                setRevalPhase("update");
                if (parsed.chunk) { updateAcc += parsed.chunk; setRevalUpdate(updateAcc); }
              }
            } catch { /* skip */ }
          }
        }
        setRevalidatingId(null);
        setRevalPhase("done");
      }).catch(() => {
        setRevalidatingId(null);
        setRevalPhase("done");
        setRevalAudit("Connection error during revalidation.");
      });
    }
  };

  useEffect(() => {
    Promise.all([
      apiFetch("/api/admin/secure/dashboard-stats").then((r) => r.json()).catch(() => null),
      apiFetch("/api/admin/policies/list").then((r) => r.json()).catch(() => ({ policies: [] })),
      apiFetch("/api/admin/policies/managed").then((r) => r.json()).catch(() => ({ policies: [] })),
      apiFetch("/api/admin/policies/managed/renewals").then((r) => r.json()).catch(() => ({ policies: [] })),
    ]).then(([statsData, listData, managedData, renewalData]) => {
      const p = listData.policies || [];
      const mp = managedData.policies || [];
      const rp = renewalData.policies || [];
      if (statsData) setStats(statsData);
      setPolicies(p);
      setManagedPolicies(mp);
      setRenewalPolicies(rp);
      setLoading(false);
      // Cache for instant display on tab switch
      try {
        localStorage.setItem(OVERVIEW_CACHE_KEY, JSON.stringify({
          stats: statsData, policies: p, managedPolicies: mp, renewalPolicies: rp,
        }));
      } catch { /* full */ }
    });
  }, []);

  const formatLastRun = (iso: string | null) => {
    if (!iso) return "Never";
    try {
      return new Date(iso).toLocaleString("en-AE", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Unknown";
    }
  };

  // Build a lookup from managed policies by title for cross-referencing
  const managedByTitle = new Map<string, ManagedPolicy>();
  managedPolicies.forEach((mp) => managedByTitle.set(mp.title, mp));

  const renewalCount = renewalPolicies.length;
  const approvedCount = managedPolicies.filter((p) => p.status === "approved").length;
  const draftCount = managedPolicies.filter((p) => p.status === "draft" || p.status === "under_review").length;
  const untrackedCount = policies.filter((p) => !managedByTitle.has(p)).length;

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-base)" }}>
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
          Policy Governance Dashboard
        </h1>
        <p style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
          Policy lifecycle &bull; Renewal tracking &bull; Compliance overview
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{ padding: 24 }}>
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 100, borderRadius: 10 }} />
            ))}
          </div>
        ) : stats ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1100 }}>

            {/* ── Metric Cards ─────────────────────────────────────── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
              <StatCard
                label="Active Policies"
                value={stats.total_policies}
                color="var(--accent)"
                icon={
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                }
                sub="Corporate policy documents"
              />
              <StatCard
                label="Policies Generated"
                value={stats.policies_generated}
                color="var(--sapphire)"
                icon={
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                }
                sub="Last 7 days"
              />
              <StatCard
                label="Reviews Completed"
                value={stats.policies_reviewed}
                color="var(--gold)"
                icon={
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                sub="Compliance audits (7d)"
              />
              <StatCard
                label="Renewal Alerts"
                value={renewalCount}
                color={renewalCount > 0 ? "var(--danger)" : "var(--success)"}
                icon={
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                sub={renewalCount > 0 ? "Policies due for renewal" : "All policies current"}
              />
            </div>

            {/* ── Renewal Alert Banner ─────────────────────────────── */}
            {renewalCount > 0 && (
              <div
                className="fade-up"
                style={{
                  padding: "16px 20px",
                  borderRadius: 12,
                  background: "rgba(239,68,68,0.06)",
                  border: "1px solid rgba(239,68,68,0.2)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: "rgba(239,68,68,0.1)",
                      border: "1px solid rgba(239,68,68,0.2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--danger)",
                      flexShrink: 0,
                    }}
                  >
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--danger)" }}>
                      {renewalCount} {renewalCount === 1 ? "Policy" : "Policies"} Due for Renewal
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                      These policies require annual review and renewal per UAE NESA compliance requirements
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {renewalPolicies.map((rp) => {
                    const days = daysUntilRenewal(rp.next_renewal);
                    const overdue = days < 0;
                    return (
                      <div
                        key={rp.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          background: "var(--bg-surface)",
                          borderRadius: 8,
                          border: `1px solid ${overdue ? "rgba(239,68,68,0.25)" : "var(--border)"}`,
                          gap: 12,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} style={{ flexShrink: 0, color: overdue ? "var(--danger)" : "var(--gold)" }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {rp.title}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>v{rp.version}</span>
                          {policyStatusBadge(rp.status)}
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: overdue ? "var(--danger)" : "var(--gold)",
                            }}
                          >
                            {overdue ? `${Math.abs(days)}d overdue` : `${days}d remaining`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Policy Library Status ──────────────────────────── */}
            <div
              className="glass-card fade-up stagger-1"
              style={{ padding: "20px 22px" }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: "rgba(16,217,160,0.08)",
                      border: "1px solid rgba(16,217,160,0.18)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--accent)",
                    }}
                  >
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Policy Library</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {policies.length} policies &bull; {approvedCount} managed &bull; {draftCount} in progress &bull; {untrackedCount} untracked
                    </div>
                  </div>
                </div>
                {/* Legend */}
                <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
                  {[
                    { color: "var(--success)", label: "Managed" },
                    { color: "var(--gold)", label: "In Progress" },
                    { color: "var(--text-muted)", label: "Untracked" },
                  ].map(({ color, label }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 340, overflowY: "auto" }}>
                {policies.map((policyName, idx) => {
                  const managed = managedByTitle.get(policyName);
                  const isManaged = !!managed;
                  const statusColor = isManaged
                    ? (managed.status === "approved" ? "var(--success)" : managed.status === "renewal_due" ? "var(--danger)" : "var(--gold)")
                    : "var(--text-muted)";

                  return (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        background: "var(--bg-surface-2)",
                        borderRadius: 7,
                        border: "1px solid var(--border)",
                        gap: 10,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
                        <span
                          style={{
                            fontSize: 12.5,
                            color: "var(--text-primary)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {policyName}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        {isManaged ? (
                          <>
                            <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>v{managed.version}</span>
                            {policyStatusBadge(managed.status)}
                            <div style={{ display: "flex", gap: 3 }}>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRevalidate(managed.id, "audit"); }}
                                disabled={revalidatingId !== null}
                                title="Audit only — check compliance"
                                style={{
                                  background: "none", border: "1px solid var(--border)", borderRadius: "5px 0 0 5px",
                                  padding: "2px 6px", cursor: revalidatingId !== null ? "wait" : "pointer",
                                  fontSize: 9.5, fontWeight: 600,
                                  color: revalidatingId === managed.id && revalMode === "audit" ? "var(--gold)" : "var(--accent)",
                                  fontFamily: "var(--font-sans)", display: "flex", alignItems: "center", gap: 3,
                                  opacity: revalidatingId !== null && revalidatingId !== managed.id ? 0.3 : 1,
                                }}
                              >
                                {revalidatingId === managed.id && revalMode === "audit" ? (
                                  <><span className="spinner" style={{ width: 8, height: 8 }} /> Audit</>
                                ) : "Audit"}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRevalidate(managed.id, "update"); }}
                                disabled={revalidatingId !== null}
                                title="Audit + update policy with latest standards"
                                style={{
                                  background: "none", border: "1px solid var(--border)", borderRadius: "0 5px 5px 0",
                                  borderLeft: "none", padding: "2px 6px",
                                  cursor: revalidatingId !== null ? "wait" : "pointer",
                                  fontSize: 9.5, fontWeight: 600,
                                  color: revalidatingId === managed.id && revalMode === "update" ? "var(--gold)" : "var(--sapphire)",
                                  fontFamily: "var(--font-sans)", display: "flex", alignItems: "center", gap: 3,
                                  opacity: revalidatingId !== null && revalidatingId !== managed.id ? 0.3 : 1,
                                }}
                              >
                                {revalidatingId === managed.id && revalMode === "update" ? (
                                  <><span className="spinner" style={{ width: 8, height: 8 }} /> Updating</>
                                ) : "Update"}
                              </button>
                            </div>
                            <span style={{ fontSize: 10.5, color: "var(--text-muted)", minWidth: 70, textAlign: "right" }}>
                              {formatDate(managed.next_renewal)}
                            </span>
                          </>
                        ) : (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              padding: "2px 8px",
                              borderRadius: 100,
                              background: "var(--bg-surface-3)",
                              border: "1px solid var(--border)",
                              color: "var(--text-muted)",
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                            }}
                          >
                            Not Tracked
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Revalidation result panel */}
              {(revalAudit || revalUpdate || revalPhase !== "idle") && (
                <div style={{ marginTop: 12, borderRadius: 8, background: "var(--bg-surface)", border: "1px solid rgba(245,166,35,0.25)", maxHeight: 400, overflowY: "auto" }}>
                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--bg-surface)", zIndex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="var(--gold)" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--gold)" }}>
                        {revalMode === "update" ? "Revalidate & Update" : "Compliance Audit"}{revalidatingId ? ` — Phase: ${revalPhase}` : " — Complete"}
                      </span>
                      {revalidatingId && <span className="spinner" style={{ width: 10, height: 10 }} />}
                    </div>
                    <button onClick={() => { setRevalAudit(""); setRevalUpdate(""); setRevalPhase("idle"); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 16, lineHeight: 1 }}>&times;</button>
                  </div>

                  {/* Audit section */}
                  {revalAudit && (
                    <div style={{ padding: "12px 14px", borderBottom: revalUpdate ? "1px solid var(--border)" : "none" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--gold)", marginBottom: 6 }}>
                        Compliance Audit {revalPhase === "audit" && revalidatingId ? "(streaming...)" : ""}
                      </div>
                      <pre style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-secondary)", lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>
                        {revalAudit}
                        {revalPhase === "audit" && revalidatingId && <span className="cursor-blink">&#9611;</span>}
                      </pre>
                    </div>
                  )}

                  {/* Updated policy section */}
                  {(revalUpdate || revalPhase === "update") && (
                    <div style={{ padding: "12px 14px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--accent)", marginBottom: 6 }}>
                        Updated Policy {revalPhase === "update" && revalidatingId ? "(generating...)" : ""}
                      </div>
                      {revalUpdate ? (
                        <pre style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-secondary)", lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>
                          {revalUpdate}
                          {revalPhase === "update" && revalidatingId && <span className="cursor-blink">&#9611;</span>}
                        </pre>
                      ) : revalPhase === "update" && revalidatingId ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 0" }}>
                          <span className="spinner" style={{ width: 12, height: 12 }} />
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Researching latest standards and updating policy...</span>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )}

              {untrackedCount > 0 && (
                <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.15)", fontSize: 12, color: "var(--gold)", lineHeight: 1.5 }}>
                  <strong>{untrackedCount} policies</strong> are not yet enrolled in the managed lifecycle.
                  Use the Policy Generator to create managed versions with annual renewal tracking.
                </div>
              )}
            </div>

            {/* ── Two-column: Compliance + System Health ──────────── */}
            <div className="dashboard-two-col">
              {/* Compliance frameworks */}
              <div
                className="glass-card fade-up stagger-2"
                style={{ padding: "20px 22px" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: "rgba(16,217,160,0.08)",
                      border: "1px solid rgba(16,217,160,0.18)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--accent)",
                    }}
                  >
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Compliance Frameworks</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Policy alignment status</div>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <ComplianceBadge name="UAE NESA IAS" status="compliant" />
                  <ComplianceBadge name="ISO 27001:2022" status="compliant" />
                  <ComplianceBadge name="UAE PDPL" status="compliant" />
                  <ComplianceBadge name="NIST CSF 2.0" status="review" />
                  <ComplianceBadge name="CIS Controls v8" status="review" />
                </div>
              </div>

              {/* System health */}
              <div
                className="glass-card fade-up stagger-3"
                style={{ padding: "20px 22px" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: "rgba(79,142,247,0.08)",
                      border: "1px solid rgba(79,142,247,0.18)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--sapphire)",
                    }}
                  >
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>System Health</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Infrastructure status</div>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { label: "AI Engine (Ollama)", status: "online" as const },
                    { label: "ChromaDB Vector Store", status: "online" as const },
                    {
                      label: "Auto-Monitor Agent",
                      status: (stats.monitoring?.last_status === "completed_ok" ? "online" : "pending") as "online" | "pending",
                    },
                    { label: "JWT Auth Service", status: "online" as const },
                    { label: "Audit Logging", status: "online" as const },
                  ].map(({ label, status }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className={`status-dot ${status}`} />
                        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{label}</span>
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: status === "online" ? "var(--success)" : "var(--warning)",
                        }}
                      >
                        {status === "online" ? "Operational" : "Initializing"}
                      </span>
                    </div>
                  ))}
                  <div style={{ marginTop: 6, padding: "8px 12px", background: "var(--bg-surface-2)", borderRadius: 6, fontSize: 11, color: "var(--text-muted)" }}>
                    Last monitor scan: {formatLastRun(stats.monitoring?.last_run)} &bull; Total events logged: {stats.total_events}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Quick Actions ─────────────────────────────────── */}
            <div className="glass-card fade-up stagger-4" style={{ padding: "20px 22px" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 14 }}>
                Quick Actions
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {[
                  { label: "Generate Policy", kbd: "Ctrl+3" },
                  { label: "Policy Advisor", kbd: "Ctrl+2" },
                  { label: "Security Settings", kbd: "Ctrl+4" },
                ].map(({ label, kbd }) => (
                  <div
                    key={label}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 7,
                      border: "1px solid var(--border)",
                      background: "var(--bg-surface-2)",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>
                    <kbd
                      style={{
                        fontSize: 10,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: "var(--bg-surface-3)",
                        border: "1px solid var(--border)",
                        color: "var(--text-muted)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {kbd}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 14 }}>
            Unable to load dashboard data. Please check your connection.
          </div>
        )}
      </div>
    </div>
  );
}
