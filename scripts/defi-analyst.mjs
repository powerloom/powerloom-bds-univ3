#!/usr/bin/env node
/**
 * Autonomous DeFi Analyst — default: multi-pool via bds_mpp_stream_allTrades + token all-pools volume.
 * Legacy: filters.scope: single_pool → one pool snapshots only.
 */

import { callTool } from "./lib/mcp.mjs";
import { loadRecipe } from "./lib/recipe-config.mjs";
import { tradeUsd, flattenAllTradesFromSnapshot } from "./lib/trade-utils.mjs";
import { loadState, saveState } from "./lib/state.mjs";
import { dispatchLines } from "./lib/dispatch.mjs";
import { defaultMcpCallTimeoutIfUnset } from "./lib/powerloom-env.mjs";

const USDC_MAINNET = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const defaults = {
  name: "defi-analyst",
  heartbeat: { interval_seconds: 300 },
  filters: {
    scope: "multi",
    volume_token_address: USDC_MAINNET,
    pool_address: "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640",
    project_id: "uniswapv3.eth-usdc-0.05",
  },
  client: { call_timeout_ms: 90000, stream_max_events: 12 },
  verification: { mode: "sampled", sample_probability: 0.2 },
  dispatch: { channel: "stdout" },
};

const cfg = loadRecipe("defi-analyst.yaml", defaults);
const scope = (cfg.filters?.scope || "multi").toLowerCase();
const pool = cfg.filters?.pool_address || defaults.filters.pool_address;
const projectId = cfg.filters?.project_id || defaults.filters.project_id;
const volumeToken =
  (cfg.filters?.volume_token_address || USDC_MAINNET).toLowerCase();
const intervalSec = cfg.heartbeat?.interval_seconds || 300;
const pVerify = Math.min(
  1,
  Math.max(0, cfg.verification?.sample_probability ?? 0.2)
);
const channel = cfg.dispatch?.channel || "stdout";
const streamMaxEvents = cfg.client?.stream_max_events ?? 12;
const stateFile =
  arg("--state-file") ||
  process.env.DEFI_ANALYST_STATE_FILE ||
  ".powerloom/defi-analyst-state.json";

function epochIdFromSnapshot(data) {
  const e = data?.epoch;
  if (e && typeof e.end === "number") return e.end;
  if (e && typeof e.begin === "number") return e.begin;
  return null;
}

function pickTopTrade(trades) {
  let best = null;
  let bestUsd = -1;
  for (const t of trades || []) {
    const w = { trade: t };
    const u = tradeUsd(w);
    if (u > bestUsd) {
      bestUsd = u;
      best = t;
    }
  }
  return best;
}

function tradeDirection(t) {
  const a0 = parseFloat(String(t.data?.amount0 ?? "0"));
  return a0 < 0 ? "sell" : "buy";
}

