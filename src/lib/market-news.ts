import { query } from "@/lib/db";
import {
  deriveMarketBrief,
  MARKET_BRIEF_SCHEMA_VERSION,
  type MarketBriefContent,
  type MarketPriceSnapshot,
} from "@/lib/market-news-model";

const MARKET_SOURCE = "scryfall";

type DateRow = {
  latest_date: string | null;
  comparison_7d_date: string | null;
  comparison_30d_date: string | null;
};

type PublicationDateRow = {
  market_data_date: string;
};

type SnapshotRow = {
  card_id: string;
  name: string;
  set_code: string;
  set_name: string;
  current_price: string;
  price_7d: string | null;
  price_30d: string | null;
};

type BriefRow = {
  id: string;
  market_data_date: string;
  schema_version: number;
  source: string;
  comparison_7d_date: string | null;
  comparison_30d_date: string | null;
  content: MarketBriefContent;
  published_at: string;
};

export type MarketBrief = {
  id: string;
  marketDataDate: string;
  schemaVersion: number;
  source: string;
  comparison7dDate: string | null;
  comparison30dDate: string | null;
  content: MarketBriefContent;
  publishedAt: string;
};

export type MarketBriefSummary = {
  id: string;
  marketDataDate: string;
  schemaVersion: number;
  source: string;
  publishedAt: string;
  coverage: MarketBriefContent["coverage"];
  breadth: MarketBriefContent["breadth"];
  categoryCounts: {
    strongGrowth: number;
    recoveryOpportunities: number;
    lostMomentum: number;
    majorRepricing: number;
  };
};

const mapBrief = (row: BriefRow): MarketBrief => ({
  id: row.id,
  marketDataDate: row.market_data_date,
  schemaVersion: row.schema_version,
  source: row.source,
  comparison7dDate: row.comparison_7d_date,
  comparison30dDate: row.comparison_30d_date,
  content: row.content,
  publishedAt: row.published_at,
});

const summarizeBrief = (brief: MarketBrief): MarketBriefSummary => ({
  id: brief.id,
  marketDataDate: brief.marketDataDate,
  schemaVersion: brief.schemaVersion,
  source: brief.source,
  publishedAt: brief.publishedAt,
  coverage: brief.content.coverage,
  breadth: brief.content.breadth,
  categoryCounts: {
    strongGrowth: brief.content.categories.strongGrowth.length,
    recoveryOpportunities:
      brief.content.categories.recoveryOpportunities.length,
    lostMomentum: brief.content.categories.lostMomentum.length,
    majorRepricing: brief.content.categories.majorRepricing.length,
  },
});

async function getNewestMarketDates(): Promise<DateRow> {
  const { rows } = await query<DateRow>(
    `
      with latest as (
        select max(date) as latest_date
        from prices
        where source = $1 and eur is not null
      )
      select
        latest_date::text,
        (
          select max(date)::text from prices
          where source in ($1, 'mtgjson') and eur is not null
            and date <= latest_date - 7
        ) as comparison_7d_date,
        (
          select max(date)::text from prices
          where source in ($1, 'mtgjson') and eur is not null
            and date <= latest_date - 30
        ) as comparison_30d_date
      from latest
    `,
    [MARKET_SOURCE],
  );

  return rows[0] ?? {
    latest_date: null,
    comparison_7d_date: null,
    comparison_30d_date: null,
  };
}

async function getMarketDates(marketDataDate: string): Promise<DateRow> {
  const { rows } = await query<DateRow>(
    `
      select
        $2::date::text as latest_date,
        (
          select max(date)::text from prices
          where source in ($1, 'mtgjson') and eur is not null
            and date <= $2::date - 7
        ) as comparison_7d_date,
        (
          select max(date)::text from prices
          where source in ($1, 'mtgjson') and eur is not null
            and date <= $2::date - 30
        ) as comparison_30d_date
    `,
    [MARKET_SOURCE, marketDataDate],
  );
  return rows[0];
}

async function getUnpublishedMarketDates(limit: number) {
  const { rows } = await query<PublicationDateRow>(
    `
      select distinct prices.date::text as market_data_date
      from prices
      where prices.source = $1
        and prices.eur is not null
        and prices.date > coalesce(
          (select max(market_data_date) from market_briefs),
          (select max(date) - 1 from prices where source = $1 and eur is not null)
        )
        and not exists (
          select 1 from market_briefs
          where market_briefs.market_data_date = prices.date
        )
      order by market_data_date asc
      limit $2
    `,
    [MARKET_SOURCE, limit],
  );
  return rows.map((row) => row.market_data_date);
}

