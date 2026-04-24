---
name: powerloom-bds-univ3
description: |
  Autonomous Uniswap V3 monitoring on consensus-backed data. Every data point is
  finalized on-chain by Powerloom's decentralized sequencer-validator network (DSV)
  and independently verifiable via verify_data_provenance. Ships with Whale Radar,
  Token-Flow, and Autonomous DeFi Analyst recipes. Agent-first: required EVM + plan fields, then pay-signup and subsequent top-up.
  Triggers on phrases like "whale alert", "track trades", "all trades for", "by token",
  "ERC20", "ERC20 token swaps", "Powerloom", "verify on-chain", "verified data".
version: 0.0.2
homepage: https://bds-metering.powerloom.io
repository: https://github.com/powerloom/powerloom-bds-univ3
tags:
  - defi
  - uniswap
  - ethereum
  - on-chain
  - verifiable
  - consensus
  - agent
metadata:
  openclaw:
    emoji: "🦄"
    requires:
      bins: ["node"]
      env:
        - EVM_PRIVATE_KEY
        - EVM_RPC_URL
        - EVM_CHAIN_ID
        - PLAN_ID
        - TOKEN_SYMBOL
        - POWERLOOM_API_KEY
      optional_env:
        - POWERLOOM_MCP_URL
        - TELEGRAM_BOT_TOKEN
        - TELEGRAM_CHAT_ID
        - DISCORD_WEBHOOK_URL
        - BDS_MCP_CALL_TIMEOUT_MS
        - METERING_BASE_URL
        - AGENT_NAME
        - EMAIL
---

# Powerloom BDS — Uniswap V3

## Install

