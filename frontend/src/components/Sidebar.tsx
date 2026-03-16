"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, clearToken } from "@/lib/api";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

interface MonitoringStatus {
  last_run: string | null;
  last_status: string;
  chunks_added: number;
  total_runs: number;
}

interface SystemStatus {
  aiEngine: "online" | "offline" | "pending";
  vectorDb: "online" | "offline" | "pending";
  autoMonitor: "online" | "offline" | "pending";
  lastMonitorRun: string | null;
}

const navItems = [
  {
    id: "chat",
    label: "Expert Chat",
    description: "AI policy advisor",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    id: "generate",
    label: "Policy Generator",
    description: "Draft & audit policies",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Security Settings",
    description: "Account & monitoring",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
];

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const router = useRouter();
  const [policies, setPolicies] = useState<string[]>([]);
  const [filteredPolicies, setFilteredPolicies] = useState<string[]>([]);
  const [policySearch, setPolicySearch] = useState("");
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    aiEngine: "pending",
    vectorDb: "pending",
    autoMonitor: "pending",
    lastMonitorRun: null,
  });
  const [username, setUsername] = useState<string>("admin");
  const policyListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch("/api/admin/policies/list")
      .then((r) => r.json())
      .then((data) => {
        if (data.policies) {
          setPolicies(data.policies);
          setFilteredPolicies(data.policies);
        }
      })
      .catch(() => {});

    apiFetch("/api/admin/secure/monitoring-status")
      .then((r) => r.json())
      .then((data: MonitoringStatus) => {
        const monitorOnline = data.last_status === "completed_ok" || data.total_runs > 0;
        setSystemStatus({
          aiEngine: "online",
          vectorDb: "online",
          autoMonitor: monitorOnline ? "online" : "pending",
          lastMonitorRun: data.last_run,
        });
      })
      .catch(() => {
        setSystemStatus((s) => ({ ...s, aiEngine: "offline", vectorDb: "offline" }));
      });

    apiFetch("/api/admin/me")
      .then((r) => r.json())
      .then((data) => { if (data.username) setUsername(data.username); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const q = policySearch.toLowerCase().trim();
    setFilteredPolicies(q ? policies.filter((p) => p.toLowerCase().includes(q)) : policies);
  }, [policySearch, policies]);

  const handleSignOut = () => {
    clearToken();
    router.push("/");
  };

  const formatLastRun = (iso: string | null) => {
    if (!iso) return "never";
    try {
      return new Date(iso).toLocaleString("en-AE", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "unknown";
    }
  };

  const handlePolicyClick = (policyName: string) => {
    const q = encodeURIComponent(`Explain our ${policyName}`);
    router.push(`/dashboard/chat?q=${q}`);
  };

  const statusLabel = (s: "online" | "offline" | "pending") =>
    s === "online" ? "Online" : s === "offline" ? "Offline" : "Checking";

  const statusTextColor = (s: "online" | "offline" | "pending") =>
    s === "online" ? "var(--success)" : s === "offline" ? "var(--danger)" : "var(--text-muted)";

  return (
    <aside
      className="flex flex-col h-full overflow-hidden"
      style={{
        width: "var(--sidebar-width)",
        minWidth: "var(--sidebar-width)",
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border)",
        position: "relative",
      }}
    >
      {/* Subtle top accent line */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: "linear-gradient(90deg, transparent, var(--accent), transparent)",
          opacity: 0.4,
        }}
      />

      {/* Logo */}
      <div
        style={{
          padding: "18px 18px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 11,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "rgba(16,217,160,0.08)",
            border: "1px solid rgba(16,217,160,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 36 36" fill="none">
            <path
              d="M18 3L4 9v10c0 8.284 5.954 16.027 14 18 8.046-1.973 14-9.716 14-18V9L18 3z"
              fill="rgba(16,217,160,0.15)"
              stroke="#10d9a0"
              strokeWidth="1.5"
            />
            <path d="M13 18l3 3 7-7" stroke="#10d9a0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: "0.06em",
              color: "var(--text-primary)",
              lineHeight: 1.1,
            }}
          >
            ARIA
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 2, lineHeight: 1 }}>
            Ali &amp; Sons Holding
          </div>
        </div>
      </div>

      {/* System Status */}
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 10 }}>
          System Status
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { key: "aiEngine" as const, label: "AI Engine" },
            { key: "vectorDb" as const, label: "Vector DB" },
            { key: "autoMonitor" as const, label: "Auto-Monitor" },
          ].map(({ key, label }) => (
            <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={`status-dot ${systemStatus[key]}`} />
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 500, color: statusTextColor(systemStatus[key]) }}>
                {key === "autoMonitor"
                  ? formatLastRun(systemStatus.lastMonitorRun)
                  : statusLabel(systemStatus[key])}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ padding: "12px 10px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 8, paddingLeft: 6 }}>
          Navigation
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`nav-item${isActive ? " active" : ""}`}
                style={{ textAlign: "left", width: "100%" }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ opacity: isActive ? 1 : 0.6, transition: "opacity 0.15s" }}>
                    {item.icon}
                  </span>
                  <span>
                    <span style={{ display: "block", fontWeight: isActive ? 600 : 400, fontSize: 13 }}>
                      {item.label}
                    </span>
                    <span style={{ display: "block", fontSize: 10.5, opacity: 0.5, marginTop: 1 }}>
                      {item.description}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Policy Library */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", padding: "12px 10px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, paddingLeft: 6, paddingRight: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)" }}>
            Policy Library
          </div>
          {policies.length > 0 && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 7px",
                borderRadius: 999,
                background: "rgba(16,217,160,0.1)",
                border: "1px solid rgba(16,217,160,0.2)",
                color: "var(--accent)",
              }}
            >
              {policies.length}
            </span>
          )}
        </div>

        {/* Search */}
        {policies.length > 4 && (
          <div style={{ position: "relative", marginBottom: 8 }}>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              style={{
                position: "absolute",
                left: 9,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
                pointerEvents: "none",
              }}
            >
              <circle cx="11" cy="11" r="8" />
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={policySearch}
              onChange={(e) => setPolicySearch(e.target.value)}
              placeholder="Search policies..."
              style={{
                width: "100%",
                padding: "6px 10px 6px 28px",
                background: "var(--bg-surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 7,
                color: "var(--text-primary)",
                fontFamily: "var(--font-sans)",
                fontSize: 12,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        )}

        <div ref={policyListRef} style={{ flex: 1, overflowY: "auto", paddingRight: 2 }}>
          {policies.length === 0 ? (
            <div style={{ padding: "8px 6px", display: "flex", flexDirection: "column", gap: 6 }}>
              {[...Array(5)].map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 28, borderRadius: 6 }} />
              ))}
            </div>
          ) : filteredPolicies.length === 0 ? (
            <div style={{ padding: "12px 6px", fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
              No policies match &ldquo;{policySearch}&rdquo;
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {filteredPolicies.map((policy, idx) => (
                <button
                  key={idx}
                  onClick={() => handlePolicyClick(policy)}
                  className="policy-item"
                  style={{ width: "100%" }}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    style={{ flexShrink: 0, opacity: 0.4 }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {policy}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* User footer */}
      <div
        style={{
          padding: "12px 14px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "rgba(16,217,160,0.1)",
              border: "1px solid rgba(16,217,160,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
              color: "var(--accent)",
              flexShrink: 0,
              textTransform: "uppercase",
            }}
          >
            {username.charAt(0)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--text-secondary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {username}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Administrator</div>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          title="Sign Out"
          style={{
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: 7,
            padding: "5px 10px",
            cursor: "pointer",
            fontSize: 11,
            color: "var(--text-muted)",
            fontFamily: "var(--font-sans)",
            transition: "all 0.15s ease",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--danger)";
            e.currentTarget.style.borderColor = "rgba(239,68,68,0.4)";
            e.currentTarget.style.background = "rgba(239,68,68,0.06)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-muted)";
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.background = "none";
          }}
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
}
