// The pinned sources every row of the crosswalk was checked against.
// "pinned" is what data/snapshots holds. "next" is what `drift` compares against.
export const READ_DATE = '2026-09-30';

export const SOURCES = {
  acp: {
    name: 'Agentic Commerce Protocol (ACP) feed schema',
    repo: 'agentic-commerce-protocol/agentic-commerce-protocol',
    licence: 'Apache-2.0',
    status: 'beta (README badge), maintained by OpenAI and Stripe per README; MAINTAINERS.md also lists Meta',
    pinned: {
      label: 'spec 2026-04-17',
      ref: '7fdd78df677a94dce04c770644b0fbbb1401272b',
      refDate: '2026-07-18',
      file: 'spec/2026-04-17/json-schema/schema.feed.json'
    },
    next: {
      label: 'spec unreleased (main)',
      ref: 'main',
      file: 'spec/unreleased/json-schema/schema.feed.json'
    }
  },
  ucp: {
    name: 'Universal Commerce Protocol (UCP) shopping types',
    repo: 'Universal-Commerce-Protocol/ucp',
    licence: 'Apache-2.0',
    status: 'versioned by date; latest release tag v2026-08-25',
    pinned: {
      label: 'release v2026-08-25',
      ref: 'cd78fb38e819de77d9b527d110476eccb876f1bd',
      tag: 'v2026-08-25',
      refDate: '2026-08-25',
      root: 'source/schemas/',
      files: ['shopping/types/product.json', 'shopping/types/variant.json']
    },
    next: {
      label: 'main',
      ref: 'main',
      root: 'source/schemas/',
      files: ['shopping/types/product.json', 'shopping/types/variant.json']
    }
  },
  schemaorg: {
    name: 'schema.org vocabulary',
    licence: 'CC BY-SA 3.0',
    status: 'versioned releases; V30.1 released 2026-09-15',
    pinned: {
      label: 'V30.1',
      ref: '5f2d8cdec99b7329459ef6584e94b6a840f88471',
      refDate: '2026-09-15',
      url: 'https://schema.org/version/30.1/schemaorg-current-https.jsonld'
    },
    next: {
      label: 'latest',
      url: 'https://schema.org/version/latest/schemaorg-current-https.jsonld'
    }
  }
};

// schema.org classes the crosswalk uses. Only these are kept in the snapshot.
export const SCHEMAORG_CLASSES = [
  'Thing', 'Intangible', 'StructuredValue', 'CreativeWork', 'MediaObject', 'ImageObject',
  'Product', 'ProductGroup', 'ProductModel', 'Offer', 'AggregateOffer', 'Demand',
  'PriceSpecification', 'UnitPriceSpecification', 'QuantitativeValue', 'PropertyValue',
  'Rating', 'AggregateRating', 'Brand', 'Organization', 'MerchantReturnPolicy',
  'OfferShippingDetails', 'DefinedTerm'
];
export const SCHEMAORG_ENUMS = ['ItemAvailability', 'OfferItemCondition', 'PriceTypeEnumeration'];

export function rawUrl(repo, ref, path) {
  return `https://raw.githubusercontent.com/${repo}/${ref}/${path}`;
}