**Agent-first (no browser, recommended for OpenClaw):** same pathway as `bds-agent-py`: **credits plans → setup-evm → signup-pay** (no API key before pay). The skill’s **`metadata.openclaw.env`** lists the **non-optional** fields: wallet + RPC + chain + `PLAN_ID` + `TOKEN_SYMBOL` + `POWERLOOM_API_KEY` (key last — empty until signup completes). Same metering base URL for every path: [bds-metering.powerloom.io](https://bds-metering.powerloom.io).

**Path A (browser) only** needs **`POWERLOOM_API_KEY`** in practice. If your host enforces the full `requires.env` list, set EVM+plan from a row you will use for **top-up** later, or adjust host rules; the **authoritative** wallet-funded flow below always uses all six.

### Path B — Pay signup (bds-agent, headless) — default pathway

1. **`bds-agent credits plans`** — pick a `Plan`, `You pay` row, and chain (e.g. Powerloom **7869** + **`launch_10_pl_power_cgt`** + **`POWER`** for native / CGT).
2. **`bds-agent credits setup-evm`** — no API key yet. You name a profile; the CLI writes `EVM_PRIVATE_KEY`, `EVM_RPC_URL`, `EVM_CHAIN_ID` to `~/.config/bds-agent/profiles/<profile>.evm.env` (align these with **`metadata.openclaw.env`** if you use OpenClaw env instead of the file).
3. **`bds-agent signup-pay --plan-id <id> --chain-id <n> --token-symbol <SYM>`** — quote → pay (ERC-20 or **native** per plan `payment_kind`) → claim. Key is stored on the profile; **then** set **`POWERLOOM_API_KEY`** to that `sk_live_...` for this skill and `ensure-credits`.

| `requires.env` field | Tied to |
|---------------------|--------|
| `EVM_PRIVATE_KEY` | Wallet that pays (same as setup-evm) |
| `EVM_RPC_URL` | RPC for that chain |
| `EVM_CHAIN_ID` | Must match the plan’s chain (EIP-155; e.g. `7869`) |
| `PLAN_ID` | e.g. `launch_10_pl_power_cgt` |
| `TOKEN_SYMBOL` | e.g. `POWER` (must match that plan row) |
| `POWERLOOM_API_KEY` | **After** signup-pay succeeds (or Path A) |

4. **Node (this repo only, ERC-20 `transfer` path in script):** `npm install` and set the same values; **`CHAIN_ID` or `EVM_CHAIN_ID`** both work (`node scripts/signup-pay.mjs`). Native/CGT plans: prefer **`bds-agent signup-pay`** — it handles `native_value` plans.

5. **Sanity check:** `node scripts/ensure-credits.mjs` (needs `POWERLOOM_API_KEY`).

**Optional (not in `requires.env`):** `METERING_BASE_URL`, `AGENT_NAME`, `EMAIL`; for the Node script you can set `CHAIN_ID` as an alias of `EVM_CHAIN_ID`.

### Path A — Browser / device auth

1. Open [bds-metering.powerloom.io/metering](https://bds-metering.powerloom.io/metering) and complete device-auth signup; copy your key when shown.
2. **Export** `POWERLOOM_API_KEY=sk_live_...` wherever OpenClaw reads environment variables.
3. **Sanity check:** `node scripts/ensure-credits.mjs` — prints balance; exits non-zero on 401 / zero balance.

### After you have a key — top up credits (EVM)

When you **already** have a key and need more credits (e.g. after Path A’s free tier, or a depleted balance), use **top-up** — **`POST /credits/topup`**, *not* the pay-signup quote/claim flow.

- **Python:** `bds-agent credits setup-evm`, then **`bds-agent credits topup`**. End-to-end: [bds-agent-py `docs/USER_GUIDE.md`](https://github.com/powerloom/bds-agent-py/blob/main/docs/USER_GUIDE.md).
- **This repo (check only):** `node scripts/ensure-credits.mjs` — balance; does not purchase credits.
- **HTTP / ops:** [bds-agenthub-billing-metering README](https://github.com/powerloom/bds-agenthub-billing-metering#readme) (`GET /credits/plans`, top-up body + tx hash).

**Default MCP endpoint:** `https://bds-mcp.powerloom.io/sse` — override with `POWERLOOM_MCP_URL` if needed.

Generic tool runner: `node scripts/powerloom-mcp-client.mjs <tool_name> '{}'`

## Common tasks → which tool

| Task phrase | Tool(s) |
|-------------|---------|
| Track **all swaps for token X** (multi-pool) | `bds_mpp_stream_allTrades` / `bds_mpp_snapshot_allTrades` + **Token-Flow** recipe |
| **Whale** / USD threshold | `bds_mpp_stream_allTrades` + filters, or **Whale Radar** recipe |
| **One pool only** | `bds_mpp_snapshot_trades_pool_address` after `bds_mpp_token_token_address_pools` or `bds_mpp_dailyActivePools` |
| **Streaming** live | `bds_mpp_stream_allTrades` with `from_epoch` checkpoint (see `scripts/whale-radar.mjs`) |
| **Verify** on-chain | `verify_data_provenance` with `cid`, `epoch_id`, `project_id` from API — never substitute block for epoch |

**Timeouts:** default `BDS_MCP_CALL_TIMEOUT_MS=60000`. Use **120000** for `bds_mpp_stream_allTrades` with `max_events=50` if you see timeouts under backlog.

## Recipes (supported surface)

Pre-built scripts + `recipes/*.yaml` defaults — prefer these over ad-hoc scripts on weaker models.

| Recipe | Script |
|--------|--------|
| Whale Radar | `node scripts/whale-radar.mjs` — default **stream = all pools**; `--mode poll` uses `poll_fallback_pools` only |
| Token-Flow | `node scripts/token-flow.mjs` (`--token 0x...`) |
| DeFi Analyst | `node scripts/defi-analyst.mjs` — default **multi-pool** (`bds_mpp_stream_allTrades` + all-pools volume); `filters.scope: single_pool` for one-pool only (`--once` = one shot) |

## Model guidance

Recipes produce the same stdout/Telegram output regardless of model. Ad-hoc “compose your own” prompts work best on GPT-4–class or GLM-5+; weaker local models may collapse multi-pool prompts onto one pool — **use the Token-Flow recipe** instead.

## References

See `references/` for quickstart, full tool table, verification, credit budget, scope, troubleshooting, and prompt patterns.