async function loadSnapshots(dates: DateRow): Promise<MarketPriceSnapshot[]> {
  if (!dates.latest_date) return [];

  const { rows } = await query<SnapshotRow>(
    `
      select
        c.scryfall_id::text as card_id,
        c.name,
        c.set_code,
        c.set_name,
        current_price.eur::text as current_price,
        seven_day.eur::text as price_7d,
        thirty_day.eur::text as price_30d
      from prices current_price
      join cards c on c.scryfall_id = current_price.scryfall_id
      left join lateral (
        select historical.eur
        from prices historical
        where historical.scryfall_id = current_price.scryfall_id
          and historical.date = $3::date
          and historical.source in ('scryfall', 'mtgjson')
          and historical.eur is not null
        order by case historical.source when 'scryfall' then 0 else 1 end
        limit 1
      ) seven_day on true
      left join lateral (
        select historical.eur
        from prices historical
        where historical.scryfall_id = current_price.scryfall_id
          and historical.date = $4::date
          and historical.source in ('scryfall', 'mtgjson')
          and historical.eur is not null
        order by case historical.source when 'scryfall' then 0 else 1 end
        limit 1
      ) thirty_day on true
      where current_price.source = $1
        and current_price.date = $2::date
        and current_price.eur between 2 and 5000
      order by c.scryfall_id
    `,
    [
      MARKET_SOURCE,
      dates.latest_date,
      dates.comparison_7d_date,
      dates.comparison_30d_date,
    ],
  );

  return rows.map((row) => ({
    cardId: row.card_id,
    name: row.name,
    setCode: row.set_code,
    setName: row.set_name,
    currentPrice: Number(row.current_price),
    price7d: row.price_7d === null ? null : Number(row.price_7d),
    price30d: row.price_30d === null ? null : Number(row.price_30d),
  }));
}

async function findBriefByDate(
  marketDataDate: string,
): Promise<MarketBrief | null> {
  const { rows } = await query<BriefRow>(
    `
      select
        id::text, market_data_date::text, schema_version, source,
        comparison_7d_date::text, comparison_30d_date::text,
        content, published_at::text
      from market_briefs
      where market_data_date = $1::date
    `,
    [marketDataDate],
  );
  return rows[0] ? mapBrief(rows[0]) : null;
}

async function materializeMarketBrief(dates: DateRow): Promise<MarketBrief | null> {
  if (!dates.latest_date) return null;

  const existing = await findBriefByDate(dates.latest_date);
  if (existing) return existing;

  const content = deriveMarketBrief({
    marketDataDate: dates.latest_date,
    comparison7dDate: dates.comparison_7d_date,
    comparison30dDate: dates.comparison_30d_date,
    cards: await loadSnapshots(dates),
  });

  await query(
    `
      insert into market_briefs (
        market_data_date, schema_version, source,
        comparison_7d_date, comparison_30d_date, content
      )
      values ($1::date, $2, $3, $4::date, $5::date, $6::jsonb)
      on conflict (market_data_date) do nothing
    `,
    [
      dates.latest_date,
      MARKET_BRIEF_SCHEMA_VERSION,
      MARKET_SOURCE,
      dates.comparison_7d_date,
      dates.comparison_30d_date,
      JSON.stringify(content),
    ],
  );

  return findBriefByDate(dates.latest_date);
}

export async function materializeLatestMarketBrief(): Promise<MarketBrief | null> {
  return materializeMarketBrief(await getNewestMarketDates());
}

export async function materializeMissingMarketBriefs(limit = 31) {
  const dates = await getUnpublishedMarketDates(
    Math.min(Math.max(Math.trunc(limit), 1), 366),
  );
  const briefs: MarketBrief[] = [];
  for (const marketDataDate of dates) {
    const brief = await materializeMarketBrief(await getMarketDates(marketDataDate));
    if (brief) briefs.push(brief);
  }
  return briefs;
}

export async function listMarketBriefs(limit = 30) {
  const materialized = await materializeMissingMarketBriefs();
  const latest = materialized.at(-1) ?? await materializeLatestMarketBrief();
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const { rows } = await query<BriefRow>(
    `
      select
        id::text, market_data_date::text, schema_version, source,
        comparison_7d_date::text, comparison_30d_date::text,
        content, published_at::text
      from market_briefs
      order by market_data_date desc
      limit $1
    `,
    [safeLimit],
  );

  return {
    latestMarketDataDate: latest?.marketDataDate ?? null,
    briefs: rows.map(mapBrief).map(summarizeBrief),
  };
}

export async function getMarketBrief(marketDataDate: string) {
  const latest = await materializeLatestMarketBrief();
  if (latest?.marketDataDate === marketDataDate) return latest;
  return findBriefByDate(marketDataDate);
}
