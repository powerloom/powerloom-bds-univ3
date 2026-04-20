---
name: powerloom-bds-univ3
description: |
  Autonomous Uniswap V3 monitoring on consensus-backed data. Every data point is
  finalized on-chain by Powerloom's decentralized sequencer-validator network (DSV)
  and independently verifiable via verify_data_provenance. Ships with Whale Radar,
  Token-Flow, and Autonomous DeFi Analyst recipes. Metered: use your Powerloom BDS API key.
  Triggers on phrases like "whale alert", "track trades", "all trades for", "by token",
  "USDC swaps", "Powerloom", "verify on-chain".
version: 0.1.0
homepage: https://bds.powerloom.io
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
    emoji: "UniV3"
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

1. **Get an API key** — [bds.powerloom.io](https://bds.powerloom.io) (~2 minutes: sign up, optional top-up, copy key).
2. **Export** `POWERLOOM_API_KEY=sk_live_...` wherever OpenClaw reads environment variables.
3. **Sanity check:** `node scripts/ensure-credits.mjs` — prints balance; exits non-zero on 401 / zero balance.
4. **Default MCP endpoint:** `https://bds-mcp.powerloom.io/sse` — override with `POWERLOOM_MCP_URL` if needed.

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
| Whale Radar | `node scripts/whale-radar.mjs` (`--mode poll` optional) |
| Token-Flow | `node scripts/token-flow.mjs` (`--token 0x...`) |
| DeFi Analyst | `node scripts/defi-analyst.mjs` (`--once` for one report) |

## Model guidance

Recipes produce the same stdout/Telegram output regardless of model. Ad-hoc “compose your own” prompts work best on GPT-4–class or GLM-5+; weaker local models may collapse multi-pool prompts onto one pool — **use the Token-Flow recipe** instead.

## References

See `references/` for quickstart, full tool table, verification, credit budget, scope, troubleshooting, and prompt patterns.
