---
name: powerloom-bds-univ3
description: |
  Autonomous Uniswap V3 monitoring on consensus-backed data. Every data point is
  finalized on-chain by Powerloom's decentralized sequencer-validator network (DSV)
  and independently verifiable via verify_data_provenance. Ships with Whale Radar,
  Token-Flow, and Autonomous DeFi Analyst recipes. Billing: metering service HTTP APIs; optional bds-agent CLI. Agent-first: plan + wallet then pay-signup, then top-up.
  Triggers on phrases like "whale alert", "track trades", "all trades for", "by token",
  "ERC20", "ERC20 token swaps", "Powerloom", "verify on-chain", "verified data".
version: 0.0.3
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

**Contract:** [bds-agenthub-billing-metering](https://github.com/powerloom/bds-agenthub-billing-metering). **ClawHub** users only need a **single origin** (default [bds-metering.powerloom.io](https://bds-metering.powerloom.io))— **`bds-agent` commands are optional**; they are a reference CLI for the same JSON bodies you can send with `curl` + a wallet or `ethers`.

### Metering HTTP (authoritative)

| What | How |
|------|-----|
| List SKUs | `GET {BASE}/credits/plans` — no auth. Choose a plan row: `id`, `chain_id`, `token_symbol` (and note `payment_kind`: ERC-20 vs native / CGT). |
| New key, wallet-only | **Pay-signup:** `POST {BASE}/signup/pay/quote` → pay on chain → `POST {BASE}/signup/pay/claim` with `signup_nonce` + `tx_hash`. Returns `api_key`. |
| New key, browser | Human device flow on `{BASE}/metering` (same service). |
| More credits, existing key | `POST {BASE}/credits/topup` with `Authorization: Bearer sk_live_…` and tx / plan (not the pay-signup endpoints). |
| Check balance | `GET {BASE}/credits/balance` with `Authorization: Bearer …` |

`{BASE}` is **`METERING_BASE_URL`**, e.g. `https://bds-metering.powerloom.io`. Set **`POWERLOOM_API_KEY`** to the `sk_live_...` you get after pay-signup, device signup, or copy from the dashboard.

### OpenClaw `requires.env` (mirrors a pay-signup row + wallet + key)

| Field | Role |
|-------|------|
| `EVM_PRIVATE_KEY` | Payer wallet |
| `EVM_RPC_URL` | JSON-RPC for that chain |
| `EVM_CHAIN_ID` | Must match the plan’s `chain_id` |
| `PLAN_ID` | e.g. `launch_10_pl_power_cgt` from `GET /credits/plans` |
| `TOKEN_SYMBOL` | e.g. `POWER` (must match that row) |
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
| `node scripts/signup-pay.mjs` | **New** key: pay-signup (quote → **ERC-20** pay → claim). `POWERLOOM_API_KEY` not set yet. |
| `node scripts/credits-topup.mjs` | **More** credits: uses existing **`POWERLOOM_API_KEY`**, fetches `GET /credits/plans`, matches **`PLAN_ID` + `EVM_CHAIN_ID` + `TOKEN_SYMBOL`**, sends **ERC-20** or **native** per `payment_kind`, then **`POST /credits/topup`**. Set **`EVM_RPC_URL`** if the public `rpc_url` in plans is redacted. |
| `node scripts/ensure-credits.mjs` | **Balance** only (`GET /credits/balance`); no purchase. |

`npm install` once (adds `ethers`).

**Optional env (signup script):** `METERING_BASE_URL`, `AGENT_NAME`, `EMAIL` (see [metering README](https://github.com/powerloom/bds-agenthub-billing-metering#readme)).

### After you have a key — more credits (top-up)

**Spec:** `POST {BASE}/credits/topup` with `Authorization: Bearer` and JSON `{ "plan_id", "chain_id", "tx_hash" }` after an on-chain payment that matches the plan. **In this repo:** `node scripts/credits-topup.mjs`. **Reference CLI:** [USER_GUIDE](https://github.com/powerloom/bds-agent-py/blob/main/docs/USER_GUIDE.md) (EVM `credits topup` / Tempo per deployment). **Check balance:** `node scripts/ensure-credits.mjs`.

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
