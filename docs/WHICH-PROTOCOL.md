# Which agent-commerce protocol can a small shop ignore?

A dated opinion. Read 2026-09-30, review by 2026-12-31. Generated from `data/verdict.json` by `npm run docs`. Do not edit by hand.

A small shop here means a business that sells products online through a hosted platform (Shopify, WooCommerce, Etsy, Wix and the like), has no developers on staff, and does not want to run its own checkout API.

This is a dated opinion, not a guarantee and not financial advice. It is one reading of public sources, made on the read date above and due for review on the review date above. Each claim carries the page it came from and the date it was read. Protocols change, so check the date before you act.

## The short answer

| Protocol | Verdict for a small shop | In one line |
| --- | --- | --- |
| Clean product data | **DO NOW** | Do this now. It pays whichever protocol wins. |
| UCP (Universal Commerce Protocol, Google and Shopify) | **WAIT** | Do not build it yourself. Watch it, and check your platform. |
| ACP (Agentic Commerce Protocol, OpenAI and Stripe) | **IGNORE CHECKOUT** | Ignore the checkout API. The feed half may matter, through your platform. |
| AP2 (Agent Payments Protocol, Google) | **IGNORE** | Ignore it. There is nothing for a shop to publish. |
| x402 (HTTP 402 payments, x402 Foundation) | **IGNORE** | Ignore it for a product shop. It fits selling digital access to agents. |

## Why, protocol by protocol

### Clean product data

**Do this now. It pays whichever protocol wins.**

Keep one accurate product record: title, description, price, currency, availability, images, barcodes. Publish it as schema.org Product and Offer on your pages, and keep the same facts in your platform or Merchant Center feed. Every route below starts from that record.

