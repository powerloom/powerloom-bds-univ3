---
name: powerloom-bds-univ3
description: |
  Autonomous Uniswap V3 monitoring on consensus-backed data with on-chain payment requirements.
  Every data point is finalized on-chain by Powerloom's decentralized sequencer-validator network (DSV)
  and independently verifiable via verify_data_provenance. Ships with Whale Radar,
  Token-Flow, and Autonomous DeFi Analyst recipes.
  **IMPORTANT: This skill requires an EVM private key to purchase API credits via on-chain payments** —
  users must complete a pay-signup flow (plan selection → on-chain payment → API key claim) before accessing data.
  Billing: metering service HTTP APIs; optional bds-agent CLI. Agent-first: plan + wallet then pay-signup, then top-up.
  Triggers on phrases like "whale alert", "track trades", "all trades for", "by token",
  "ERC20", "ERC20 token swaps", "Powerloom", "verify on-chain", "verified data".
version: 0.1
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
        - POWERLOOM_EVM_PRIVATE_KEY
        - POWERLOOM_EVM_RPC_URL
        - POWERLOOM_EVM_CHAIN_ID
        - POWERLOOM_PLAN_ID
        - POWERLOOM_TOKEN_SYMBOL
        - POWERLOOM_API_KEY
      optional_env:
        - POWERLOOM_MCP_URL
        - POWERLOOM_TELEGRAM_BOT_TOKEN
        - POWERLOOM_TELEGRAM_CHAT_ID
        - POWERLOOM_DISCORD_WEBHOOK_URL
        - POWERLOOM_BDS_MCP_CALL_TIMEOUT_MS
        - POWERLOOM_BDS_MCP_DEBUG
        - POWERLOOM_METERING_BASE_URL
        - POWERLOOM_AGENT_NAME
        - POWERLOOM_EMAIL
---

# Powerloom BDS — Uniswap V3

## Install

> **⚠️ WARNING: This skill requires an EVM private key for on-chain payments to purchase API credits. We strongly recommend using a burner wallet with limited funds dedicated to this purpose. Never use a wallet holding significant assets or with extensive transaction history for agentic setups.**

