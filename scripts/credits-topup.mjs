#!/usr/bin/env node
/**
 * Existing API key: GET /credits/plans → pick plan → pay on-chain → POST /credits/topup
 * (same verification as bds-agenthub-billing-metering `POST /credits/topup`).
 *
 * Required env:
 *   POWERLOOM_API_KEY  — Bearer sk_live_… (or BDS_API_KEY)
 *   EVM_PRIVATE_KEY    — hex; must fund the transfer
 *   PLAN_ID            — must match a row in GET /credits/plans
 *   CHAIN_ID or EVM_CHAIN_ID — must match that plan’s chain_id
 *   TOKEN_SYMBOL       — must match plan.token_symbol for that row
 *
 * Optional:
 *   METERING_BASE_URL  — default https://bds-metering.powerloom.io
 *   EVM_RPC_URL        — if unset, uses plan.rpc_url or chains[].rpc_url for that chain
 *
 * Usage:
 *   node scripts/credits-topup.mjs
 */

import { ethers } from "ethers";

const ERC20_ABI = ["function transfer(address to, uint256 amount) returns (bool)"];

function fail(msg) {
  console.error(`[credits-topup] ${msg}`);
  process.exit(1);
}

function chainMeta(chains, chainId) {
  return (chains || []).find((c) => Number(c.chain_id) === Number(chainId));
}

function resolveRpc(plan, chains, envRpc) {
  const e = (envRpc || "").trim();
  if (e) return e;
  if (plan.rpc_url && String(plan.rpc_url).trim()) return String(plan.rpc_url).trim();
  const m = chainMeta(chains, plan.chain_id);
  if (m && m.rpc_url && String(m.rpc_url).trim()) return String(m.rpc_url).trim();
  return "";
}

function resolveRecipient(plan, chains) {
  if (plan.recipient && String(plan.recipient).trim()) return String(plan.recipient).trim();
  const m = chainMeta(chains, plan.chain_id);
  if (m && m.recipient && String(m.recipient).trim()) return String(m.recipient).trim();
  return "";
}

async function main() {
  const base = (process.env.METERING_BASE_URL || "https://bds-metering.powerloom.io").replace(
    /\/$/,
    "",
  );
  const apiKey = (process.env.POWERLOOM_API_KEY || process.env.BDS_API_KEY || "").trim();
  const pk = (process.env.EVM_PRIVATE_KEY || "").trim();
  const planId = (process.env.PLAN_ID || "").trim();
  const chainId = parseInt(process.env.CHAIN_ID || process.env.EVM_CHAIN_ID || "", 10);
  const tokenSymbol = (process.env.TOKEN_SYMBOL || "").trim();
  const rpcOverride = (process.env.EVM_RPC_URL || "").trim();

  if (!apiKey) fail("Set POWERLOOM_API_KEY (or BDS_API_KEY)");
  if (!pk) fail("Set EVM_PRIVATE_KEY");
  if (!planId || !Number.isFinite(chainId) || !tokenSymbol) {
    fail("Set PLAN_ID, CHAIN_ID (or EVM_CHAIN_ID), and TOKEN_SYMBOL");
  }

  const pr = await fetch(`${base}/credits/plans`);
  if (!pr.ok) {
    console.error(await pr.text());
    fail(`GET /credits/plans failed (${pr.status})`);
  }
  const bundle = await pr.json();
  const plans = bundle.plans || [];
  const chains = bundle.chains || [];
  const sym = tokenSymbol.toLowerCase();
  const plan = plans.find(
    (p) =>
      p.id === planId &&
      Number(p.chain_id) === chainId &&
      p.active !== false &&
      (p.token_symbol || "").toLowerCase() === sym,
  );
  if (!plan) {
    fail(
      `No matching active plan for id=${planId} chain_id=${chainId} token_symbol=${tokenSymbol}. Run GET /credits/plans.`,
    );
  }

  const rpcUrl = resolveRpc(plan, chains, rpcOverride);
  if (!rpcUrl) fail("No RPC: set EVM_RPC_URL or ensure the plan / chains include rpc_url");

  const recipient = resolveRecipient(plan, chains);
  if (!recipient) fail("No recipient: plan.recipient and chains[].recipient are empty");

  const paymentKind = plan.payment_kind === "native_value" ? "native_value" : "erc20";
  const amount = ethers.parseUnits(String(plan.token_amount), Number(plan.token_decimals));

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== chainId) {
    fail(`RPC chainId ${net.chainId} does not match EVM_CHAIN_ID ${chainId}. Fix EVM_RPC_URL.`);
  }

  const wallet = new ethers.Wallet(pk.startsWith("0x") ? pk : `0x${pk}`);
  const signer = wallet.connect(provider);

  let tx;
  if (paymentKind === "native_value") {
    tx = await signer.sendTransaction({
      to: recipient,
      value: amount,
    });
  } else {
    const token = new ethers.Contract(plan.token_contract, ERC20_ABI, signer);
    tx = await token.transfer(recipient, amount);
  }

  console.error("Submitted tx", tx.hash);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    fail("Transaction failed or reverted");
  }

  const reg = await fetch(`${base}/credits/topup`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      plan_id: planId,
      chain_id: chainId,
      tx_hash: receipt.hash,
    }),
  });
  const text = await reg.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    fail(`Top-up response not JSON: ${text.slice(0, 400)}`);
  }
  if (!reg.ok) {
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({ ...data, notice: "Credits added for this API key." }, null, 2));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
