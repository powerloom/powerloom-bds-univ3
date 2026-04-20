# Prompt → tool mapping

| User intent | Prefer |
|-------------|--------|
| “All USDC swaps”, “every trade for token X” | `bds_mpp_stream_allTrades` or `bds_mpp_snapshot_allTrades` + **Token-Flow** recipe (`token-flow.yaml`). |
| “Watch one pool only” | `bds_mpp_snapshot_trades_pool_address` + pool address from discovery. |
| “Whale / large USD” | **Whale Radar** recipe + `threshold_usd`. |
| “Prove on-chain” / “verify CID” | `verify_data_provenance` with **exact** `epoch_id`, `project_id`, `cid` from API. |
| “Streaming live” | `bds_mpp_stream_allTrades` with `from_epoch` checkpoint. |

Avoid leading with a single pool address table in ad-hoc prompts — it biases weak models to one pool. Use this skill’s **task table** in `SKILL.md` instead.
