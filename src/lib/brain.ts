import { query } from "@/lib/db";

export type BrainPreferences = {
  budget: number;
  risk: "preservation" | "conservative" | "balanced" | "growth" | "aggressive";
  horizon: "short" | "medium" | "long";
  strategy: "diversified" | "momentum" | "stability" | "collectible";
  marketTrend: "any" | "rising" | "stable" | "recovering";
  releaseEra: "any" | "classic" | "established" | "recent";
  colors: string[];
  rarities: string[];
  cardTypes: string[];
  maxCardPrice: number;
  positions: number;
  reservedOnly: boolean;
  locale: "en" | "es";
};

type CandidateRow = {
  id: string;
  name: string;
  set_code: string;
  set_name: string;
  image_url: string | null;
  rarity: string;
  type_line: string;
  price: string;
  return_7d: string;
  return_30d: string;
  released_at: string;
  is_reserved: boolean;
};

export type BrainRecommendation = {
  cardId: string;
  name: string;
  setCode: string;
  setName: string;
  imageUrl: string | null;
  rarity: string;
  typeLine: string;
  price: number;
  change7d: number;
  change30d: number;
  quantity: number;
  allocation: number;
  score: number;
  rationale: string;
  buyerTips: string[];
};

const rationaleFor = (
  locale: "en" | "es",
  risk: BrainPreferences["risk"],
  strategy: BrainPreferences["strategy"],
  change7d: number,
  change30d: number,
) => {
  const momentum = change30d >= 0 ? "positive" : "recovering";
  if (locale === "es") {
    const profile = {
      preservation: "preservación de capital y baja volatilidad",
      conservative: "estabilidad ajustada al riesgo",
      balanced: "equilibrio entre tendencia y estabilidad",
      growth: "crecimiento con impulso controlado",
      aggressive: "fuerte impulso de precio",
    }[risk];
    return `${profile}; enfoque ${strategy}; movimiento de ${change7d >= 0 ? "+" : ""}${change7d.toFixed(1)}% en 7 días y ${change30d >= 0 ? "+" : ""}${change30d.toFixed(1)}% en 30 días.`;
  }

  const profile = {
    preservation: "capital preservation and low volatility",
    conservative: "risk-adjusted price stability",
    balanced: "balanced momentum and stability",
    growth: "growth with controlled momentum",
    aggressive: "strong price momentum",
  }[risk];
  return `${profile}; ${strategy} approach; ${change7d >= 0 ? "+" : ""}${change7d.toFixed(1)}% over 7 days and ${change30d >= 0 ? "+" : ""}${change30d.toFixed(1)}% over 30 days (${momentum} trend).`;
};

const buyerTipsFor = (
  locale: "en" | "es",
  price: number,
  change7d: number,
  change30d: number,
  quantity: number,
  horizon: BrainPreferences["horizon"],
) => {
  const stretched = change7d >= 12 || change30d >= 30;
  const recovering = change7d > 0 && change30d < 0;
  const entry = stretched
    ? locale === "es"
      ? `Evita perseguir la subida: empieza cerca de ${price.toFixed(2)} € y reserva capital para una corrección.`
      : `Avoid chasing the move: start near €${price.toFixed(2)} and reserve capital for a pullback.`
    : recovering
      ? locale === "es"
        ? `La recuperación aún necesita confirmación; usa una orden limitada cerca de ${price.toFixed(2)} €.`
        : `The recovery still needs confirmation; use a limit order near €${price.toFixed(2)}.`
      : locale === "es"
        ? `Usa ${price.toFixed(2)} € como referencia y compara el coste total entre vendedores antes de comprar.`
        : `Use €${price.toFixed(2)} as your reference and compare total seller costs before buying.`;
  const execution = quantity > 1
    ? locale === "es"
      ? `Divide las ${quantity} copias en al menos dos compras para reducir el riesgo del precio de entrada.`
      : `Split the ${quantity} copies across at least two purchases to reduce entry-price risk.`
    : locale === "es"
      ? "Prioriza Near Mint, idioma líquido y una edición fácil de revender."
      : "Prioritise Near Mint condition, a liquid language, and an edition that is easy to resell.";
  const monitoring = locale === "es"
    ? `Configura una alerta y revisa la tesis en horizonte ${horizon === "short" ? "corto" : horizon === "long" ? "largo" : "medio"}; no compres solo por el rendimiento pasado.`
    : `Set a price alert and review the thesis on a ${horizon}-term horizon; do not buy on past performance alone.`;

  return [entry, execution, monitoring];
};

