-- The first Scryfall briefs were published without 7D/30D comparison rows
-- because Scryfall history only started on 2026-09-12. Remove those derived
-- rows once so the corrected cross-source comparison can rebuild them.
drop trigger if exists market_briefs_immutable on market_briefs;

delete from market_briefs
where source = 'scryfall';

create trigger market_briefs_immutable
before update or delete on market_briefs
for each row execute function prevent_market_brief_mutation();