**Contract:** [bds-agenthub-billing-metering](https://github.com/powerloom/bds-agenthub-billing-metering). **ClawHub** users only need a **single origin** (default [bds-metering.powerloom.io](https://bds-metering.powerloom.io))— **`bds-agent` commands are optional**; they are a reference CLI for the same JSON bodies you can send with `curl` + a wallet or `ethers`.

### Metering HTTP (authoritative)

| What | How |
|------|-----|
| List SKUs | `GET {BASE}/credits/plans` — no auth. Choose a plan row: `id`, `chain_id`, `token_symbol` (and note `payment_kind`: ERC-20 vs native / CGT). **`chains[].rpc_url`** is a **public** JSON-RPC hint only when the metering deployment sets it; it may be **empty** — use **`POWERLOOM_EVM_RPC_URL`** for wallet / script calls in that case. |
| New key, wallet-only | **Pay-signup:** `POST {BASE}/signup/pay/quote` → pay on chain → `POST {BASE}/signup/pay/claim` with `signup_nonce` + `tx_hash`. Returns `api_key`. |
| New key, browser | Human device flow on `{BASE}/metering` (same service). |
| More credits, existing key | `POST {BASE}/credits/topup` with `Authorization: Bearer sk_live_…` and tx / plan (not the pay-signup endpoints). |
| Check balance | `GET {BASE}/credits/balance` with `Authorization: Bearer …` |

`{BASE}` is **`POWERLOOM_METERING_BASE_URL`**, e.g. `https://bds-metering.powerloom.io`. Set **`POWERLOOM_API_KEY`** to the `sk_live_...` you get after pay-signup, device signup, or copy from the dashboard.

### OpenClaw `requires.env` (mirrors a pay-signup row + wallet + key)

| Field | Role |
|-------|------|
| `POWERLOOM_EVM_PRIVATE_KEY` | Payer wallet — **use a burner wallet** |
| `POWERLOOM_EVM_RPC_URL` | JSON-RPC for that chain |
| `POWERLOOM_EVM_CHAIN_ID` | Must match the plan's `chain_id` |
| `POWERLOOM_PLAN_ID` | e.g. `launch_10_pl_power_cgt` from `GET /credits/plans` |
| `POWERLOOM_TOKEN_SYMBOL` | e.g. `POWER` (must match that row) |
| `POWERLOOM_API_KEY` | After claim (or set after device signup) |

**Path A (browser) only** usually needs `POWERLOOM_API_KEY` in practice. If the host enforces the full list, set wallet + plan to the row you will use, or adjust host policy.

### Reference client: `bds-agent` (optional)

[docs/USER_GUIDE.md](https://github.com/powerloom/bds-agent-py/blob/main/docs/USER_GUIDE.md) in **bds-agent-py** has the end-to-end order: **Metering service API** table → pay-signup → device → top-up. One-liner sequence:

1. `bds-agent credits plans` — same as `GET /credits/plans`
2. `bds-agent credits setup-evm` — writes `~/.config/bds-agent/profiles/<name>.evm.env`
3. `bds-agent signup-pay --plan-id … --chain-id … --token-symbol …` — implements quote / broadcast / claim (including **native** `payment_kind` plans)

### This repo: Node scripts (no Python, no `bds-agent` required)

| Script | What it does |
|--------|----------------|
| `node scripts/signup-pay.mjs` | **New** key: pay-signup (quote → on-chain pay → claim). Uses **`quote.payment_kind`**: `native_value` = send **native/CGT** (`tx.value` to `recipient`); `erc20` = token **`transfer`**. For **POWER (7869) CGT** plans, this must be **native** — do not run the ERC-20 path. |
| `node scripts/credits-topup.mjs` | **More** credits: uses existing **`POWERLOOM_API_KEY`**, fetches `GET /credits/plans`, matches **`POWERLOOM_PLAN_ID` + `POWERLOOM_EVM_CHAIN_ID` + `POWERLOOM_TOKEN_SYMBOL`**, sends **ERC-20** or **native** per `payment_kind`, then **`POST /credits/topup`**. Set **`POWERLOOM_EVM_RPC_URL`** when **`chains[].rpc_url`** is empty or you need a specific node (the API never exposes the server's private RPC). |
| `node scripts/ensure-credits.mjs` | **Balance** only (`GET /credits/balance`); no purchase. |

`npm install` once (adds `ethers`).

**Optional env (signup script):** `POWERLOOM_METERING_BASE_URL`, `POWERLOOM_AGENT_NAME`, `POWERLOOM_EMAIL` (see [metering README](https://github.com/powerloom/bds-agenthub-billing-metering#readme)).

### After you have a key — more credits (top-up)

**Spec:** `POST {BASE}/credits/topup` with `Authorization: Bearer` and JSON `{ "plan_id", "chain_id", "tx_hash" }` after an on-chain payment that matches the plan. **In this repo:** `node scripts/credits-topup.mjs`. **Reference CLI:** [USER_GUIDE](https://github.com/powerloom/bds-agent-py/blob/main/docs/USER_GUIDE.md) (EVM `credits topup` / Tempo per deployment). **Check balance:** `node scripts/ensure-credits.mjs`.

**Default MCP endpoint:** `https://bds-mcp.powerloom.io/sse` — override with `POWERLOOM_MCP_URL` if needed.

Generic tool runner: `node scripts/powerloom-mcp-client.mjs <tool_name> '{}'`

## Common tasks → which tool

| Task phrase | Tool(s) |
|-------------|---------|
| Track **all swaps for token X** (multi-pool) | **Token-Flow** recipe (`bds_mpp_snapshot_trades_pool_address` per pool) or `bds_mpp_snapshot_allTrades` via **`whale-cron.mjs`** |
| **Whale** / USD threshold | **`whale-cron.mjs`** (all pools, bounded) or **`whale-radar.mjs`** (fixed pool list, per-pool snapshots) |
| **One pool only** | `bds_mpp_snapshot_trades_pool_address` after `bds_mpp_token_token_address_pools` or `bds_mpp_dailyActivePools` |
| **Verify** on-chain | `verify_data_provenance` with `cid`, `epoch_id`, `project_id` from API — never substitute block for epoch |

**Timeouts:** default `POWERLOOM_BDS_MCP_CALL_TIMEOUT_MS=60000`. Raise it (e.g. **120000**) if `bds_mpp_snapshot_allTrades` times out under backlog.

## Recipes (supported surface)

Pre-built scripts + `recipes/*.yaml` defaults — prefer these over ad-hoc scripts on weaker models. **This skill does not call streaming catalog tools** (`bds_mpp_stream_*`); every recipe uses **bounded snapshot** MCP calls so runs fit cron and agent sandboxes.

**Cron default:** `whale-radar.mjs`, `token-flow.mjs`, and `defi-analyst.mjs` each run **one bounded round** and **exit** (safe for OpenClaw cron). Pass **`--daemon`** to repeat with `heartbeat.interval_seconds` between rounds (local / long-running only).

| Recipe / entrypoint | Script |
|---------------------|--------|
| Whale Radar (fixed pools) | `node scripts/whale-radar.mjs` — one round over `poll_fallback_pools`; **`--daemon`** for repeat |
| Whale alerts (cron, all pools) | `node scripts/whale-cron.mjs` — **bounded** one-shot: `bds_mpp_snapshot_allTrades` + pool metadata; alerts include **snapshot** `cid` / epoch / project from `data.verification` — see **Verification provenance** in `references/08-openclaw-one-shot.md` |
| Token-Flow | `node scripts/token-flow.mjs` (`--token 0x...`) — one round per pool for that token; **`--daemon`** for repeat |
| DeFi Analyst | `node scripts/defi-analyst.mjs` — one round: **multi-pool** (`bds_mpp_snapshot_allTrades` + all-pools volume) or `filters.scope: single_pool`; **`--daemon`** for repeat |

## Model guidance

Recipes produce the same stdout/Telegram output regardless of model. Ad-hoc "compose your own" prompts work best on GPT-4–class or GLM-5+; weaker local models may collapse multi-pool prompts onto one pool — **use the Token-Flow recipe** instead.

## Hosts & integrators (OpenClaw, cron, heartbeats)

**OpenClaw "one shot" setup (install → pay-signup → cron message):** use the copy-paste prompt in **`references/08-openclaw-one-shot.md`** so agents get a single, repeatable instruction block without hunting daily notes.

**Scheduled / cron-style runs:** Prefer **`whale-cron.mjs`**, **`whale-radar.mjs`**, **`token-flow.mjs`**, or **`defi-analyst.mjs`** with **no** `--daemon` so each invocation **exits**. **Streaming trade tools** (`bds_mpp_stream_*`) are **not** used by this skill.

## References

See `references/` for quickstart, full tool table, verification, credit budget, scope, troubleshooting, prompt patterns, **`08-openclaw-one-shot.md`** (copy-paste OpenClaw runbook), and cron notes in quickstart + tool catalog.
