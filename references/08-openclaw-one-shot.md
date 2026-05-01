# OpenClaw: pay-signup + whale cron (one-shot prompt)

Use this as a **single agent message** after installing the skill from ClawHub. It matches how the skill is meant to run: **bounded** `bds_mpp_snapshot_allTrades` via `scripts/whale-cron.mjs`, **not** streaming or long-lived background processes.

---

## Copy-paste prompt

````
Install the skill "🦄 Powerloom Uniswap V3 timeseries data" (powerloom-bds-univ3) from ClawHub.
After install, run npm install in the skill directory.

Then set up pay-signup and a whale radar cron. Details:

1. PLAN: launch_10_pl_power_cgt (POWER native on chain 7869, rpc-v2.powerloom.network)
2. The user provides a private key for the payer wallet — run `node scripts/signup-pay.mjs` for pay-signup.
   `signup-pay.mjs` uses `quote.payment_kind`: `native_value` → `sendTransaction({ value })`; `erc20` → `token.transfer()`.
3. After signup, set the `sk_live_...` API key and all six env vars in OpenClaw under
   `skills.entries.powerloom-bds-univ3.env.*`:
   `POWERLOOM_EVM_PRIVATE_KEY`, `POWERLOOM_EVM_RPC_URL`, `POWERLOOM_EVM_CHAIN_ID`, `POWERLOOM_PLAN_ID`, `POWERLOOM_TOKEN_SYMBOL`, `POWERLOOM_API_KEY`.
   If the schema expects strings, pass `POWERLOOM_EVM_CHAIN_ID` as a quoted string (e.g. `"7869"`).
4. `scripts/whale-cron.mjs` should:
   - Use `lib/mcp.mjs` `callTool()` for all MCP calls (SSE handshake, not raw HTTP).
   - Use `lib/trade-utils.mjs` `flattenAllTradesFromSnapshot()` to parse the snapshot.
   - Response shape: `result.data.tradeData` = `{ poolAddr: { trades: [...] } }`.
   - Resolve pool token names with `bds_mpp_pool_pool_address_metadata` per unknown pool;
     cache in `.powerloom/pool-metadata-cache.json` (override with `WHALE_CRON_POOL_CACHE`).
   - Verification: `result.data.verification` = `{ cid, epochId, projectId }` — surface in alerts (e.g. ✅).
   - Telegram: `parse_mode: MarkdownV2` with full escaping, or plain-text fallback.
   - If the script is missing or broken, rebuild using the skill’s `lib/*` helpers only.
5. Create an OpenClaw cron job:
   - Name: e.g. "Whale Radar"
   - Schedule: e.g. every 15s (`--every 15s` with `openclaw cron add`)
   - Timeout: 90s (`--timeout 90000`)
   - Session: isolated (`--session isolated`)
   - Flags: `--no-deliver`, `--light-context`
   - Message: a shell command that `cd`s to the skill dir, sets env inline
     (`POWERLOOM_API_KEY`, `POWERLOOM_TELEGRAM_BOT_TOKEN`, `POWERLOOM_TELEGRAM_CHAT_ID`, `POWERLOOM_BDS_MCP_CALL_TIMEOUT_MS=120000`,
     `WHALE_CRON_THRESHOLD=10000`), then runs `node scripts/whale-cron.mjs`.
   - Telegram: read `botToken` from OpenClaw `channels.telegram` / config; chat id from user or config.
6. Before the first run: `rm -f .powerloom/whale-cron-state.json` if you need a clean epoch cursor.
   Keep `.powerloom/pool-metadata-cache.json` across reinstalls unless debugging metadata.
7. Set WHALE_CRON_STATE_FILE and WHALE_CRON_POOL_CACHE to paths outside the skill directory (e.g. in the workspace root) so they survive openclaw skills install --force.

Constraints:
- Do NOT use `bds_mpp_stream_allTrades` for this cron — use `bds_mpp_snapshot_allTrades` only.
- Do NOT run the tracker as a background process — use OpenClaw cron only.
- Do NOT show "???" for unknown tokens — resolve via the metadata tool or show the address.
````

---

## Verification provenance (cron script + one-shot)

**In `scripts/whale-cron.mjs` (already implemented):** each `bds_mpp_snapshot_allTrades` result carries `data.verification` (`cid`, `epochId`, `projectId`). The script reads that object once per poll and appends a **“Verified on-chain”** block (CID, epoch, project) to each formatted alert in `formatAlert` — it is not optional glue you add in the OpenClaw message; the one-shot above assumes this behavior.

**Independent check:** the MCP tool `verify_data_provenance` can confirm commitments using the same `cid` / `epoch_id` / `project_id` — see **`references/03-verification.md`** and the **Verify** row in `SKILL.md` (data table).

---

## Related files in this skill

| Item | Location |
|------|----------|
| Cron entrypoint (incl. verification in alerts) | `scripts/whale-cron.mjs` |
| Pay-signup | `scripts/signup-pay.mjs` |
| MCP + trade helpers | `lib/mcp.mjs`, `lib/trade-utils.mjs`, `lib/state.mjs` |
| On-chain verification details | `references/03-verification.md` |
| Integrator rules | `SKILL.md` → **Hosts & integrators** |

See also `references/01-quickstart.md` and `references/06-troubleshooting.md`.
