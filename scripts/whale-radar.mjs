#!/usr/bin/env node
/**
 * Whale Radar — default: stream via bds_mpp_stream_allTrades; fallback: --mode poll
 */

import { callTool } from "./lib/mcp.mjs";
import { loadRecipe } from "./lib/recipe-config.mjs";
import {
  flattenAllTradesFromSnapshot,
  tradeUsd,
  tradeDirectionLabel,
  formatEtherscanTx,
} from "./lib/trade-utils.mjs";
import { loadState, saveState, fingerprintTrade, rememberFingerprint, wasEmitted } from "./lib/state.mjs";
import { dispatchLines } from "./lib/dispatch.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const defaults = {
  name: "whale-radar",
  heartbeat: { mode: "stream", interval_seconds: 30 },
  filters: { threshold_usd: 25000 },
  client: {
    call_timeout_ms: 60000,
    poll_fallback_pools: [
      "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640",
      "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8",
    ],
  },
  dispatch: { channel: "stdout" },
};

const cfg = loadRecipe("whale-radar.yaml", defaults);
const mode = arg("--mode") || cfg.heartbeat?.mode || "stream";
const threshold = parseFloat(
  arg("--threshold") || String(cfg.filters?.threshold_usd ?? 25000)
);
const stateFile =
  arg("--state-file") ||
  process.env.WHALE_RADAR_STATE_FILE ||
  ".powerloom/whale-radar-state.json";
const channel = cfg.dispatch?.channel || "stdout";

function formatTradeAlert(tw, verification) {
  const t = tw.trade;
  const d = t.data || {};
  const log = t.log || {};
  const usd = tradeUsd(tw).toFixed(2);
  const dir = tradeDirectionLabel(tw);
  const t0 = Math.abs(parseFloat(String(d.calculated_token0_amount || 0))).toFixed(2);
  const t1 = Math.abs(parseFloat(String(d.calculated_token1_amount || 0))).toFixed(4);
  const ethPx = parseFloat(String(d.calculated_eth_price || 0)).toFixed(2);
  const pool = tw.poolAddress || "multi-pool";
  const tx = log.transactionHash || "";
  const block = log.blockNumber ?? "";
  const lines = [
    `WHALE | pool ${pool}`,
    `${dir}  $${usd}  (token0 ${t0} / token1 ${t1}, ETH @ $${ethPx})`,
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
  let state = loadState(stateFile);
  process.env.BDS_MCP_CALL_TIMEOUT_MS =
    process.env.BDS_MCP_CALL_TIMEOUT_MS || String(cfg.client?.call_timeout_ms || 120000);
  console.error(
    "[whale-radar] mode=stream tool=bds_mpp_stream_allTrades (all indexed pools; poll_fallback_pools unused)"
  );

  for (;;) {
    const params = { max_events: 50 };
    if (state.lastStreamEpoch != null) {
      params.from_epoch = state.lastStreamEpoch + 1;
    }
    let result;
    try {
      result = await callTool("bds_mpp_stream_allTrades", params);
    } catch (e) {
      console.error("[whale-radar] stream batch failed:", e.message);
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

      const rows = flattenAllTradesFromSnapshot(snap);
      for (const tw of rows) {
        if (tradeUsd(tw) < threshold) continue;
        const fp = fingerprintTrade(tw.trade);
        if (wasEmitted(state, fp)) continue;
        const lines = formatTradeAlert(tw, verification);
        await dispatchLines(lines, channel);
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
  const pools =
    cfg.client?.poll_fallback_pools ||
    cfg.client?.default_pools ||
    defaults.client.poll_fallback_pools;
  const intervalSec = cfg.heartbeat?.interval_seconds || 30;
  console.error(
    `[whale-radar] mode=poll pools=${pools.length} tool=bds_mpp_snapshot_trades_pool_address`
  );
  let state = loadState(stateFile);
  process.env.BDS_MCP_CALL_TIMEOUT_MS =
    process.env.BDS_MCP_CALL_TIMEOUT_MS || String(cfg.client?.call_timeout_ms || 60000);

  for (;;) {
    for (const pool of pools) {
      let resp;
      try {
        resp = await callTool("bds_mpp_snapshot_trades_pool_address", {
          pool_address: pool,
        });
      } catch (e) {
        console.error("[whale-radar] poll failed:", pool, e.message);
        continue;
      }
      const data = resp.data;
      if (!data?.trades?.length) continue;
      const verification = data.verification || null;
      const rows = data.trades.map((t) => ({ poolAddress: pool, trade: t }));
      for (const tw of rows) {
        if (tradeUsd(tw) < threshold) continue;
        const fp = fingerprintTrade(tw.trade);
        if (wasEmitted(state, fp)) continue;
        await dispatchLines(formatTradeAlert(tw, verification), channel);
        rememberFingerprint(state, fp);
        const bn = tw.trade?.log?.blockNumber ?? 0;
        if (bn > (state.lastEmittedBlock || 0)) state.lastEmittedBlock = bn;
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
