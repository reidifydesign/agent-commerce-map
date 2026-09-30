# Snapshot notices

These files are pinned copies of third-party material, kept so the test suite can check every crosswalk path offline. Each one records where and when it was read (see the `source` block in each file, and `npx agent-commerce-map sources`).

| File | Contents | Source | Licence |
| --- | --- | --- | --- |
| `acp.json` | The ACP product feed JSON Schema, spec 2026-04-17, unmodified apart from being wrapped with a `source` block | https://github.com/agentic-commerce-protocol/agentic-commerce-protocol at commit 7fdd78df677a94dce04c770644b0fbbb1401272b | Apache License 2.0 |
| `ucp.json` | UCP `Product`, `Variant` and the JSON Schema files they reference, release v2026-08-25, unmodified apart from being gathered into one file | https://github.com/Universal-Commerce-Protocol/ucp at commit cd78fb38e819de77d9b527d110476eccb876f1bd (copyright 2026 UCP Authors) | Apache License 2.0 |
| `schemaorg.json` | Term names, parent classes, property ranges and enumeration members for 23 schema.org classes, extracted from the vocabulary file. No definitions are copied | https://schema.org/version/30.1/schemaorg-current-https.jsonld (V30.1) | CC BY-SA 3.0, see https://schema.org/docs/terms.html |

The Apache License 2.0 text is at https://www.apache.org/licenses/LICENSE-2.0. The original projects own their material. This repository's own code is MIT.
