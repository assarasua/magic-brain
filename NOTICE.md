# Notices and data attribution

Magic Brain was created by
[Asier Sarasua at BizkardoLab](https://bizkardolab.com).

Magic Brain source code is licensed under AGPL-3.0-only. That license does not
grant rights to third-party card data, prices, artwork, trademarks, or service
content. No third-party dataset is included in this repository.

## Data and services

- **Scryfall** identifiers, metadata, images, and API/bulk data are subject to
  Scryfall's current data guidelines, terms, and the rights of their original
  owners. Scryfall requests attribution and is not produced by or endorsed by
  Wizards of the Coast. Review <https://scryfall.com/docs/api> and
  <https://scryfall.com/docs/api/bulk-data> before use. Card images and other
  copyrighted material are not made free by bulk-data licensing.
- **MTGJSON** datasets have their own license, attribution, and upstream-source
  restrictions. Review the license shipped with the exact MTGJSON release and
  <https://mtgjson.com/license/>. The database `source = 'mtgjson'` label is
  provenance, not a redistribution grant.
- **Wizards of the Coast / Magic: The Gathering** names, rules text, symbols,
  art, and related intellectual property belong to Wizards and/or their
  respective owners. Magic Brain is unofficial and is not affiliated with,
  endorsed, sponsored, or approved by Wizards of the Coast.
- **Cardmarket** names, IDs, links, and market-derived information may be
  subject to Cardmarket API, affiliate, and marketplace terms. Do not scrape,
  republish, sublicense, or expose Cardmarket-derived prices without confirming
  your rights. Review <https://www.cardmarket.com/en/Magic/Policies>.

## Redistribution boundary

The empty schema in `db/000_base_data_schema.sql` and import guidance are part
of the software. Populated databases, exports, cached responses, artwork, and
price history are not covered by the software license merely because they use
that schema. Operators and contributors must:

1. obtain data through an authorized source and comply with its rate limits;
2. retain source, observation date, currency, and finish provenance;
3. avoid committing or publishing raw datasets unless their license expressly
   permits it; and
4. independently assess database rights, copyright, trademark, contract, and
   consumer-law obligations in every relevant jurisdiction.

Product and company names are used only for identification. All trademarks
remain property of their respective owners.

## OCR components

- **Tesseract.js 6.0.1** and **tesseract.js-core 6.1.2** are distributed under
  Apache-2.0. The `@tesseract.js-data/eng` and `@tesseract.js-data/spa` 1.0.0
  packages are MIT licensed. Magic Brain self-hosts their pinned
  `4.0.0_best_int` traineddata files; source URLs and SHA-256 digests are
  recorded in `scripts/sync-ocr-models.mjs`.
- `card-title-corrector-v1` is a Magic Brain-produced weighted
  character-sequence correction model. It is trained from distinct English and
  Spanish names in the operator's imported catalog plus deterministic synthetic
  OCR corruptions. It contains no card images. Catalog operators remain
  responsible for ensuring they may derive and deploy title metadata from their
  configured source.
