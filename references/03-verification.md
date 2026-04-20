# `verify_data_provenance`

Compares a snapshot **CID** to on-chain `maxSnapshotsCid` for `(data_market, project_id, epoch_id)` via the Powerloom protocol state contract.

**Inputs:** `cid` (string), `epoch_id` (integer), `project_id` (string). Optional `data_market` override.

**Hosted MCP** runs the eth_call using `BDS_MCP_POWERLOOM_RPC_URL` on the server. If RPC is unset, the tool returns a clear configuration error — not a silent pass.

**In alerts:** only print verification lines when `cid`, `epoch_id`, and `project_id` are all known from the API response. Do not substitute block numbers for epoch IDs.
