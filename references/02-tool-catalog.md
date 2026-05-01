# MCP tool catalog (cost / latency)

All calls are metered unless noted. **Defaults:** `POWERLOOM_BDS_MCP_CALL_TIMEOUT_MS=60000` (raise to 120000 for `bds_mpp_stream_allTrades` with `max_events=50`).

**Cron / OpenClaw:** prefer **snapshot** rows below for heartbeat jobs; reserve **stream** for dedicated long-running consumers (see `SKILL.md` → Hosts & integrators).

| Tool | Role | p95 latency (steady / backlog) | Notes |
|------|------|----------------------------------|--------|
| `bds_mpp_stream_allTrades` | Stream batch up to 50 epochs | ~2s connect + per-epoch upstream | Default Whale Radar / Token-Flow. |
| `bds_mpp_snapshot_trades_pool_address` | Pool snapshot | 5–35s variable | Poll fallback. |
| `bds_mpp_snapshot_allTrades` | One-shot all pools | 8–45s | Alternative to stream. |
| `bds_mpp_token_token_address_pools` | Pools for token | 1–5s | Token-Flow allowlist. |
| `bds_mpp_tradeVolume_pool_address_time_interval` | Volume | 1–5s | DeFi Analyst. |
| `bds_mpp_ethPrice` | ETH USD | 0.5–2s | Cached in recipes when possible. |
| `verify_data_provenance` | On-chain CID check | 0.5–2s | Server-side `eth_call` only; response does not include configured RPC. |
| `get_credit_balance` | Metering | 0.2–1s | Pre-flight. |

Replace placeholders after a 1-hour dry run on mainnet MCP.
