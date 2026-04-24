---
name: powerloom-bds-univ3
description: |
  Autonomous Uniswap V3 monitoring on consensus-backed data. Every data point is
  finalized on-chain by Powerloom's decentralized sequencer-validator network (DSV)
  and independently verifiable via verify_data_provenance. Ships with Whale Radar,
  Token-Flow, and Autonomous DeFi Analyst recipes. Metered: use your Powerloom BDS API key.
  Triggers on phrases like "whale alert", "track trades", "all trades for", "by token",
  "ERC20", "ERC20 token swaps", "Powerloom", "verify on-chain", "verified data".
version: 0.1.0
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
        - POWERLOOM_API_KEY
      optional_env:
        - POWERLOOM_MCP_URL
        - TELEGRAM_BOT_TOKEN
        - TELEGRAM_CHAT_ID
        - DISCORD_WEBHOOK_URL
        - BDS_MCP_CALL_TIMEOUT_MS
---

# Powerloom BDS — Uniswap V3

## Install

There are **two** supported ways to obtain a BDS API key (same metering origin for both: [bds-metering.powerloom.io](https://bds-metering.powerloom.io)).

### Path A — Browser / device auth (default)

1. Open [bds-metering.powerloom.io/metering](https://bds-metering.powerloom.io/metering) and complete device-auth signup; copy your key when shown.
2. **Export** `POWERLOOM_API_KEY=sk_live_...` wherever OpenClaw reads environment variables.
3. **Sanity check:** `node scripts/ensure-credits.mjs` — prints balance; exits non-zero on 401 / zero balance.

### Path B — Pay signup (headless, wallet-funded)

For agents and CI without a browser: fund an EVM wallet, then run the quote → pay → claim flow against `POST /signup/pay/quote` and `POST /signup/pay/claim` on the metering API.

1. From [GET /credits/plans](https://bds-metering.powerloom.io/credits/plans) (same origin), pick a `plan_id`, `chain_id`, and matching `token_symbol` for a row you can pay.
2. Set `EVM_PRIVATE_KEY`, `PLAN_ID`, `CHAIN_ID`, `TOKEN_SYMBOL`, and usually `EVM_RPC_URL` (or rely on the quote’s `rpc_hint` if the provider allows it), then:
   - **Node (this repo):** `node scripts/signup-pay.mjs` — see script header for env. Requires `npm install` (adds `ethers` for the transfer).
   - **Python (Powerloom `bds-agent` CLI):** `bds-agent credits setup-evm` then `bds-agent signup-pay --plan-id … --chain-id … --token-symbol …` (saves the key under your profile; same metering URL as device signup).
3. **Export** the printed `sk_live_...` as `POWERLOOM_API_KEY` (treat it like a password).

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
