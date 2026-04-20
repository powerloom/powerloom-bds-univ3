# Powerloom BDS — Uniswap V3 (ClawHub skill)

## Autonomous Uniswap V3 monitoring + onchain provenance verification, in minutes. Decentralized data, not trust-me data.

Every data point this skill fetches is finalized onchain by Powerloom's decentralized sequencer-validator network. The `verify_data_provenance` tool compares API CIDs to onchain commitments so alerts can carry a cryptographic receipt, not a vendor's word.

## Recipes

- **Whale Radar** — USD-threshold swap alerts across indexed pools (stream by default).
- **Token-Flow** — all swaps touching a configured token (default USDC) across pools derived at runtime.
- **Autonomous DeFi Analyst** — volume + ETH price + top trade, with random verification sampling (no-LLM templates in v1).

## Setup

```bash
cd powerloom-bds-univ3
npm install
export POWERLOOM_API_KEY=sk_live_...
node scripts/ensure-credits.mjs
```

Optional: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and `dispatch.channel: telegram` in `recipes/*.yaml`.

## Links

- Sign up / billing: [bds.powerloom.io/metering](https://bds.powerloom.io/metering)
- Hosted MCP SSE: `https://bds-mcp.powerloom.io/sse`

## Publish (maintainers)

```bash
npx clawhub login
npx clawhub publish . --slug powerloom-bds-univ3 --version 0.1.0
```

## Repository

Source: [github.com/powerloom/powerloom-bds-univ3](https://github.com/powerloom/powerloom-bds-univ3) (mirror this folder into that org repo).
