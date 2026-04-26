# Powerloom BDS — Uniswap V3 (ClawHub skill)

## Autonomous Uniswap V3 monitoring + onchain provenance verification, in minutes. Decentralized data, not trust-me data.

Every data point this skill fetches is finalized onchain by Powerloom's decentralized sequencer-validator network. The `verify_data_provenance` tool compares API CIDs to onchain commitments so alerts can carry a cryptographic receipt, not a vendor's word.

## Recipes

- **Whale Radar** — USD-threshold alerts via **`bds_mpp_stream_allTrades`** (all indexed pools); recipe `poll_fallback_pools` is for **`--mode poll`** only.
- **Token-Flow** — all swaps touching a configured token (default USDC) across pools derived at runtime.
- **Autonomous DeFi Analyst** — default **multi-pool** stream batch + all-pools token volume; set **`filters.scope: single_pool`** in `recipes/defi-analyst.yaml` for legacy single-pool snapshots only.

## Integrators (OpenClaw, cron)

For **scheduled heartbeats**, prefer **poll** mode and snapshot MCP tools — not stream tools. Streams suit **long-running background** services; see **Hosts & integrators** in `SKILL.md`.

## Setup

```bash
cd powerloom-bds-univ3
npm install
export POWERLOOM_API_KEY=sk_live_...
node scripts/ensure-credits.mjs
```

**Metering (no `bds-agent` required):** `scripts/signup-pay.mjs` (new key, pay-signup; **native or ERC-20** per `quote.payment_kind` — e.g. POWER CGT = native) and `scripts/credits-topup.mjs` (more credits, existing key). See **`SKILL.md`**.

Optional: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and `dispatch.channel: telegram` in `recipes/*.yaml`.

## Links (metering service)

One deploy (`npm run build` + `npm start` on **`bds-agenthub-billing-metering`**) serves both:

- **Agent signup (CLI / API)** — origin only: [bds-metering.powerloom.io](https://bds-metering.powerloom.io) (`BDS_AGENT_SIGNUP_URL` / `bds-agent signup --base-url …`).
- **Browser signup + billing UI** — [bds-metering.powerloom.io/metering](https://bds-metering.powerloom.io/metering)

- Hosted MCP SSE: `https://bds-mcp.powerloom.io/sse`

## Naming (ClawHub skill vs MCP tools)

| What | Name |
|------|------|
| ClawHub / OpenClaw skill folder & slug | **`powerloom-bds-univ3`** |
| MCP tools on the hosted server | **`bds_mpp_*`**, **`get_credit_balance`**, **`verify_data_provenance`** — there is **no** tool named `bds_univ3`. |

To print the live tool list from the API (same handshake as `callTool`):

```bash
export POWERLOOM_API_KEY=sk_live_...
node scripts/list-mcp-tools.mjs
```

## Test locally (without publishing to ClawHub)

Publishing is optional for trying the **scripts** and **SKILL.md** instructions:

1. **Scripts only** — From this directory, with `POWERLOOM_API_KEY` set, run `node scripts/ensure-credits.mjs`, `node scripts/list-mcp-tools.mjs` (proves tool names), `node scripts/powerloom-mcp-client.mjs get_credit_balance '{}'`, or a recipe (`whale-radar.mjs`, etc.). That validates MCP wiring end-to-end against the hosted server.

2. **OpenClaw / ClawHub** — If **`skills list`** and the **dashboard** show **`powerloom-bds-univ3`** as **ready**, the skill is **on disk and registered**. That is not the same as “the main chat always loads **`SKILL.md`** into the model on every turn.” If chat still acts blind, check your OpenClaw **agent** actually **uses** that skill (per-agent skill selection / defaults), then **new session** after changes. The reliable execution path is still **`node scripts/…`** with **`POWERLOOM_API_KEY`**; chat is best-effort unless you also wire **BDS MCP** for tools in the tool list.

   - **Registry:** `clawhub install powerloom-bds-univ3` only pulls **published** builds. **Local dev:** copy this repo’s root into **`…/workspace/skills/powerloom-bds-univ3/`** with **`SKILL.md`** at the folder root, set **`POWERLOOM_API_KEY`** in `openclaw.json` skill `entries`, restart the gateway.
   - **Compose / `OPENCLAW_WORKSPACE_DIR`:** The stack usually reads a **`.env` file next to `docker-compose.yml`**. [Docker Compose](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/) substitutes **`${OPENCLAW_WORKSPACE_DIR}`** from: that `.env` file, or **exported** variables in the shell you run `docker compose` from, or a **`.env` override** your vendor documents. It is not magic — if unset, the mount line can be wrong or empty. Set it to the **host** path that should map to `…/workspace` in the container (often your user’s `…/.openclaw/workspace` as an **absolute** path). Check `docker compose config` to see the resolved value.

   Docker bind mounts, **`ENOENT`**, symlinks, UI quirks: **`references/06-troubleshooting.md`**.

3. **After publish** — `clawhub install powerloom-bds-univ3` (or the slug you published).

## Publish (maintainers)

```bash
npx clawhub login
npx clawhub publish . --slug powerloom-bds-univ3 --version 0.1.0
```

## Repository

Source: [github.com/powerloom/powerloom-bds-univ3](https://github.com/powerloom/powerloom-bds-univ3) (mirror this folder into that org repo).
