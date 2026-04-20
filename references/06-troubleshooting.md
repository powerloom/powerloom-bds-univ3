# Troubleshooting

| Symptom | Cause | Fix |
|---------|--------|-----|
| HTTP 401 | Bad or missing API key | Re-copy key from [bds.powerloom.io](https://bds.powerloom.io); fix `POWERLOOM_API_KEY`. |
| HTTP 402 | Credits exhausted | Top up; reduce recipe cadence; run `ensure-credits.mjs` before crons. |
| HTTP 429 | Rate limit | Increase heartbeat interval; prefer stream mode over poll fan-out. |
| Tool timeout | Backlog / slow finalization | Raise `BDS_MCP_CALL_TIMEOUT_MS`; switch Whale Radar to stream mode. |
| Empty stream | Idle chain / catch-up | Wait; check `from_epoch` in state file. |
| Wrong verify | Confused epoch vs block | Use `epoch_id` from snapshot / `verification` payload, not `blockNumber`. |
| Odd outputs after model swap | OpenClaw context mismatch | Restart OpenClaw; recipes are script-driven — state files live under `.powerloom/`. |
