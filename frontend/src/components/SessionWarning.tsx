"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isSessionExpiringSoon, isSessionExpired, secondsUntilExpiry } from "@/lib/session";
import { clearToken } from "@/lib/api";

export default function SessionWarning() {
  const router = useRouter();
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      if (isSessionExpired()) {
        clearToken();
        router.push("/");
        return;
      }

      if (isSessionExpiringSoon(300)) {
        setShowWarning(true);
        setSecondsLeft(secondsUntilExpiry());
      } else {
        setShowWarning(false);
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [router]);

  if (!showWarning) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  return (
    <div
      className="fade-in"
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        zIndex: 9999,
        padding: "12px 18px",
        borderRadius: 10,
        background: "rgba(245,166,35,0.12)",
        border: "1px solid rgba(245,166,35,0.3)",
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
        maxWidth: 360,
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#f5a623"
        strokeWidth={2}
        style={{ flexShrink: 0 }}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#f5a623", lineHeight: 1.3 }}>
          Session expires in {minutes}:{secs.toString().padStart(2, "0")}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
          Save your work and re-login to continue
        </div>
      </div>
    </div>
  );
}
