import "server-only";

import { db, query } from "@/lib/db";
import type {
  ConfirmedPortfolioImportRow,
  PortfolioImportRow,
} from "@/lib/portfolio-import-model";

export type PortfolioImportCandidate = {
  id: string;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  imageUrl: string | null;
};

export type ResolvedPortfolioImportRow = PortfolioImportRow & {
  status: "matched" | "ambiguous" | "unmatched";
  candidates: PortfolioImportCandidate[];
  existing: boolean;
};

type CandidateRow = {
  input_row: number;
  id: string | null;
  name: string | null;
  set_code: string | null;
  set_name: string | null;
  collector_number: string | null;
  image_url: string | null;
  candidate_count: number;
  existing: boolean;
};

export async function resolvePortfolioImport(
  userId: string,
  rows: PortfolioImportRow[],
): Promise<ResolvedPortfolioImportRow[]> {
  const payload = rows.map((row) => ({
    input_row: row.row,
    name: row.name,
    set_code: row.setCode ?? null,
    collector_number: row.collectorNumber ?? null,
  }));
  const result = await query<CandidateRow>(
    `
      with input as (
        select *
        from jsonb_to_recordset($2::jsonb) as value(
          input_row integer,
          name text,
          set_code text,
          collector_number text
        )
      )
      select
        input.input_row,
        candidate.id,
        candidate.name,
        candidate.set_code,
        candidate.set_name,
        candidate.collector_number,
        candidate.image_url,
        coalesce(candidate.candidate_count, 0)::integer as candidate_count,
        coalesce(candidate.existing, false) as existing
      from input
      left join lateral (
        select
          c.scryfall_id::text as id,
          c.name,
          c.set_code,
          c.set_name,
          c.collector_number,
          coalesce(c.image_url, c.image_uris->>'normal') as image_url,
          count(*) over ()::integer as candidate_count,
          exists (
            select 1 from app_portfolio_items item
            where item.user_id = $1 and item.scryfall_id = c.scryfall_id
          ) as existing
        from cards c
        where lower(c.name) = lower(input.name)
          and (
            input.set_code is null
            or lower(c.set_code) = lower(input.set_code)
          )
          and (
            input.collector_number is null
            or lower(c.collector_number) = lower(input.collector_number)
          )
        order by
          case when lower(c.lang) = 'en' then 0 else 1 end,
          c.released_at desc nulls last,
          c.set_code,
          c.collector_number,
          c.scryfall_id
        limit 8
      ) candidate on true
      order by input.input_row, candidate.id
    `,
    [userId, JSON.stringify(payload)],
  );

  const candidates = new Map<number, CandidateRow[]>();
  result.rows.forEach((candidate) => {
    if (!candidate.id) return;
    const current = candidates.get(candidate.input_row) ?? [];
    current.push(candidate);
    candidates.set(candidate.input_row, current);
  });

  return rows.map((row) => {
    const matching = candidates.get(row.row) ?? [];
    const candidateCount = matching[0]?.candidate_count ?? 0;
    return {
      ...row,
      status:
        candidateCount === 0
          ? "unmatched"
          : candidateCount === 1
            ? "matched"
            : "ambiguous",
      existing: matching.some((candidate) => candidate.existing),
      candidates: matching.map((candidate) => ({
        id: candidate.id!,
        name: candidate.name!,
        setCode: candidate.set_code!,
        setName: candidate.set_name!,
        collectorNumber: candidate.collector_number!,
        imageUrl: candidate.image_url,
      })),
    };
  });
}

export async function importPortfolioItems(
  userId: string,
  rows: ConfirmedPortfolioImportRow[],
  existingStrategy: "add" | "skip",
) {
  const client = await db.connect();
  try {
    await client.query("begin");
    const cardIds = [...new Set(rows.map((row) => row.cardId))];
    const cards = await client.query<{ id: string }>(
      `select scryfall_id::text as id from cards where scryfall_id = any($1::uuid[])`,
      [cardIds],
    );
    if (cards.rowCount !== cardIds.length) {
      throw new Error("One or more cards no longer exist");
    }

    let inserted = 0;
    let skipped = 0;
    for (const row of rows) {
      const result = await client.query(
        `
          insert into app_portfolio_items (
            user_id, scryfall_id, quantity, purchase_price_eur,
            condition, language, acquired_at
          )
          select $1, $2, $3, $4, $5, $6, coalesce($7::date, current_date)
          where $8::text = 'add'
            or not exists (
              select 1 from app_portfolio_items
              where user_id = $1 and scryfall_id = $2
            )
          returning id
        `,
        [
          userId,
          row.cardId,
          row.quantity,
          row.purchasePrice,
          row.condition,
          row.language,
          row.acquiredAt ?? null,
          existingStrategy,
        ],
      );
      if (result.rowCount === 1) inserted += 1;
      else skipped += 1;
    }
    await client.query("commit");
    return { inserted, skipped };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
