"use client";

import { useEffect, useRef, useState, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { getToken, streamSSE } from "@/lib/api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const SUGGESTIONS = [
  { text: "Explain our Removable Media Policy", icon: "💾" },
  { text: "Review our Access Control Policy against ISO 27001", icon: "🔐" },
  { text: "What NESA controls apply to cloud usage?", icon: "☁️" },
  { text: "Draft a BYOD policy for Ali & Sons", icon: "📱" },
];

function genId(): string {
  return Math.random().toString(36).slice(2);
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-AE", { hour: "2-digit", minute: "2-digit" });
}

// Simple markdown renderer — converts markdown text to React JSX safely
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  const parseInline = (line: string): React.ReactNode => {
    // Split on code spans, bold, italic
    const parts = line.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code
            key={idx}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.85em",
              padding: "1px 5px",
              borderRadius: 4,
              background: "rgba(16,217,160,0.1)",
              color: "var(--accent)",
              border: "1px solid rgba(16,217,160,0.15)",
            }}
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={idx} style={{ fontWeight: 600, color: "var(--text-primary)" }}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("*") && part.endsWith("*")) {
        return <em key={idx}>{part.slice(1, -1)}</em>;
      }
      return part;
    });
  };

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre
          key={i}
          style={{
            background: "rgba(6,14,28,0.8)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "12px 16px",
            overflowX: "auto",
            margin: "12px 0",
            fontFamily: "var(--font-mono)",
            fontSize: 12.5,
            color: "var(--text-secondary)",
            lineHeight: 1.6,
          }}
        >
          {lang && (
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {lang}
            </div>
          )}
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      i++;
      continue;
    }

    // Heading 1
    if (line.startsWith("# ")) {
      elements.push(
        <h1 key={i} style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: "16px 0 8px", lineHeight: 1.3 }}>
          {parseInline(line.slice(2))}
        </h1>
      );
      i++;
      continue;
    }

    // Heading 2
    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={i} style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", margin: "14px 0 6px", lineHeight: 1.3 }}>
          {parseInline(line.slice(3))}
        </h2>
      );
      i++;
      continue;
    }

    // Heading 3
    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={i} style={{ fontSize: 13.5, fontWeight: 600, color: "var(--accent)", margin: "12px 0 5px", lineHeight: 1.3 }}>
          {parseInline(line.slice(4))}
        </h3>
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (line.match(/^---+$/) || line.match(/^\*\*\*+$/)) {
      elements.push(
        <hr key={i} style={{ border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />
      );
      i++;
      continue;
    }

    // Bullet list item
    if (line.match(/^[-*] /)) {
      const listItems: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*] /)) {
        listItems.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={i} style={{ paddingLeft: 0, margin: "6px 0", listStyle: "none" }}>
          {listItems.map((item, j) => (
            <li
              key={j}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                marginBottom: 4,
                fontSize: 13.5,
                lineHeight: 1.6,
                color: "var(--text-primary)",
              }}
            >
              <span style={{ color: "var(--accent)", marginTop: 4, flexShrink: 0, fontSize: 8 }}>&#9679;</span>
              <span>{parseInline(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (line.match(/^\d+\. /)) {
      const listItems: string[] = [];
      let num = 1;
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        listItems.push(lines[i].replace(/^\d+\. /, ""));
        i++;
        num++;
      }
      elements.push(
        <ol key={i} style={{ paddingLeft: 0, margin: "6px 0", listStyle: "none", counterReset: "item" }}>
          {listItems.map((item, j) => (
            <li
              key={j}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                marginBottom: 5,
                fontSize: 13.5,
                lineHeight: 1.6,
                color: "var(--text-primary)",
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  background: "rgba(16,217,160,0.1)",
                  border: "1px solid rgba(16,217,160,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--accent)",
                  marginTop: 2,
                }}
              >
                {j + 1}
              </span>
              <span>{parseInline(item)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      elements.push(<div key={i} style={{ height: 6 }} />);
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={i} style={{ margin: "3px 0", fontSize: 13.5, lineHeight: 1.7, color: "var(--text-primary)" }}>
        {parseInline(line)}
      </p>
    );
    i++;
  }

  return elements;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available
    }
  };

  return (
    <button
      onClick={handleCopy}
      title="Copy response"
      style={{
        background: "none",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: "3px 8px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        color: copied ? "var(--success)" : "var(--text-muted)",
        fontFamily: "var(--font-sans)",
        transition: "all 0.15s ease",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!copied) {
          e.currentTarget.style.borderColor = "var(--border-hover)";
          e.currentTarget.style.color = "var(--text-secondary)";
        }
      }}
      onMouseLeave={(e) => {
        if (!copied) {
          e.currentTarget.style.borderColor = "var(--border)";
          e.currentTarget.style.color = "var(--text-muted)";
        }
      }}
    >
      {copied ? (
        <>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

const CHAT_STORAGE_KEY = "aegis-chat-history";

function loadChatHistory(): Message[] {
  try {
    const stored = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as Array<{ id: string; role: string; content: string; timestamp: string }>;
    return parsed.map((m) => ({
      ...m,
      role: m.role as "user" | "assistant",
      timestamp: new Date(m.timestamp),
    }));
  } catch {
    return [];
  }
}

function saveChatHistory(messages: Message[]): void {
  try {
    // Keep last 50 messages to avoid bloating localStorage
    const toSave = messages.slice(-50);
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // localStorage full or unavailable — silently fail
  }
}

function ChatContent() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<Message[]>(() => loadChatHistory());
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [currentStreamText, setCurrentStreamText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initialQHandled = useRef(false);

  // Persist chat history to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      saveChatHistory(messages);
    }
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentStreamText]);

  const doSend = useCallback((question: string, currentMessages: Message[]) => {
    const trimmed = question.trim();
    if (!trimmed || streaming) return;

    const userMsg: Message = { id: genId(), role: "user", content: trimmed, timestamp: new Date() };
    const nextMessages = [...currentMessages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setStreaming(true);
    setCurrentStreamText("");

    const token = getToken();
    const history = currentMessages.map((m) => ({ role: m.role, content: m.content }));
    let accumulated = "";

    streamSSE(
      "/api/admin/policies/chat/stream",
      { question: trimmed, history },
      token,
      (chunk) => {
        accumulated += chunk;
        setCurrentStreamText(accumulated);
      },
      () => {
        const assistantMsg: Message = {
          id: genId(),
          role: "assistant",
          content: accumulated || "[No response received]",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setCurrentStreamText("");
        setStreaming(false);
      },
      (err) => {
        const errorMsg: Message = {
          id: genId(),
          role: "assistant",
          content: `[Error: ${err}]`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMsg]);
        setCurrentStreamText("");
        setStreaming(false);
      }
    );
  }, [streaming]);

  useEffect(() => {
    if (initialQHandled.current) return;
    const q = searchParams.get("q");
    if (q) {
      initialQHandled.current = true;
      setInput(q);
      setTimeout(() => {
        doSend(q, []);
      }, 120);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSend(input, messages);
  };

  const handleSuggestion = (text: string) => {
    if (streaming) return;
    doSend(text, messages);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSend(input, messages);
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-base)" }}>
      {/* Header */}
      <div
        style={{
          flexShrink: 0,
          padding: "16px 24px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
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
            AEGIS — Policy Intelligence Advisor
          </h1>
          <p style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
            UAE NESA &bull; ISO 27001:2022 &bull; UAE PDPL &bull; NIST CSF 2.0 &bull; CIS Controls v8
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {messages.length > 0 && (
            <button
              onClick={() => {
                setMessages([]);
                localStorage.removeItem(CHAT_STORAGE_KEY);
              }}
              className="btn-ghost"
              style={{ padding: "5px 12px", fontSize: 11 }}
            >
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ display: "inline", marginRight: 4 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Clear Chat
            </button>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="status-dot online" />
            <span style={{ fontSize: 11.5, color: "var(--success)", fontWeight: 500 }}>RAG Active</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 16 }}>
        {messages.length === 0 && !streaming ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28 }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 20,
                background: "rgba(16,217,160,0.07)",
                border: "1px solid rgba(16,217,160,0.18)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                animation: "float 5s ease-in-out infinite",
              }}
            >
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                <path
                  d="M18 3L4 9v10c0 8.284 5.954 16.027 14 18 8.046-1.973 14-9.716 14-18V9L18 3z"
                  fill="rgba(16,217,160,0.2)"
                  stroke="#10d9a0"
                  strokeWidth="1.5"
                />
                <path d="M12 18l4 4 8-8" stroke="#10d9a0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 17, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                Ask AEGIS anything about your policies
              </p>
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Grounded in 25+ corporate policies and live regulatory standards
              </p>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                width: "100%",
                maxWidth: 620,
              }}
            >
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  onClick={() => handleSuggestion(s.text)}
                  className="glass-card"
                  style={{
                    padding: "14px 16px",
                    textAlign: "left",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    transition: "all 0.2s ease",
                    background: "var(--bg-surface)",
                    width: "100%",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "rgba(16,217,160,0.3)";
                    e.currentTarget.style.background = "rgba(16,217,160,0.04)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.background = "var(--bg-surface)";
                  }}
                >
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{s.icon}</span>
                  <span style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.4 }}>{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className="fade-in"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                  gap: 4,
                }}
              >
                {msg.role === "user" ? (
                  <>
                    <div
                      style={{
                        maxWidth: "75%",
                        padding: "11px 16px",
                        borderRadius: "var(--radius-lg) var(--radius-lg) var(--radius) var(--radius-lg)",
                        background: "linear-gradient(135deg, var(--accent), #0fa87c)",
                        color: "#ffffff",
                        fontSize: 13.5,
                        lineHeight: 1.6,
                        boxShadow: "0 4px 16px rgba(16,217,160,0.2)",
                      }}
                    >
                      {msg.content}
                    </div>
                    <span style={{ fontSize: 10.5, color: "var(--text-muted)", paddingRight: 4 }}>
                      {formatTime(msg.timestamp)}
                    </span>
                  </>
                ) : (
                  <>
                    <div
                      style={{
                        maxWidth: "82%",
                        borderRadius: "var(--radius-lg) var(--radius-lg) var(--radius-lg) var(--radius)",
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border)",
                        overflow: "hidden",
                      }}
                    >
                      {/* AEGIS label bar */}
                      <div
                        style={{
                          padding: "8px 16px",
                          borderBottom: "1px solid var(--border)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          background: "rgba(16,217,160,0.04)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <div
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: 5,
                              background: "rgba(16,217,160,0.15)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <svg width="10" height="10" viewBox="0 0 36 36" fill="none">
                              <path
                                d="M18 3L4 9v10c0 8.284 5.954 16.027 14 18 8.046-1.973 14-9.716 14-18V9L18 3z"
                                fill="rgba(16,217,160,0.3)"
                                stroke="#10d9a0"
                                strokeWidth="2"
                              />
                            </svg>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--accent)" }}>
                            AEGIS
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{formatTime(msg.timestamp)}</span>
                          <CopyButton text={msg.content} />
                        </div>
                      </div>
                      <div style={{ padding: "14px 18px" }}>
                        {renderMarkdown(msg.content)}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}

            {/* Streaming */}
            {streaming && (
              <div className="fade-in" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                <div
                  style={{
                    maxWidth: "82%",
                    borderRadius: "var(--radius-lg) var(--radius-lg) var(--radius-lg) var(--radius)",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding: "8px 16px",
                      borderBottom: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      background: "rgba(16,217,160,0.04)",
                    }}
                  >
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 5,
                        background: "rgba(16,217,160,0.15)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <svg width="10" height="10" viewBox="0 0 36 36" fill="none">
                        <path
                          d="M18 3L4 9v10c0 8.284 5.954 16.027 14 18 8.046-1.973 14-9.716 14-18V9L18 3z"
                          fill="rgba(16,217,160,0.3)"
                          stroke="#10d9a0"
                          strokeWidth="2"
                        />
                      </svg>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--accent)" }}>
                      AEGIS
                    </span>
                    <span style={{ fontSize: 10.5, color: "var(--text-muted)", marginLeft: 4 }}>Responding...</span>
                  </div>
                  <div style={{ padding: "14px 18px" }}>
                    {currentStreamText ? (
                      <div>
                        {renderMarkdown(currentStreamText)}
                        <span className="cursor-blink" />
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
                        {[0, 0.2, 0.4].map((delay, i) => (
                          <span
                            key={i}
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              background: "var(--accent)",
                              animation: `pulse-dot 1s ease-in-out ${delay}s infinite`,
                              display: "inline-block",
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          flexShrink: 0,
          padding: "14px 24px 16px",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-surface)",
        }}
      >
        <form onSubmit={handleSubmit} style={{ display: "flex", gap: 10 }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about policies, compliance, NESA controls, ISO 27001..."
            disabled={streaming}
            className="input-field"
            style={{ flex: 1, padding: "11px 16px", fontSize: 13.5 }}
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="btn-primary flex-shrink-0"
            style={{ padding: "11px 20px", display: "flex", alignItems: "center", gap: 7 }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            Send
          </button>
        </form>
        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
          RAG Active &mdash; Querying 25+ corporate policies + live regulatory standards &bull; Press Enter to send
        </p>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center" style={{ color: "var(--text-muted)", fontSize: 14 }}>
          <span className="spinner" style={{ width: 20, height: 20 }} />
        </div>
      }
    >
      <ChatContent />
    </Suspense>
  );
}
