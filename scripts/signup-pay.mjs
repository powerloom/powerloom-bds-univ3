#!/usr/bin/env node
/**
 * Headless pay-signup: POST /signup/pay/quote → ERC-20 transfer → POST /signup/pay/claim.
 *
 * Required env:
 *   EVM_PRIVATE_KEY   — hex, optionally 0x-prefixed (funds the transfer; becomes the account’s payer address)
 *   PLAN_ID           — plan id from GET /credits/plans
 *   CHAIN_ID          — EIP-155 chain id (must match the plan row)
 *   EVM_CHAIN_ID      — same as CHAIN_ID (optional alias; used by bds-agent profile `.evm.env`)
 *   TOKEN_SYMBOL      — must match plan.token_symbol for that chain
 *
 * Optional:
 *   METERING_BASE_URL — default https://bds-metering.powerloom.io
 *   EVM_RPC_URL       — if unset, uses rpc_hint from the quote (may be rate-limited)
 *   AGENT_NAME        — default openclaw-pay-agent
 *   EMAIL             — if set, must not already be registered
 *
 * On success, prints JSON with api_key — set POWERLOOM_API_KEY from the output.
 *
 * Usage:
 *   node scripts/signup-pay.mjs
 */

import { ethers } from "ethers";

const ERC20_ABI = ["function transfer(address to, uint256 amount) returns (bool)"];

async function main() {
  const base = (process.env.METERING_BASE_URL || "https://bds-metering.powerloom.io").replace(
    /\/$/,
    "",
  );
  const pk = (process.env.EVM_PRIVATE_KEY || "").trim();
  const planId = (process.env.PLAN_ID || "").trim();
  const chainId = parseInt(process.env.CHAIN_ID || process.env.EVM_CHAIN_ID || "", 10);
  const tokenSymbol = (process.env.TOKEN_SYMBOL || "").trim();
  const agentName = (process.env.AGENT_NAME || "openclaw-pay-agent").trim();
  const emailRaw = (process.env.EMAIL || "").trim();

  if (!pk) {
    console.error("Set EVM_PRIVATE_KEY");
    process.exit(1);
  }
  if (!planId || !Number.isFinite(chainId) || !tokenSymbol) {
    console.error("Set PLAN_ID, CHAIN_ID, and TOKEN_SYMBOL (see GET /credits/plans on the metering origin).");
    process.exit(1);
  }

  const wallet = new ethers.Wallet(pk.startsWith("0x") ? pk : `0x${pk}`);
  const quoteBody = {
    agent_name: agentName,
    plan_id: planId,
    chain_id: chainId,
    token_symbol: tokenSymbol,
    payer_address: wallet.address,
  };
  if (emailRaw) {
    quoteBody.email = emailRaw;
  }

  const qr = await fetch(`${base}/signup/pay/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(quoteBody),
  });
  const quoteText = await qr.text();
  let quote;
  try {
    quote = JSON.parse(quoteText);
  } catch {
    console.error("Quote response not JSON:", quoteText.slice(0, 500));
    process.exit(1);
  }
  if (!qr.ok) {
    console.error(JSON.stringify(quote, null, 2));
    process.exit(1);
  }

  const rpcUrl = (process.env.EVM_RPC_URL || "").trim() || quote.rpc_hint;
  if (!rpcUrl) {
    console.error("No RPC: set EVM_RPC_URL or ensure the quote includes rpc_hint.");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== Number(quote.chain_id)) {
    console.error(
      `RPC chainId ${net.chainId} does not match quote.chain_id ${quote.chain_id}. Fix EVM_RPC_URL.`,
    );
    process.exit(1);
  }

  const signer = wallet.connect(provider);
  const token = new ethers.Contract(quote.token_contract, ERC20_ABI, signer);
  const amount = BigInt(quote.amount_atomic);
  const tx = await token.transfer(quote.recipient, amount);
  console.error("Submitted tx", tx.hash);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    console.error("Transfer failed or reverted.");
    process.exit(1);
  }

  const cr = await fetch(`${base}/signup/pay/claim`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ signup_nonce: quote.signup_nonce, tx_hash: receipt.hash }),
  });
  const claimText = await cr.text();
  let claim;
  try {
    claim = JSON.parse(claimText);
  } catch {
    console.error("Claim response not JSON:", claimText.slice(0, 500));
    process.exit(1);
  }
  if (!cr.ok) {
    console.error(JSON.stringify(claim, null, 2));
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        api_key: claim.api_key,
        org_id: claim.org_id,
        credit_balance: claim.credit_balance,
        plan_id: claim.plan_id,
        tx_hash: claim.tx_hash,
        chain_id: claim.chain_id,
        notice: "Export: export POWERLOOM_API_KEY=<api_key> (do not commit keys).",
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