export async function generateBrainPortfolio(
  userId: string,
  preferences: BrainPreferences,
  isProUser: boolean,
) {
  const conditions = [
    "priced.price >= $2",
    "priced.price <= $1",
    "priced.return_7d between -30 and $3",
    "priced.return_30d between -40 and $4",
  ];
  const minimumPrice = {
    preservation: 20,
    conservative: 10,
    balanced: 5,
    growth: 3,
    aggressive: 2,
  }[preferences.risk];
  const maximum7dMove = {
    preservation: 20,
    conservative: 35,
    balanced: 65,
    growth: 90,
    aggressive: 120,
  }[preferences.risk];
  const maximum30dMove = {
    preservation: 35,
    conservative: 55,
    balanced: 110,
    growth: 150,
    aggressive: 200,
  }[preferences.risk];
  const values: unknown[] = [
    Math.min(preferences.maxCardPrice, preferences.budget * 0.45),
    minimumPrice,
    maximum7dMove,
    maximum30dMove,
  ];

  if (preferences.colors.length) {
    values.push(preferences.colors);
    conditions.push(`priced.color_identity && $${values.length}::text[]`);
  }
  if (preferences.rarities.length) {
    values.push(preferences.rarities);
    conditions.push(`priced.rarity = any($${values.length}::text[])`);
  }
  if (preferences.cardTypes.length) {
    values.push(preferences.cardTypes.map((type) => `%${type}%`));
    conditions.push(`priced.type_line ilike any($${values.length}::text[])`);
  }
  if (preferences.reservedOnly) {
    conditions.push(
      `exists (select 1 from app_reserved_cards reserved where reserved.oracle_id = priced.oracle_id)`,
    );
  }
  if (preferences.marketTrend === "rising") {
    conditions.push("priced.return_7d > 0 and priced.return_30d > 0");
  } else if (preferences.marketTrend === "stable") {
    conditions.push("abs(priced.return_7d) <= 8 and abs(priced.return_30d) <= 20");
  } else if (preferences.marketTrend === "recovering") {
    conditions.push("priced.return_7d > 0 and priced.return_30d < 0");
  }
  if (preferences.releaseEra === "classic") {
    conditions.push("priced.released_at < date '2004-01-01'");
  } else if (preferences.releaseEra === "established") {
    conditions.push("priced.released_at between date '2004-01-01' and date '2018-12-31'");
  } else if (preferences.releaseEra === "recent") {
    conditions.push("priced.released_at >= date '2019-01-01'");
  }

  const { rows } = await query<CandidateRow>(
    `
      with dates as (
        select max(date) as latest_date from prices where source = 'mtgjson'
      ),
      priced as (
        select
          c.scryfall_id::text as id,
          c.name,
          c.set_code,
          c.set_name,
          coalesce(c.image_url, c.image_uris->>'normal') as image_url,
          c.rarity,
          c.type_line,
          c.color_identity,
          c.oracle_id,
          c.released_at,
          exists (
            select 1 from app_reserved_cards reserved
            where reserved.oracle_id = c.oracle_id
          ) as is_reserved,
          current_price.eur as price,
          ((current_price.eur - price_7d.eur) / price_7d.eur) * 100 as return_7d,
          ((current_price.eur - price_30d.eur) / price_30d.eur) * 100 as return_30d
        from cards c
        cross join dates
        join prices current_price
          on current_price.scryfall_id = c.scryfall_id
          and current_price.date = dates.latest_date
          and current_price.source = 'mtgjson'
        join prices price_7d
          on price_7d.scryfall_id = c.scryfall_id
          and price_7d.date = dates.latest_date - interval '7 days'
          and price_7d.source = 'mtgjson'
        join prices price_30d
          on price_30d.scryfall_id = c.scryfall_id
          and price_30d.date = dates.latest_date - interval '30 days'
          and price_30d.source = 'mtgjson'
        where price_7d.eur > 0 and price_30d.eur > 0
      )
      select id, name, set_code, set_name, image_url, rarity, type_line,
             price, return_7d, return_30d, released_at, is_reserved
      from priced
      where ${conditions.join(" and ")}
      order by abs(return_30d) + abs(return_7d) desc
      limit 1200
    `,
    values,
  );

  const scored = rows
    .map((row) => {
      const change7d = Number(row.return_7d);
      const change30d = Number(row.return_30d);
      const volatility = Math.abs(change7d - change30d / 4);
      const score = {
        preservation: change30d * 0.32 + change7d * 0.12 - volatility * 1.1,
        conservative: change30d * 0.42 + change7d * 0.18 - volatility * 0.82,
        balanced: change30d * 0.55 + change7d * 0.32 - volatility * 0.32,
        growth: change30d * 0.54 + change7d * 0.52 - volatility * 0.08,
        aggressive: change30d * 0.5 + change7d * 0.72 + volatility * 0.08,
      }[preferences.risk];
      const horizonMultiplier = {
        short: change7d >= 0 ? 1.18 : 0.72,
        medium: 1,
        long: change30d >= 0 ? 1.12 : 0.8,
      }[preferences.horizon];

      const ageYears = Math.max(
        0,
        (Date.now() - new Date(row.released_at).getTime()) /
          (365.25 * 24 * 60 * 60 * 1000),
      );
      const strategyAdjustment = {
        diversified: 1,
        momentum: 1 + Math.max(0, change7d) / 100,
        stability: 1 + Math.max(0, 15 - volatility) / 100,
        collectible: 1 + (row.is_reserved ? 0.32 : 0) + Math.min(ageYears, 30) / 150,
      }[preferences.strategy];

      return {
        row,
        change7d,
        change30d,
        score: score * horizonMultiplier * strategyAdjustment,
      };
    })
    .sort((a, b) => b.score - a.score);

  const positionLimit = isProUser
    ? Math.min(preferences.positions, 20)
    : Math.min(preferences.positions, 5);
  const uniqueNames = new Set<string>();
  const selected = scored.filter(({ row }) => {
    const key = row.name.toLowerCase();
    if (uniqueNames.has(key)) return false;
    uniqueNames.add(key);
    return true;
  }).slice(0, positionLimit);

  const positiveScores = selected.map((candidate) =>
    Math.max(candidate.score, 1),
  );
  const scoreTotal = positiveScores.reduce((sum, score) => sum + score, 0);
  let remainingBudget = preferences.budget;

  const recommendations = selected.map((candidate, index) => {
    const price = Number(candidate.row.price);
    const targetAllocation =
      index === selected.length - 1
        ? remainingBudget
        : preferences.budget * (positiveScores[index] / scoreTotal);
    const quantity = Math.max(1, Math.floor(targetAllocation / price));
    const allocation = Math.min(quantity * price, remainingBudget);
    const finalQuantity = Math.max(1, Math.floor(allocation / price));
    remainingBudget = Math.max(0, remainingBudget - allocation);

    return {
      cardId: candidate.row.id,
      name: candidate.row.name,
      setCode: candidate.row.set_code,
      setName: candidate.row.set_name,
      imageUrl: candidate.row.image_url,
      rarity: candidate.row.rarity,
      typeLine: candidate.row.type_line,
      price,
      change7d: candidate.change7d,
      change30d: candidate.change30d,
      quantity: finalQuantity,
      allocation,
      score: candidate.score,
      rationale: rationaleFor(
        preferences.locale,
        preferences.risk,
        preferences.strategy,
        candidate.change7d,
        candidate.change30d,
      ),
      buyerTips: buyerTipsFor(
        preferences.locale,
        price,
        candidate.change7d,
        candidate.change30d,
        finalQuantity,
        preferences.horizon,
      ),
    } satisfies BrainRecommendation;
  }).filter((item) => item.allocation >= item.price);

  const expectedValue = recommendations.reduce(
    (total, item) =>
      total +
      item.allocation *
        (1 + Math.max(-15, Math.min(item.change30d, 30)) / 100),
    0,
  );
  const name =
    preferences.locale === "es"
      ? `Cartera ${preferences.risk}`
      : `${preferences.risk[0].toUpperCase()}${preferences.risk.slice(1)} portfolio`;

  const portfolioResult = await query<{ id: string }>(
    `
      insert into app_brain_portfolios (
        user_id, name, budget_eur, risk_level, horizon,
        preferences, expected_value_eur
      )
      values ($1, $2, $3, $4, $5, $6::jsonb, $7)
      returning id::text
    `,
    [
      userId,
      name,
      preferences.budget,
      preferences.risk === "preservation"
        ? "conservative"
        : preferences.risk === "growth"
          ? "aggressive"
          : preferences.risk,
      preferences.horizon,
      JSON.stringify(preferences),
      expectedValue,
    ],
  );
  const portfolioId = portfolioResult.rows[0].id;

  await Promise.all(
    recommendations.map((item) =>
      query(
        `
          insert into app_brain_portfolio_items (
            brain_portfolio_id, scryfall_id, quantity,
            allocation_eur, score, rationale
          )
          values ($1, $2, $3, $4, $5, $6)
        `,
        [
          portfolioId,
          item.cardId,
          item.quantity,
          item.allocation,
          item.score,
          item.rationale,
        ],
      ),
    ),
  );

  await query(
    `update app_users set preferences = $1::jsonb, updated_at = now() where id = $2`,
    [JSON.stringify(preferences), userId],
  );

  return {
    id: portfolioId,
    name,
    isPreview: !isProUser,
    budget: preferences.budget,
    invested: recommendations.reduce((sum, item) => sum + item.allocation, 0),
    expectedValue,
    recommendations,
  };
}
