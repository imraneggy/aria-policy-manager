"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getToken } from "@/lib/api";
import { ThemeProvider } from "@/lib/theme";
import { registerShortcut, handleGlobalKeydown } from "@/lib/shortcuts";
import Sidebar from "@/components/Sidebar";
import SessionWarning from "@/components/SessionWarning";
import { ToastProvider } from "@/components/Toast";
import ChatPage from "./chat/page";
import GeneratePage from "./generate/page";
import SettingsPage from "./settings/page";
import OverviewPage from "./overview/page";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // State-based tab — initialized from URL, then stays in memory
  const tabFromPath = (p: string) => {
    if (p.startsWith("/dashboard/chat")) return "chat";
    if (p.startsWith("/dashboard/generate")) return "generate";
    if (p.startsWith("/dashboard/settings")) return "settings";
    return "overview";
  };
  const [activeTab, setActiveTab] = useState(() => tabFromPath(pathname));

  // Sync tab if user navigates via browser back/forward
  useEffect(() => {
    setActiveTab(tabFromPath(pathname));
  }, [pathname]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/");
    } else {
      setChecked(true);
    }
  }, [router]);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    const path = `/dashboard/${tab === "chat" ? "chat" : tab}`;
    window.history.replaceState(null, "", path);
  }, []);

  // Register keyboard shortcuts
  useEffect(() => {
    const cleanups = [
      registerShortcut({ key: "1", ctrl: true, description: "Dashboard", handler: () => handleTabChange("overview") }),
      registerShortcut({ key: "2", ctrl: true, description: "Policy Advisor", handler: () => handleTabChange("chat") }),
      registerShortcut({ key: "3", ctrl: true, description: "Policy Generator", handler: () => handleTabChange("generate") }),
      registerShortcut({ key: "4", ctrl: true, description: "Security Settings", handler: () => handleTabChange("settings") }),
    ];

    const listener = (e: KeyboardEvent) => handleGlobalKeydown(e);
    window.addEventListener("keydown", listener);
    return () => {
      cleanups.forEach((fn) => fn());
      window.removeEventListener("keydown", listener);
    };
  }, [handleTabChange]);

  if (!checked) {
    return (
      <div
        className="flex h-screen items-center justify-center"
        style={{ background: "var(--bg-base)" }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "rgba(16,217,160,0.08)",
              border: "1px solid rgba(16,217,160,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              animation: "float 2.5s ease-in-out infinite",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 36 36" fill="none">
              <path
                d="M18 3L4 9v10c0 8.284 5.954 16.027 14 18 8.046-1.973 14-9.716 14-18V9L18 3z"
                fill="rgba(16,217,160,0.15)"
                stroke="#10d9a0"
                strokeWidth="1.5"
              />
              <path d="M13 18l3 3 7-7" stroke="#10d9a0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="spinner" style={{ width: 14, height: 14 }} />
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Authenticating...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <div
          className="flex h-screen overflow-hidden"
          style={{ background: "var(--bg-base)" }}
        >
          <SessionWarning />

          {/* Mobile hamburger */}
          <button
            className="mobile-menu-btn"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label="Toggle menu"
            style={{
              display: "none",
              position: "fixed",
              top: 12,
              left: 12,
              zIndex: 1001,
              width: 40,
              height: 40,
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--bg-surface)",
              cursor: "pointer",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-secondary)",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              {sidebarOpen
                ? <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
                : <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>

          {/* Overlay for mobile */}
          {sidebarOpen && (
            <div
              className="mobile-overlay"
              onClick={() => setSidebarOpen(false)}
              style={{
                display: "none",
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.5)",
                zIndex: 999,
              }}
            />
          )}

          <div className={`sidebar-wrapper ${sidebarOpen ? "open" : ""}`}>
            <Sidebar activeTab={activeTab} onTabChange={(tab) => {
              handleTabChange(tab);
              setSidebarOpen(false);
            }} />
          </div>
          <main className="flex-1 overflow-hidden flex flex-col min-w-0">
            {/* All pages rendered simultaneously — hidden ones keep their state */}
            <div style={{ display: activeTab === "overview" ? "flex" : "none", flexDirection: "column", flex: 1, overflow: "hidden" }}>
              <OverviewPage />
            </div>
            <div style={{ display: activeTab === "chat" ? "flex" : "none", flexDirection: "column", flex: 1, overflow: "hidden" }}>
              <ChatPage />
            </div>
            <div style={{ display: activeTab === "generate" ? "flex" : "none", flexDirection: "column", flex: 1, overflow: "hidden" }}>
              <GeneratePage />
            </div>
            <div style={{ display: activeTab === "settings" ? "flex" : "none", flexDirection: "column", flex: 1, overflow: "hidden" }}>
              <SettingsPage />
            </div>
          </main>
        </div>
      </ToastProvider>
    </ThemeProvider>
  );
}
