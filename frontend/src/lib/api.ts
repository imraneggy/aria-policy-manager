/**
 * api.ts — Fetch wrapper and SSE streaming utility.
 * All API calls go through /api/... (proxied to backend via next.config.ts rewrites).
 */

const TOKEN_KEY = "token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
}

/**
 * Authenticated fetch wrapper.
 * - Automatically attaches the Authorization header.
 * - On 401: clears token and redirects to "/" (login page).
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(path, { ...options, headers });

  if (response.status === 401) {
    clearToken();
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  }

  return response;
}

/**
 * SSE streaming utility.
 *
 * Reads an SSE stream from the given URL.
 * Expected server format per event:
 *   data: {"chunk": "...text..."}
 * Terminator:
 *   data: [DONE]
 *
 * @param url     - API path (e.g. "/api/admin/policies/chat/stream")
 * @param body    - Request body object (will be JSON.stringified)
 * @param token   - JWT token (pass getToken() result)
 * @param onChunk - Called with each text chunk as it arrives
 * @param onDone  - Called when the stream terminates cleanly
 * @param onError - Called on network / parse errors
 */
export async function streamSSE(
  url: string,
  body: Record<string, unknown>,
  token: string | null,
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (err: string) => void
): Promise<void> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (response.status === 401) {
      clearToken();
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
      onError("Session expired. Please log in again.");
      return;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "Unknown error");
      onError(`Server error ${response.status}: ${text}`);
      return;
    }

    if (!response.body) {
      onError("Response body is empty.");
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process all complete SSE lines in the buffer
      const lines = buffer.split("\n");
      // Keep the last (possibly incomplete) line in the buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const data = trimmed.slice(5).trim();

        if (data === "[DONE]") {
          onDone();
          return;
        }

        try {
          const parsed = JSON.parse(data) as { chunk?: string };
          if (parsed.chunk) {
            onChunk(parsed.chunk);
          }
        } catch {
          // Ignore malformed SSE lines
        }
      }
    }

    // Stream ended without [DONE] — still call onDone
    onDone();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    onError(message);
  }
}
