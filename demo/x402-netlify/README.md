# x402 on a static site, testnet only

A Netlify edge function that puts `/premium/*` behind an HTTP 402, using x402 version 2 on a test network. It is a demo for learning how the flow works. It is not a shop, and this repo's [which-protocol guide](../../docs/WHICH-PROTOCOL.md) explains why most product shops can ignore x402.

Nothing here can move real money:

- the function refuses any network that is not on the test list in the file (`TESTNETS`)
- there is no private key in the code or in the settings, only `PAY_TO`, a public address that receives test tokens
- the default price is 1000 atomic units of test USDC on Base Sepolia, which is 0.001 test USDC

## Set it up

1. Copy it out: `npx github:reidifydesign/agent-commerce-map x402-demo ./my-x402-demo`
2. Get a test wallet address of your own (any EVM address works, for example one from a wallet you use only for testing).
3. In Netlify, create a site from that folder and set one environment variable, `PAY_TO`, to that address.
4. Deploy. Check it: `npx github:reidifydesign/agent-commerce-map x402-probe https://YOUR-SITE.netlify.app/premium/guide.md`

The probe should report a 402 on a known test network. A plain `curl -i` shows the same thing: a 402 and a `PAYMENT-REQUIRED` header holding base64 JSON.

## Paying for real (on the test network)

The repo does not ship a payer. Use the official client packages, for example `@x402/fetch` with `@x402/evm` (both at 2.28.0 on npm when this was written, 2026-09-30), and fund a test wallet from a public faucet. See the [x402 docs](https://x402.org) for the client steps.

## What it does and does not do

- Verifies and settles through the public facilitator at `https://x402.org/facilitator`, unless you set `X402_FACILITATOR`.
- Settles only after the file was found, so a 404 is never charged.
- Sends `Cache-Control: no-store` on paid responses.
- Does not check who the payer is, rate limit, log, or keep receipts.
- Has no tests against a live facilitator. The repo's tests use a stand-in facilitator.
- The x402 spec is moving (the reference repo is at package version 2.28.0 on npm). Re-read the spec before relying on any header name.
