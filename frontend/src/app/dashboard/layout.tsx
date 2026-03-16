"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getToken } from "@/lib/api";
import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/");
    } else {
      setChecked(true);
    }
  }, [router]);

  // Derive active tab from current path
  const getActiveTab = (): string => {
    if (pathname.startsWith("/dashboard/chat")) return "chat";
    if (pathname.startsWith("/dashboard/generate")) return "generate";
    if (pathname.startsWith("/dashboard/settings")) return "settings";
    return "chat";
  };

  const handleTabChange = (tab: string) => {
    switch (tab) {
      case "chat":
        router.push("/dashboard/chat");
        break;
      case "generate":
        router.push("/dashboard/generate");
        break;
      case "settings":
        router.push("/dashboard/settings");
        break;
    }
  };

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
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "var(--bg-base)" }}
    >
      <Sidebar activeTab={getActiveTab()} onTabChange={handleTabChange} />
      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {children}
      </main>
    </div>
  );
}
