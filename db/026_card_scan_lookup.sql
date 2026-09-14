create index if not exists idx_cards_scan_print_lookup
  on cards (
    lang,
    lower(set_code),
    lower(regexp_replace(collector_number, '[^a-zA-Z0-9★*+/-]', '', 'g'))
  );

comment on index idx_cards_scan_print_lookup is
  'Supports private client-side OCR matching by printed language, set, and collector number.';
