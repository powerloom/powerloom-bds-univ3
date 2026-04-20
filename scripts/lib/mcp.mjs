/**
 * Powerloom BDS MCP over HTTP+SSE (same wire as Claude / OpenClaw remote MCP).
 * Env: POWERLOOM_API_KEY (required), POWERLOOM_MCP_URL or BDS_MCP_URL (default https://bds-mcp.powerloom.io/sse),
 * BDS_MCP_CALL_TIMEOUT_MS (default 60000; raise for bds_mpp_stream_allTrades with max_events=50).
 */

export function getMcpSseUrl() {
  const raw =
    process.env.POWERLOOM_MCP_URL ||
    process.env.BDS_MCP_URL ||
    "https://bds-mcp.powerloom.io/sse";
  const trimmed = raw.replace(/\/$/, "");
  return trimmed.endsWith("/sse") ? trimmed : `${trimmed}/sse`;
}

export function getCallTimeoutMs() {
  const n = Number(process.env.BDS_MCP_CALL_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 60000;
}

function parseSseSessionId(text) {
  const m = text.match(/session_id=([a-f0-9]+)/i);
  return m ? m[1] : null;
}

/**
 * One MCP tools/call round-trip. Returns parsed JSON from tool result text (object).
 */
export async function callTool(toolName, params = {}) {
  const apiKey = process.env.POWERLOOM_API_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    const err = new Error(
      "POWERLOOM_API_KEY is not set. Sign up at https://bds.powerloom.io and export your API key."
    );
    err.code = "NO_API_KEY";
    throw err;
  }

  const sseUrl = getMcpSseUrl();
  const baseOrigin = sseUrl.replace(/\/sse\/?$/, "");
  const timeoutMs = getCallTimeoutMs();
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);

  let sseResp;
  try {
    sseResp = await fetch(sseUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: ac.signal,
    });
  } catch (e) {
    clearTimeout(t);
    if (e.name === "AbortError") {
      const err = new Error(
        `MCP SSE connection timed out after ${timeoutMs}ms (BDS_MCP_CALL_TIMEOUT_MS).`
      );
      err.code = "TIMEOUT";
      throw err;
    }
    const err = new Error(`MCP SSE connection failed: ${e.message || e}`);
    err.code = "NETWORK";
    throw err;
  }

  if (sseResp.status === 401) {
    clearTimeout(t);
    const err = new Error(
      "HTTP 401 — invalid or missing API key. Fix POWERLOOM_API_KEY (get a key at https://bds.powerloom.io)."
    );
    err.code = "HTTP_401";
    err.httpStatus = 401;
    throw err;
  }
  if (sseResp.status === 402) {
    clearTimeout(t);
    const err = new Error(
      "HTTP 402 — credits exhausted. Top up at https://bds.powerloom.io"
    );
    err.code = "HTTP_402";
    err.httpStatus = 402;
    throw err;
  }
  if (sseResp.status === 429) {
    clearTimeout(t);
    const err = new Error("HTTP 429 — rate limited. Back off and retry.");
    err.code = "HTTP_429";
    err.httpStatus = 429;
    throw err;
  }
  if (!sseResp.ok || !sseResp.body) {
    clearTimeout(t);
    const txt = await sseResp.text().catch(() => "");
    const err = new Error(`MCP SSE HTTP ${sseResp.status}: ${txt.slice(0, 400)}`);
    err.code = "HTTP_ERROR";
    err.httpStatus = sseResp.status;
    throw err;
  }

  const reader = sseResp.body.getReader();
  const decoder = new TextDecoder();
  let sessionId = null;
  let buf = "";

  while (!sessionId) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    sessionId = parseSseSessionId(buf);
  }

  if (!sessionId) {
    clearTimeout(t);
    await reader.cancel().catch(() => {});
    const err = new Error(
      "MCP session_id never arrived on SSE — check POWERLOOM_MCP_URL and network."
    );
    err.code = "NO_SESSION";
    throw err;
  }

  const msgUrl = `${baseOrigin}/messages/?session_id=${sessionId}`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const rpc = async (id, method, params_) => {
    const r = await fetch(msgUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        params: params_,
      }),
    });
    if (r.status === 401 || r.status === 402 || r.status === 429) {
      const txt = await r.text().catch(() => "");
      const err = new Error(`MCP POST HTTP ${r.status}: ${txt.slice(0, 300)}`);
      err.code = `HTTP_${r.status}`;
      err.httpStatus = r.status;
      throw err;
    }
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      const err = new Error(`MCP POST HTTP ${r.status}: ${txt.slice(0, 400)}`);
      err.code = "HTTP_ERROR";
      throw err;
    }
  };

  await rpc(1, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "powerloom-bds-univ3", version: "0.1.0" },
  });
  await new Promise((r) => setTimeout(r, 200));
  await fetch(msgUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }),
  });
  await new Promise((r) => setTimeout(r, 200));

  const callId = 2;
  await rpc(callId, "tools/call", {
    name: toolName,
    arguments: params,
  });

  const deadline = Date.now() + timeoutMs;

  try {
    while (Date.now() < deadline) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === "[DONE]") continue;
        let j;
        try {
          j = JSON.parse(raw);
        } catch {
          continue;
        }
        if (j.id == null) continue;
        if (j.id !== callId) continue;
        if (j.error) {
          const err = new Error(
            typeof j.error.message === "string"
              ? j.error.message
              : JSON.stringify(j.error)
          );
          err.code = "JSONRPC_ERROR";
          err.jsonRpc = j.error;
          throw err;
        }
        if (!j.result) continue;
        const r = j.result;
        if (r.isError && r.content && r.content[0]) {
          const err = new Error(String(r.content[0].text || "Tool error"));
          err.code = "TOOL_ERROR";
          err.isError = true;
          throw err;
        }
        const content = r.content;
        if (Array.isArray(content) && content[0]?.type === "text" && content[0].text) {
          const text = content[0].text.trim();
          try {
            clearTimeout(t);
            return JSON.parse(text);
          } catch {
            clearTimeout(t);
            return { _rawText: text };
          }
        }
        clearTimeout(t);
        return r;
      }
    }
  } finally {
    clearTimeout(t);
    await reader.cancel().catch(() => {});
  }

  const err = new Error(
    `Timeout waiting for MCP tools/call response after ${timeoutMs}ms (tool=${toolName}).`
  );
  err.code = "TOOL_TIMEOUT";
  throw err;
}
