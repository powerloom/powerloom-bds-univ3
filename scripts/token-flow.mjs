#!/usr/bin/env node
/**
 * Token-Flow — all swaps touching a token across indexed pools (stream default).
 */

import { callTool } from "./lib/mcp.mjs";
import { loadRecipe } from "./lib/recipe-config.mjs";
import {
  flattenAllTradesFromSnapshot,
  tradeUsd,
  tradeDirectionLabel,
  poolInAllowlist,
  buildPoolAllowlistFromTokenPoolsResponse,
} from "./lib/trade-utils.mjs";
import {
  loadState,
  saveState,
  fingerprintTrade,
  rememberFingerprint,
  wasEmitted,
} from "./lib/state.mjs";
import { dispatchLines } from "./lib/dispatch.mjs";
import { defaultMcpCallTimeoutIfUnset } from "./lib/powerloom-env.mjs";

const USDC_MAINNET = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const defaults = {
  name: "token-flow",
  heartbeat: { mode: "stream", interval_seconds: 30 },
  filters: { token_address: USDC_MAINNET, min_usd: 0, pools: "auto" },
  client: { call_timeout_ms: 120000 },
  dispatch: { channel: "stdout" },
};

const cfg = loadRecipe("token-flow.yaml", defaults);
const mode = arg("--mode") || cfg.heartbeat?.mode || "stream";
const token =
  (arg("--token") || cfg.filters?.token_address || USDC_MAINNET).toLowerCase();
const minUsd = parseFloat(String(cfg.filters?.min_usd ?? 0));
const stateFile =
  arg("--state-file") ||
  process.env.TOKEN_FLOW_STATE_FILE ||
  ".powerloom/token-flow-state.json";
const channel = cfg.dispatch?.channel || "stdout";

function collectPoolAddresses(obj) {
  const raw = buildPoolAllowlistFromTokenPoolsResponse({ data: obj });
  if (raw.size) return raw;
  const set = new Set();
  const walk = (v) => {
    if (!v) return;
    if (typeof v === "string" && /^0x[a-fA-F]{40}$/.test(v)) {
      set.add(v.toLowerCase());
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(obj);
  return set;
}

async function loadPoolsForToken() {
  const name = "bds_mpp_token_token_address_pools";
  const tryParams = [{ token_address: token }, { tokenAddress: token }];
  for (const p of tryParams) {
    try {
      const resp = await callTool(name, p);
      const body = resp?.data ?? resp;
      const set = collectPoolAddresses(body);
      if (set.size) return set;
    } catch {
      /* try next */
    }
  }
  return new Set();
}

function formatTokenAlert(tw, verification) {
  const t = tw.trade;
  const d = t.data || {};
  const log = t.log || {};
  const usd = tradeUsd(tw).toFixed(2);
  const dir = tradeDirectionLabel(tw);
  const t0 = Math.abs(parseFloat(String(d.calculated_token0_amount || 0))).toFixed(4);
  const t1 = Math.abs(parseFloat(String(d.calculated_token1_amount || 0))).toFixed(4);
  const pool = tw.poolAddress || "?";
  const tx = log.transactionHash || "";
  const block = log.blockNumber ?? "";
  const lines = [
    `TOKEN-FLOW | pool ${pool}`,
    `${dir}  $${usd}  (t0 ${t0} / t1 ${t1})`,
    `tx  ${tx}`,
    `block  ${block}`,
  ];
  if (verification?.cid && verification.epochId != null && verification.projectId) {
    lines.push(
      `provenance  cid ${verification.cid}  epoch_id ${verification.epochId}  project_id ${verification.projectId}`
    );
  }
  lines.push("---");
  return lines;
}

async function runStream() {
  const poolSet = await loadPoolsForToken();
  if (!poolSet.size) {
    console.error(
      `[token-flow] No indexed pools found for token ${token}. Check bds_mpp_dailyActiveTokens / token list.`
    );
    process.exit(2);
  }
  let state = loadState(stateFile);
  defaultMcpCallTimeoutIfUnset(cfg.client?.call_timeout_ms || 120000);

  for (;;) {
    const params = { max_events: 50 };
    if (state.lastStreamEpoch != null) params.from_epoch = state.lastStreamEpoch + 1;
    let result;
    try {
      result = await callTool("bds_mpp_stream_allTrades", params);
    } catch (e) {
      console.error("[token-flow] stream batch failed:", e.message);
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    const events = result.events || [];
    let maxEpoch = state.lastStreamEpoch ?? 0;
    for (const ev of events) {
      if (ev.skipped) {
        if (typeof ev.epoch === "number") maxEpoch = Math.max(maxEpoch, ev.epoch);
        continue;
      }
      const verification = ev.verification || null;
      const snap = ev.snapshot;
      const epochNum = ev.epoch ?? verification?.epochId;
      if (typeof epochNum === "number") maxEpoch = Math.max(maxEpoch, epochNum);
      const rows = flattenAllTradesFromSnapshot(snap).filter((tw) =>
        poolInAllowlist(tw.poolAddress, poolSet)
      );
      for (const tw of rows) {
        if (tradeUsd(tw) < minUsd) continue;
        const fp = fingerprintTrade(tw.trade);
        if (wasEmitted(state, fp)) continue;
        await dispatchLines(formatTokenAlert(tw, verification), channel);
        rememberFingerprint(state, fp);
        const bn = tw.trade?.log?.blockNumber ?? 0;
        if (bn > (state.lastEmittedBlock || 0)) state.lastEmittedBlock = bn;
      }
    }
    if (events.length === 0) {
      await new Promise((r) => setTimeout(r, 2000));
    } else {
      state.lastStreamEpoch = maxEpoch;
      saveState(stateFile, state);
    }
  }
}

async function runPoll() {
  const poolSet = await loadPoolsForToken();
  if (!poolSet.size) {
    console.error(`[token-flow] No pools for token ${token}`);
    process.exit(2);
  }
  const intervalSec = cfg.heartbeat?.interval_seconds || 30;
  let state = loadState(stateFile);
  defaultMcpCallTimeoutIfUnset(cfg.client?.call_timeout_ms || 60000);

  for (;;) {
    for (const pool of poolSet) {
      let resp;
      try {
        resp = await callTool("bds_mpp_snapshot_trades_pool_address", {
          pool_address: pool,
        });
      } catch (e) {
        console.error("[token-flow] poll error", pool, e.message);
        continue;
      }
      const data = resp.data || resp;
      const trades = data.trades || [];
      const verification = data.verification || null;
      const rows = trades.map((t) => ({ poolAddress: pool, trade: t }));
      for (const tw of rows) {
        if (tradeUsd(tw) < minUsd) continue;
        const fp = fingerprintTrade(tw.trade);
        if (wasEmitted(state, fp)) continue;
        await dispatchLines(formatTokenAlert(tw, verification), channel);
        rememberFingerprint(state, fp);
      }
    }
    saveState(stateFile, state);
    await new Promise((r) => setTimeout(r, intervalSec * 1000));
  }
}

if (mode === "poll") {
  runPoll().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  runStream().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
