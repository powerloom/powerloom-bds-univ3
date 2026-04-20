#!/usr/bin/env node
/**
 * Autonomous DeFi Analyst — templated report + random verify_data_provenance (no-LLM v1).
 */

import { callTool } from "./lib/mcp.mjs";
import { loadRecipe } from "./lib/recipe-config.mjs";
import { tradeUsd } from "./lib/trade-utils.mjs";
import { dispatchLines } from "./lib/dispatch.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const defaults = {
  name: "defi-analyst",
  heartbeat: { interval_seconds: 300 },
  filters: {
    pool_address: "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640",
    project_id: "uniswapv3.eth-usdc-0.05",
  },
  verification: { mode: "sampled", sample_probability: 0.2 },
  dispatch: { channel: "stdout" },
};

const cfg = loadRecipe("defi-analyst.yaml", defaults);
const pool = cfg.filters?.pool_address || defaults.filters.pool_address;
const projectId = cfg.filters?.project_id || defaults.filters.project_id;
const intervalSec = cfg.heartbeat?.interval_seconds || 300;
const pVerify = Math.min(
  1,
  Math.max(0, cfg.verification?.sample_probability ?? 0.2)
);
const channel = cfg.dispatch?.channel || "stdout";

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

async function oneRound() {
  process.env.BDS_MCP_CALL_TIMEOUT_MS =
    process.env.BDS_MCP_CALL_TIMEOUT_MS || "90000";

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
    `Powerloom DeFi Analyst — ${new Date().toISOString()}`,
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

function tradeDirection(t) {
  const a0 = parseFloat(String(t.data?.amount0 ?? "0"));
  return a0 < 0 ? "sell" : "buy";
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
