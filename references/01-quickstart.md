# Quickstart (~10 minutes)

1. **Sign up** at [bds.powerloom.io](https://bds.powerloom.io) — email, verify, copy API key (browser flow when live; CLI `bds-agent signup` still works).
2. **Export** `POWERLOOM_API_KEY=sk_live_...` in the environment OpenClaw uses (or your shell profile).
3. **Optional** — default MCP URL is `https://bds-mcp.powerloom.io/sse`. Override with `POWERLOOM_MCP_URL` if directed.
4. **Check credits**: `node scripts/ensure-credits.mjs` — should print balance JSON and exit 0.
5. **Run a recipe** (stdout first):
   - Whale Radar: `node scripts/whale-radar.mjs`
   - Token-Flow: `node scripts/token-flow.mjs`
   - DeFi Analyst (one shot): `node scripts/defi-analyst.mjs --once`
6. **Telegram** — set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`, set `dispatch.channel` to `telegram` in the recipe yaml.
