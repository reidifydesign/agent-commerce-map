// Builds docs/CROSSWALK.md and docs/WHICH-PROTOCOL.md from the data files, so the prose cannot
// drift from the data. `node scripts/build-docs.mjs --check` fails if the files are out of date.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCrosswalk, loadVerdict } from '../src/data.mjs';
import { renderMarkdown, summarise } from '../src/crosswalk.mjs';
import { renderVerdictMarkdown } from '../src/render.mjs';
import { SOURCES } from '../src/sources.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function buildCrosswalkDoc() {
  const cw = loadCrosswalk();
  const s = summarise(cw);
  const a = SOURCES.acp, u = SOURCES.ucp, o = SOURCES.schemaorg;
  return `# ACP, UCP and schema.org Product crosswalk

Verified ${cw.meta.verified}. Generated from \`data/crosswalk.json\` by \`npm run docs\`. Do not edit by hand.

${cw.meta.scope}

${cw.meta.reading}

**${cw.rows.length} concepts.** ${s['both protocols']} are carried by both protocols, ${s['UCP only']} by UCP only, ${s['ACP only']} by ACP only, and ${s['neither protocol']} by neither (those are in schema.org only).

## What it was checked against

| Source | Version | Pinned at | Licence |
| --- | --- | --- | --- |
| ACP product feed schema | ${a.pinned.label}, file \`${a.pinned.file}\` | [commit ${a.pinned.ref.slice(0, 7)}](https://github.com/${a.repo}/tree/${a.pinned.ref}) (${a.pinned.refDate}) | ${a.licence} |
| UCP shopping types | ${u.pinned.label}, \`Product\` and \`Variant\` plus the files they reference | [commit ${u.pinned.ref.slice(0, 7)}](https://github.com/${u.repo}/tree/${u.pinned.ref}) (tag ${u.pinned.tag}, ${u.pinned.refDate}) | ${u.licence} |
| schema.org | ${o.pinned.label}, released ${o.pinned.refDate} | [commit ${o.pinned.ref.slice(0, 7)}](https://github.com/schemaorg/schemaorg/tree/${o.pinned.ref}) | ${o.licence} |

Notation: \`Variant.price.amount\` means the \`amount\` field inside \`price\` on a Variant. \`[]\` marks a list. For schema.org, \`Offer.price\` means the \`price\` property on the \`Offer\` class, including properties inherited from its parents.

${renderMarkdown(cw)}

## Reading the table

- **none** in a protocol column means the Product and Variant objects have no field for it. It does not mean the protocol cannot carry the idea somewhere else, for example in checkout.
- Conversions are written in the last column. \`agent-commerce-map convert\` applies them and checks the result against the pinned schemas.
- The ACP schema sets \`additionalProperties: false\` on these objects, so an extra field such as \`brand\` is rejected, not ignored. UCP's \`metadata\` and \`tags\` are the only open slots.
- Fields in the unreleased ACP spec are tracked by \`agent-commerce-map drift\`, not by this table, until they ship in a dated release.
`;
}

export function buildWhichDoc() {
  const v = loadVerdict();
  return `# Which agent-commerce protocol can a small shop ignore?

Verified ${v.meta.verified}. Review by ${v.meta.next_review}. Generated from \`data/verdict.json\` by \`npm run docs\`. Do not edit by hand.

${v.meta.who}

${v.meta.how_to_read}

## The short answer

${renderVerdictMarkdown(v).split('\n### ')[0].trim()}

## Why, protocol by protocol

${'### ' + renderVerdictMarkdown(v).split('\n### ').slice(1).join('\n### ')}

## What to do this month

1. Run \`npx github:reidifydesign/agent-commerce-map check https://your-shop/product-page\` on one product page and fix what it reports. It reads your schema.org markup and says whether an ACP feed product and a UCP catalog product could be built from it, checked against the pinned schemas.
2. If you are on Shopify, open Sales channels and look for the Agentic channel. If you use Google Merchant Center, read Google's UCP checkout help page and check your feed. Both are linked above.
3. Do not build checkout endpoints for any of these. Nothing above says a small shop needs to.
4. Come back after ${v.meta.next_review}. The dates in this page are the point: they tell you when it went stale.

## What this page cannot tell you

${v.meta.caveat}

Open questions, left as they were found:

${v.unverified.map((u) => `- ${u}`).join('\n')}

## How the dates stay honest

The field table is checked by \`agent-commerce-map drift\` against the newest version of each source, on a schedule once the repo is public. A path that stops resolving fails the run. This verdict page is checked by hand, which is why it carries a review date.
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = { 'docs/CROSSWALK.md': buildCrosswalkDoc(), 'docs/WHICH-PROTOCOL.md': buildWhichDoc() };
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const [f, text] of Object.entries(files)) {
    const p = path.join(root, f);
    if (check) {
      const cur = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
      if (cur !== text) { console.error(`${f} is out of date, run: npm run docs`); stale++; }
    } else {
      fs.writeFileSync(p, text);
      console.log('wrote', f);
    }
  }
  process.exitCode = stale ? 1 : 0;
}
