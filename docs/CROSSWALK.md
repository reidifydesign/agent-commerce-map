# ACP, UCP and schema.org Product crosswalk

Verified 2026-09-30. Generated from `data/crosswalk.json` by `npm run docs`. Do not edit by hand.

Catalog data only: the Product and Variant objects of the ACP product feed and the UCP shopping catalog, against schema.org Product, ProductGroup and Offer. Checkout, payment, order and fulfilment objects are out of scope.

Each path is checked against the pinned snapshots in data/snapshots by the test suite and by the drift command. A path that stops resolving fails the build.

**43 concepts.** 21 are carried by both protocols, 8 by UCP only, 4 by ACP only, and 10 by neither (those are in schema.org only).

## What it was checked against

| Source | Version | Pinned at | Licence |
| --- | --- | --- | --- |
| ACP product feed schema | spec 2026-04-17, file `spec/2026-04-17/json-schema/schema.feed.json` | [commit 7fdd78d](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol/tree/7fdd78df677a94dce04c770644b0fbbb1401272b) (2026-07-18) | Apache-2.0 |
| UCP shopping types | release v2026-08-25, `Product` and `Variant` plus the files they reference | [commit cd78fb3](https://github.com/Universal-Commerce-Protocol/ucp/tree/cd78fb38e819de77d9b527d110476eccb876f1bd) (tag v2026-08-25, 2026-08-25) | Apache-2.0 |
| schema.org | V30.1, released 2026-09-15 | [commit 5f2d8cd](https://github.com/schemaorg/schemaorg/tree/5f2d8cdec99b7329459ef6584e94b6a840f88471) | CC BY-SA 3.0 |

Notation: `Variant.price.amount` means the `amount` field inside `price` on a Variant. `[]` marks a list. For schema.org, `Offer.price` means the `price` property on the `Offer` class, including properties inherited from its parents.

### Identity

| Concept | ACP | UCP | schema.org | Gap or conversion |
| --- | --- | --- | --- | --- |
| Product id | `Product.id` (required) | `Product.id` (required, a global id (GID)) | `ProductGroup.productGroupID` (only on ProductGroup. A single product with no variants has no group id, so use its @id) | Use productGroupID, else the product's @id. |
| Variant id | `Variant.id` (required, stable and global) | `Variant.id` (required, used as the item id in checkout) | `Product.sku`<br>`Product.productID` | Use sku, else productID, else @id. Never invent one. |
| Merchant SKU | **none** | `Variant.sku` (business-assigned, kept apart from the id) | `Product.sku` | ACP has no separate sku field, so the SKU has to double as Variant.id. |
| URL slug | **none** | `Product.handle`<br>`Variant.handle` | **none** | Only UCP carries a slug. schema.org has no slug property; the slug lives inside the url. |
| Barcodes (GTIN, UPC, EAN) | `Variant.barcodes[].type`<br>`Variant.barcodes[].value` | `Variant.barcodes[].type`<br>`Variant.barcodes[].value` | `Product.gtin`<br>`Product.gtin8`<br>`Product.gtin12`<br>`Product.gtin13`<br>`Product.gtin14` | schema.org names the scheme in the property (gtin13). Both protocols take a type string plus a value, so this tool writes type GTIN, which is never wrong. |
| Manufacturer part number | **none** | **none** | `Product.mpn` | Neither protocol has a part number field. The barcode type is an open string in both, so a custom type is possible but not defined. |

### Text

| Concept | ACP | UCP | schema.org | Gap or conversion |
| --- | --- | --- | --- | --- |
| Title | `Product.title` (optional on the product)<br>`Variant.title` (required on the variant) | `Product.title` (required)<br>`Variant.title` (required, for example Blue / Large) | `Product.name` | A variant title is usually the product name plus its options. |
| Description | `Product.description.plain`<br>`Product.description.html`<br>`Product.description.markdown`<br>`Variant.description.plain` | `Product.description.plain`<br>`Product.description.html`<br>`Product.description.markdown`<br>`Variant.description.plain` | `Product.description` | schema.org holds one text string, which goes into the plain slot. UCP marks description required on both Product and Variant. Both protocols want a description on each variant if you use one. schema.org usually has it only on the product. |
| Canonical page URL | `Product.url`<br>`Variant.url` | `Product.url`<br>`Variant.url` | `Product.url`<br>`Offer.url` |  |

### Media

| Concept | ACP | UCP | schema.org | Gap or conversion |
| --- | --- | --- | --- | --- |
| Images and other media | `Product.media[].url` (first item is the primary listing asset on a variant)<br>`Variant.media[].url` | `Product.media[].url` (first item is the featured media)<br>`Variant.media[].url` | `Product.image` (a URL or an ImageObject) |  |
| Media kind | `Product.media[].type` (image, video or model) | `Product.media[].type` (image, video or model_3d) | **none** | schema.org says the kind through the class (ImageObject, VideoObject). The two protocols also spell the 3D value differently: model in ACP, model_3d in UCP. |
| Alt text | `Product.media[].alt_text` | `Product.media[].alt_text` | `ImageObject.caption` (closest match. A caption is shown to readers, alt text is not, so do not copy one into the other blindly) |  |
| Media width and height in pixels | `Product.media[].width`<br>`Product.media[].height` | `Product.media[].width`<br>`Product.media[].height` | `ImageObject.width`<br>`ImageObject.height` | Both protocols want integer pixels. schema.org allows a Distance or QuantitativeValue, so read the number and check the unit. |

### Price

| Concept | ACP | UCP | schema.org | Gap or conversion |
| --- | --- | --- | --- | --- |
| Selling price | `Variant.price.amount` (integer, ISO 4217 minor units) | `Variant.price.amount` (integer, ISO 4217 minor units) | `Offer.price` (a number or text in major units, for example 19.99) | Multiply into minor units by the currency's exponent: 19.99 USD becomes 1999, 500 JPY stays 500, 1.250 KWD becomes 1250. |
| Currency | `Variant.price.currency` | `Variant.price.currency` | `Offer.priceCurrency` |  |
| List price before discount | `Variant.list_price.amount` | `Variant.list_price.amount` (for strikethrough display) | `Offer.priceSpecification` (a UnitPriceSpecification)<br>`UnitPriceSpecification.priceType` (ListPrice, MSRP or StrikethroughPrice) | schema.org has no list price property. The convention is a second price specification marked with a priceType. |
| Unit price (per 100 ml, per kg) | `Variant.unit_price.amount`<br>`Variant.unit_price.measure.value` (a number)<br>`Variant.unit_price.measure.unit`<br>`Variant.unit_price.reference.value`<br>`Variant.unit_price.reference.unit` | `Variant.unit_price.amount`<br>`Variant.unit_price.measure.value` (an integer, scaled by measure.scale)<br>`Variant.unit_price.measure.unit` (a UN/CEFACT Rec20 code where one fits)<br>`Variant.unit_price.measure.scale`<br>`Variant.unit_price.reference.value`<br>`Variant.unit_price.reference.unit` | `UnitPriceSpecification.referenceQuantity` (the reference amount only)<br>`UnitPriceSpecification.unitCode` | Both protocols also want the pack measure (a 750 ml bottle). schema.org has no slot for it inside the price specification. |
| Price range across variants | **none** | `Product.price_range.min.amount` (required on the product)<br>`Product.price_range.max.amount`<br>`Product.list_price_range.min.amount` | `AggregateOffer.lowPrice`<br>`AggregateOffer.highPrice` | ACP has no product-level range. Agents derive it from the variants. |
| Sale basis (per each, per kg, per hour) | **none** | `Variant.quantity_unit.unit`<br>`Variant.quantity_unit.increment` | `Offer.eligibleQuantity` (partial match)<br>`UnitPriceSpecification.unitCode` | Only UCP states what one unit of quantity means and in what steps it can be ordered. |
| Price expiry date | **none** | **none** | `Offer.priceValidUntil` | Neither protocol has an expiry. Both expect a current price, refreshed by the feed or the live call. |

### Availability

| Concept | ACP | UCP | schema.org | Gap or conversion |
| --- | --- | --- | --- | --- |
| Can it be bought now | `Variant.availability.available` | `Variant.availability.available` | `Offer.availability` (derive the boolean from the status) | true for InStock and LimitedAvailability, false for OutOfStock, SoldOut and Discontinued. Left unset for BackOrder and PreOrder, which is a merchant choice. |
| Availability status | `Variant.availability.status` (in_stock, limited_stock, backorder, preorder, out_of_stock, discontinued) | `Variant.availability.status` (in_stock, backorder, preorder, out_of_stock, discontinued) | `Offer.availability` (twelve ItemAvailability values) | limited_stock exists in ACP only. InStoreOnly, OnlineOnly, MadeToOrder and Reserved have no equivalent in either protocol. |
| Stock quantity | **none** | **none** | `Offer.inventoryLevel` | Neither protocol sends stock counts. Only the status leaves the shop. |

### Condition

| Concept | ACP | UCP | schema.org | Gap or conversion |
| --- | --- | --- | --- | --- |
| Item condition (new, used) | `Variant.condition` (a list of merchant labels, example new) | **none** | `Offer.itemCondition`<br>`Product.itemCondition` | UCP has no condition field, which matters for second-hand and refurbished stock. |

### Categories and labels

| Concept | ACP | UCP | schema.org | Gap or conversion |
| --- | --- | --- | --- | --- |
| Category | `Variant.categories[].value` (on the variant only, the ACP Product has no categories)<br>`Variant.categories[].taxonomy` | `Product.categories[].value`<br>`Product.categories[].taxonomy`<br>`Variant.categories[].value` | `Product.category` (text, a URL or a Thing. Usually a Google product category path or id) | Both protocols name the taxonomy: google_product_category, shopify or merchant. A bare category in schema.org does not say which, so the tool leaves the taxonomy out. |
| Tags and keywords | **none** | `Product.tags`<br>`Variant.tags` | `Product.keywords` | ACP has no tags field. |
| Custom attributes | **none** | `Product.metadata`<br>`Variant.metadata` | `Product.additionalProperty` (a list of PropertyValue) | ACP has no extension bag on the feed Product. UCP's metadata is the only place for data such as material or origin. |

### Variants and options

| Concept | ACP | UCP | schema.org | Gap or conversion |
| --- | --- | --- | --- | --- |
| Variants grouped under a product | `Product.variants` (required) | `Product.variants` (required, the first is the featured variant) | `ProductGroup.hasVariant`<br>`Product.isVariantOf`<br>`Product.inProductGroupWithID` | A ProductGroup with hasVariant maps one to one. A lone Product becomes a product with one variant. |
| Which option values this variant has | `Variant.variant_options[].name`<br>`Variant.variant_options[].value` | `Variant.options[].name`<br>`Variant.options[].label` (called label, not value)<br>`Variant.options[].id` | `ProductGroup.variesBy`<br>`Product.color`<br>`Product.size`<br>`Product.material`<br>`Product.pattern` | Read the names in variesBy, then read the matching property on each variant. |
| The full menu of option choices | **none** | `Product.options[].name`<br>`Product.options[].values[].label` | `ProductGroup.variesBy` (names only. The values sit on each variant) | ACP lists options per variant only. |

### Seller

| Concept | ACP | UCP | schema.org | Gap or conversion |
| --- | --- | --- | --- | --- |
| Seller name | `Variant.seller.name` | `Variant.seller.name` | `Offer.seller`<br>`Organization.name` |  |
| Policy links (returns, shipping, privacy, terms) | `Variant.seller.links[].type` (privacy_policy, terms_of_service, refund_policy, shipping_policy, faq)<br>`Variant.seller.links[].url` | `Variant.seller.links[].type` (same five well-known types)<br>`Variant.seller.links[].url` | `Offer.hasMerchantReturnPolicy`<br>`MerchantReturnPolicy.merchantReturnLink` (returns only) | schema.org covers returns well and shipping through a different object. The protocols want one link per policy type. |
| Marketplace the offer is listed on | `Variant.marketplace.name` | **none** | **none** | Only ACP has a marketplace field. schema.org has no direct equivalent. |

### Ratings

| Concept | ACP | UCP | schema.org | Gap or conversion |
| --- | --- | --- | --- | --- |
| Aggregate rating | **none** | `Product.rating.value`<br>`Product.rating.scale_min`<br>`Product.rating.scale_max`<br>`Product.rating.count`<br>`Variant.rating.value` | `Product.aggregateRating`<br>`AggregateRating.ratingCount`<br>`Rating.ratingValue`<br>`Rating.bestRating`<br>`Rating.worstRating` | ratingValue maps to value, bestRating to scale_max, worstRating to scale_min, ratingCount to count. ACP carries no rating in the feed. |

### Feed level

| Concept | ACP | UCP | schema.org | Gap or conversion |
| --- | --- | --- | --- | --- |
| Target country of the feed | `FeedMetadata.target_country` (on the feed, not on a product) | **none** | `Offer.eligibleRegion` (closest match, per offer) | UCP has no such field on the Product and Variant types. |
| Feed id and last update time | `FeedMetadata.id`<br>`FeedMetadata.updated_at` | **none** | **none** | ACP keeps catalog state on an agent-hosted feed that the merchant pushes to. UCP has no feed object on these types, and schema.org has no equivalent. |

### In schema.org, carried by neither protocol

| Concept | ACP | UCP | schema.org | Gap or conversion |
| --- | --- | --- | --- | --- |
| Brand | **none** | **none** | `Product.brand` | Neither Product nor Variant has a brand field. In UCP the only places are tags and metadata. |
| Shipping details | **none** | **none** | `Offer.shippingDetails` | Shipping belongs to the checkout and fulfilment flows in both protocols. It is not a catalog field. |
| Country of origin | **none** | **none** | `Product.countryOfOrigin` | Matters to exporters and wholesalers. No slot in either catalog object. |
| Weight and dimensions | **none** | **none** | `Product.weight`<br>`Product.width`<br>`Product.height`<br>`Product.depth` | No slot in either catalog object. |
| Material and certifications | **none** | **none** | `Product.material`<br>`Product.hasCertification` | Material can travel as a variant option in both protocols. Certifications have no slot. |
| Individual reviews | **none** | **none** | `Product.review` | UCP carries the aggregate only. ACP carries neither. |
| Related and accessory products | **none** | **none** | `Product.isRelatedTo`<br>`Product.isAccessoryOrSparePartFor` | No slot in either catalog object. |

## Reading the table

- **none** in a protocol column means the Product and Variant objects have no field for it. It does not mean the protocol cannot carry the idea somewhere else, for example in checkout.
- Conversions are written in the last column. `agent-commerce-map convert` applies them and checks the result against the pinned schemas.
- The ACP schema sets `additionalProperties: false` on these objects, so an extra field such as `brand` is rejected, not ignored. UCP's `metadata` and `tags` are the only open slots.
- Fields in the unreleased ACP spec are tracked by `agent-commerce-map drift`, not by this table, until they ship in a dated release.
