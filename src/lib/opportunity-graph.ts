import { query } from "@/lib/db";
import {
  buildOpportunityGraph,
  type OpportunityGraphCandidate,
} from "@/lib/opportunity-graph-model";

type OpportunityRow = {
  id: string;
  name: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  type_line: string | null;
  image_url: string | null;
  price: string;
  change_7d: string;
  change_30d: string;
  is_reserved: boolean;
  search_rank: number;
  latest_date: string;
};

export async function getOpportunityGraph(options: {
  limit: number;
  search?: string;
  focusId?: string;
}) {
  const search = options.search?.trim().toLowerCase() || null;
  const focusId = options.focusId || null;
  const { rows } = await query<OpportunityRow>(
    `
      with dates as (
        select max(date) as latest_date
        from prices
        where source = 'mtgjson'
      ),
      priced as (
        select
          c.scryfall_id::text as id,
          c.name,
          c.set_code,
          c.set_name,
          c.collector_number,
          c.rarity,
          c.type_line,
          coalesce(c.image_url, c.image_uris->>'normal') as image_url,
          latest.eur as price,
          ((latest.eur - week_price.eur) / week_price.eur) * 100 as change_7d,
          ((latest.eur - month_price.eur) / month_price.eur) * 100 as change_30d,
          exists (
            select 1
            from app_reserved_cards reserved
            where reserved.oracle_id = c.oracle_id
          ) as is_reserved,
          case
            when c.scryfall_id::text = $3 then 0
            when $2::text is not null and lower(c.name) = $2 then 1
            when $2::text is not null and lower(c.name) like $2 || '%' then 2
            when $2::text is not null and (
              lower(c.name) like '%' || $2 || '%'
              or lower(c.set_name) like '%' || $2 || '%'
              or lower(c.set_code) = $2
            ) then 3
            else 4
          end as search_rank,
          dates.latest_date::text
        from cards c
        cross join dates
        join prices latest
          on latest.scryfall_id = c.scryfall_id
          and latest.source = 'mtgjson'
          and latest.date = dates.latest_date
          and latest.eur between 2 and 5000
        join lateral (
          select historical.eur
          from prices historical
          where historical.scryfall_id = c.scryfall_id
            and historical.source = 'mtgjson'
            and historical.date <= dates.latest_date - 7
            and historical.eur >= 2
          order by historical.date desc
          limit 1
        ) week_price on true
        join lateral (
          select historical.eur
          from prices historical
          where historical.scryfall_id = c.scryfall_id
            and historical.source = 'mtgjson'
            and historical.date <= dates.latest_date - 30
            and historical.eur >= 2
          order by historical.date desc
          limit 1
        ) month_price on true
        where coalesce(c.image_url, c.image_uris->>'normal') is not null
      ),
      classified as (
        select
          priced.*,
          case
            when abs(change_7d) <= 2.5 and abs(change_30d) <= 7.5
              then 'stable_value'
            when change_7d > 0.75 and change_30d > 1.5
              then 'strong_growth'
            when change_7d > 0.75 and change_30d <= 1.5
              then 'recovery_opportunity'
            else 'lost_momentum'
          end as classification
        from priced
        where change_7d between -80 and 200
          and change_30d between -80 and 300
      ),
      ranked as (
        select
          classified.*,
          row_number() over (
            partition by classification
            order by
              search_rank,
              (abs(change_30d) + abs(change_7d)) desc,
              name asc,
              id asc
          ) as cluster_rank
        from classified
      )
      select *
      from ranked
      where cluster_rank <= ceil($1::numeric / 4)
      order by
        search_rank,
        cluster_rank,
        classification,
        id
      limit $1
    `,
    [options.limit, search, focusId],
  );

  const candidates: OpportunityGraphCandidate[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    setCode: row.set_code,
    setName: row.set_name,
    collectorNumber: row.collector_number,
    rarity: row.rarity,
    typeLine: row.type_line ?? "Unknown type",
    imageUrl: row.image_url,
    price: Number(row.price),
    change7d: Number(row.change_7d),
    change30d: Number(row.change_30d),
    reserved: row.is_reserved,
  }));
  const graph = buildOpportunityGraph(candidates);
  const focused =
    rows.find((row) => row.search_rank < 4 && graph.nodes.some((node) => node.id === row.id))
      ?.id ?? null;

  return {
    ...graph,
    focusId: focused,
    asOf: rows[0]?.latest_date ?? null,
    methodology: {
      maximumNodes: options.limit,
      neighboursPerNode: 3,
      similarityWeights: {
        opportunity: 0.32,
        momentum: 0.24,
        risk: 0.18,
        rarity: 0.1,
        type: 0.1,
        set: 0.06,
      },
    },
  };
}