- PayPal's explainer on the AI shopping protocols tells merchants to start by making their product catalog clear, with good titles and metadata. ([PayPal newsroom](https://newsroom.paypal-corp.com/2026-01-22-Making-Sense-of-the-AI-Shopping-Protocol-Moment), 2026-01-21, read 2026-09-30)
- Google's UCP checkout help page says Merchant Center stays the hub for product data, and that the best preparation is complete, current product data there. ([Google Merchant Center Help](https://support.google.com/merchants/answer/16837055), undated page, read 2026-09-30)
- After ending Instant Checkout, OpenAI said merchants can share product feeds and promotions so their products are represented in ChatGPT. ([CNBC](https://www.cnbc.com/2026/03/24/openai-revamps-shopping-experience-in-chatgpt-after-instant-checkout.html), 2026-03-24, read 2026-09-30)

### UCP (Universal Commerce Protocol, Google and Shopify)

**Do not build it yourself. Watch it, and check your platform.**

UCP is the one wired into Google's own surfaces, AI Mode and Gemini. Google's help page says shoppers may see its checkout soon, that it is for selected merchants with products eligible in the US, Canada and Australia, that you join through an interest form, and that only products marked with the native_commerce attribute get the Buy button. Shopify says its agentic storefronts reach Google AI Mode and Gemini by default for eligible stores. So if you are on Shopify or already use Merchant Center, the work is your data, not the protocol. If you are on neither, this guide found no route for a small shop that does not need a developer.

- UCP checkout on Google is limited to selected merchants. The page lists the US, Canada and Australia, an interest form, the native_commerce product attribute and a Google Pay token accepted by your payment provider. ([Google Merchant Center Help](https://support.google.com/merchants/answer/16837055), undated page, read 2026-09-30)
- Shopify says agentic storefronts are active by default for eligible stores and reach ChatGPT, Google AI Mode and Gemini, Microsoft Copilot and Meta, with Google reached through the Google and YouTube channel or Merchant Center. ([Shopify Help Center](https://help.shopify.com/en/manual/online-sales-channels/agentic-storefronts), undated page, read 2026-09-30)
- UCP's governing council lists Google, Shopify and Stripe, and its latest release tag is v2026-08-25. ([UCP announcements page and GitHub releases](https://github.com/Universal-Commerce-Protocol/ucp/releases/tag/v2026-08-25), 2026-08-25, read 2026-09-30)

### ACP (Agentic Commerce Protocol, OpenAI and Stripe)

**Ignore the checkout API. The feed half may matter, through your platform.**

ACP is marked beta in its own README. Its best-known feature, Instant Checkout in ChatGPT, was wound down in March 2026: OpenAI told Skift on 2026-03-05 that checkout was moving to apps, and CNBC reported on 2026-03-24 that merchants now use their own checkout while ChatGPT focuses on product discovery. What is left for a small shop is a product feed. The spec has a Feed API (spec 2026-04-17) where merchants push products. You should not write that yourself: use what your platform or payment provider offers.

- An OpenAI spokesperson said ChatGPT is prioritising search and product discovery, with ACP as the infrastructure connecting users to merchants, and Instant Checkout moving to apps. ([Skift](https://skift.com/2026/03/05/openai-chatgpt-checkout-walkback/), 2026-03-05, read 2026-09-30)
- CNBC reported OpenAI had pivoted away from Instant Checkout, let merchants use their own checkout, and opened product discovery to merchant feeds. Retailers named include Target, Sephora and Nordstrom. ([CNBC](https://www.cnbc.com/2026/03/24/openai-revamps-shopping-experience-in-chatgpt-after-instant-checkout.html), 2026-03-24, read 2026-09-30)
- The ACP README shows a Beta status badge and says the spec is maintained by OpenAI and Stripe. MAINTAINERS.md also lists Meta. Spec releases so far: 2025-09-29, 2025-12-12, 2026-01-16, 2026-01-30 and 2026-04-17. ([agentic-commerce-protocol/agentic-commerce-protocol on GitHub](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol/blob/7fdd78df677a94dce04c770644b0fbbb1401272b/README.md), 2026-07-18 (commit date), read 2026-09-30)

### AP2 (Agent Payments Protocol, Google)

**Ignore it. There is nothing for a shop to publish.**

AP2 is a trust layer: signed mandates that prove what a buyer authorised, passed between platforms, merchants' systems and payment processors. UCP treats it as an optional extension. A small shop gets it, if at all, from the platform or payment provider that runs checkout. It has no catalog fields, so it does not appear in the crosswalk.

- The UCP docs describe AP2 as the trust layer, with the business signing checkout state and the platform sending signed mandates. It depends on the UCP checkout capability. ([UCP docs, page UCP and AP2](https://github.com/Universal-Commerce-Protocol/ucp/blob/v2026-08-25/docs/documentation/ucp-and-ap2.md), 2026-08-25 (release tag), read 2026-09-30)
- PayPal's explainer describes AP2 as focused on security and verification, including telling legitimate shopping agents from bots. ([PayPal newsroom](https://newsroom.paypal-corp.com/2026-01-22-Making-Sense-of-the-AI-Shopping-Protocol-Moment), 2026-01-21, read 2026-09-30)
- The AP2 repository's latest release is v0.2.0 and its last push was 2026-06-17. ([google-agentic-commerce/AP2 on GitHub](https://github.com/google-agentic-commerce/AP2/releases), 2026-04-28, read 2026-09-30)

### x402 (HTTP 402 payments, x402 Foundation)

**Ignore it for a product shop. It fits selling digital access to agents.**

x402 lets a server answer an HTTP request with a 402 and get paid, usually in stablecoins, before it responds. That suits an API, a dataset or an article sold per request. It does not sell a physical product with shipping and returns. Cloudflare's agent readiness checker looks for x402, UCP and ACP and does not count them toward the score, which tells you where the market sits. The testnet demo in this repo is for learning only.

- Cloudflare's Agent Readiness tool checks for x402, UCP and ACP, and says these checks do not currently count toward the score. ([Cloudflare blog](https://blog.cloudflare.com/agent-readiness/), 2026-04-17, read 2026-09-30)
- x402.org lists, for the last 30 days, 75.41M transactions, $24.24M volume, 94.06K buyers and 22K sellers, and names the x402 Foundation as steward. ([x402.org](https://x402.org), live counter, read 2026-09-30, read 2026-09-30)
- The x402 v2 spec defines 402 responses with a PAYMENT-REQUIRED header, a PAYMENT-SIGNATURE header from the client and a PAYMENT-RESPONSE header back. ([x402-foundation/x402 on GitHub](https://github.com/x402-foundation/x402/blob/6b6ee91fee027b540faabcb25774e73851006c3b/specs/transports-v2/http.md), 2026-09-29 (commit date), read 2026-09-30)


## What to do this month

1. Run `npx github:reidifydesign/agent-commerce-map check https://your-shop/product-page` on one product page and fix what it reports. It reads your schema.org markup and says whether an ACP feed product and a UCP catalog product could be built from it, checked against the pinned schemas.
2. If you are on Shopify, open Sales channels and look for the Agentic channel. If you use Google Merchant Center, read Google's UCP checkout help page and check your feed. Both are linked above.
3. Do not build checkout endpoints for any of these. Nothing above says a small shop needs to.
4. Come back after 2026-12-31. The dates in this page are the point: they tell you when it went stale.

## What this page cannot tell you

Neither the ACP nor the UCP specification text mentions schema.org or JSON-LD (searched in the specs on 2026-09-30). Both take product data through feeds or a merchant account such as Google Merchant Center. So the crosswalk is a map between three descriptions of the same product record. It is not evidence that an agent reads your page markup into either protocol.

Open questions, left as they were found:

- [[CONFIRM: date of the Linux Foundation announcement that launched the x402 Foundation. x402.org links to it but the page read did not state a date.]]
- [[CONFIRM: whether Google's UCP checkout has opened beyond selected merchants since 2026-09-30. The help page is undated.]]
- [[CONFIRM: which ACP feed ingestion routes a small merchant can actually reach without a developer. The spec defines the API, the read did not find a merchant sign-up page.]]

## How the dates stay honest

The field table is checked by `agent-commerce-map drift` against the newest version of each source, on a schedule once the repo is public. A path that stops resolving fails the run. This verdict page is checked by hand, which is why it carries a review date.