async function oneRoundMulti() {
  defaultMcpCallTimeoutIfUnset(cfg.client?.call_timeout_ms || 90000);

  let vol;
  try {
    vol = await callTool("bds_mpp_tradeVolumeAllPools_token_address_time_interval", {
      token_address: volumeToken,
      time_interval: 3600,
    });
  } catch (e) {
    vol = { error: e.message };
  }

  const eth = await callTool("bds_mpp_ethPrice", {});
  let state = loadState(stateFile);
  const params = { max_events: streamMaxEvents };
  if (state.lastStreamEpoch != null) params.from_epoch = state.lastStreamEpoch + 1;

  const result = await callTool("bds_mpp_stream_allTrades", params);
  const events = result.events || [];
  let maxEpoch = state.lastStreamEpoch ?? 0;
  let bestTw = null;
  let bestUsd = -1;
  let bestSnap = null;
  let bestEv = null;

  for (const ev of events) {
    if (ev.skipped) {
      if (typeof ev.epoch === "number") maxEpoch = Math.max(maxEpoch, ev.epoch);
      continue;
    }
    const snap = ev.snapshot;
    const epochNum = ev.epoch ?? ev.verification?.epochId;
    if (typeof epochNum === "number") maxEpoch = Math.max(maxEpoch, epochNum);
    const rows = flattenAllTradesFromSnapshot(snap);
    for (const tw of rows) {
      const u = tradeUsd(tw);
      if (u > bestUsd) {
        bestUsd = u;
        bestTw = tw;
        bestSnap = snap;
        bestEv = ev;
      }
    }
  }

  if (events.length > 0) {
    state.lastStreamEpoch = maxEpoch;
    saveState(stateFile, state);
  }

  const volData = vol?.data ?? vol;
  const ethData = eth.data || eth;
  const lines = [
    `Powerloom DeFi Analyst (multi-pool) — ${new Date().toISOString()}`,
    `scope  stream batch  max_events=${streamMaxEvents}  (all indexed pools)`,
    `volume_token  ${volumeToken}  (1h all-pools)`,
    `volume_1h  ${JSON.stringify(volData?.tradeVolume ?? volData ?? {})}`,
    `eth_price  ${JSON.stringify(ethData?.price ?? ethData ?? {})}`,
  ];

  if (bestTw) {
    const t = bestTw.trade;
    const pAddr = bestTw.poolAddress || "?";
    lines.push(
      `top_trade_in_batch  pool ${pAddr}  ${tradeDirection(t)}  $${tradeUsd(bestTw).toFixed(2)}  tx ${t?.log?.transactionHash || ""}`
    );
  } else {
    lines.push("top_trade_in_batch  (no trades in this stream window)");
  }

  const top = bestTw?.trade;
  const doVerify = Math.random() < pVerify && top;
  if (doVerify && top?.log?.cid) {
    const eid =
      bestEv?.verification?.epochId ??
      epochIdFromSnapshot(bestSnap?.data ?? bestSnap) ??
      (typeof bestEv?.epoch === "number" ? bestEv.epoch : null);
    if (eid != null) {
      try {
        const vr = await callTool("verify_data_provenance", {
          cid: top.log.cid,
          epoch_id: eid,
          project_id: projectId,
        });
        lines.push("verification_probe");
        lines.push(JSON.stringify(vr, null, 2));
      } catch (e) {
        lines.push(`verification_probe  error: ${e.message}`);
      }
    } else {
      lines.push(
        "verification_probe  skipped (could not derive epoch_id from stream snapshot)"
      );
    }
  } else if (doVerify) {
    lines.push(
      "verification_probe  skipped (no cid on trade log in batch)"
    );
  }

  await dispatchLines(lines, channel);
}

async function oneRoundSinglePool() {
  defaultMcpCallTimeoutIfUnset(90000);

  const vol = await callTool("bds_mpp_tradeVolume_pool_address_time_interval", {
    pool_address: pool,
    time_interval: 3600,
  });
  const eth = await callTool("bds_mpp_ethPrice", {});
  const snap = await callTool("bds_mpp_snapshot_trades_pool_address", {
    pool_address: pool,
  });

  const data = snap.data || snap;
  const trades = data.trades || [];
  const top = pickTopTrade(trades);
  const volData = vol.data || vol;
  const ethData = eth.data || eth;

  const lines = [
    `Powerloom DeFi Analyst (single-pool) — ${new Date().toISOString()}`,
    `pool       ${pool}`,
    `volume_1h  ${JSON.stringify(volData?.tradeVolume ?? volData ?? {})}`,
    `eth_price  ${JSON.stringify(ethData?.price ?? ethData ?? {})}`,
  ];
  if (top) {
    const d = top.data || {};
    lines.push(
      `top_trade  ${tradeDirection(top)}  $${tradeUsd({ trade: top }).toFixed(2)}  tx ${top.log?.transactionHash || ""}`
    );
  }

  const doVerify = Math.random() < pVerify;
  if (doVerify && top?.log?.cid) {
    const eid = epochIdFromSnapshot(data);
    if (eid != null) {
      try {
        const vr = await callTool("verify_data_provenance", {
          cid: top.log.cid,
          epoch_id: eid,
          project_id: projectId,
        });
        lines.push("verification_probe");
        lines.push(JSON.stringify(vr, null, 2));
      } catch (e) {
        lines.push(`verification_probe  error: ${e.message}`);
      }
    } else {
      lines.push(
        "verification_probe  skipped (could not derive epoch_id from snapshot; check pool snapshot shape)"
      );
    }
  } else if (doVerify) {
    lines.push(
      "verification_probe  skipped (no cid on trade log — upstream snapshot may omit it)"
    );
  }

  await dispatchLines(lines, channel);
}

async function oneRound() {
  if (scope === "single_pool") {
    await oneRoundSinglePool();
  } else {
    await oneRoundMulti();
  }
}

async function main() {
  const once = arg("--once");
  if (once) {
    await oneRound();
    return;
  }
  await oneRound();
  setInterval(() => {
    oneRound().catch((e) => console.error("[defi-analyst]", e.message));
  }, intervalSec * 1000);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
