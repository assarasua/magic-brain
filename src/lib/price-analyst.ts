import { query } from "@/lib/db";

type CandidateRow = {
  id: string;
  name: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  image_url: string | null;
  history_count: string;
};

type PriceRow = {
  date: string;
  eur: string;
};

const stopWords = new Set([
  "a", "al", "and", "big", "cambio", "carta", "change", "como", "cuanto",
  "cuánto", "cuando", "cuándo", "day", "de", "del", "dia", "día", "did",
  "el", "en", "fue", "grande", "how", "in", "increase", "la", "largest",
  "mas", "mayor", "much", "of", "price", "precio", "rise", "se", "subio",
  "subió", "subir", "tardo", "tardó", "the", "time", "tiempo", "took", "was",
  "what", "when", "y",
]);

const normalizeTokens = (question: string) =>
  question
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter((token) => token.length > 1 && !stopWords.has(token))
    .slice(0, 8) ?? [];

const daysBetween = (start: string, end: string) =>
  Math.max(
    0,
    Math.round(
      (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
        86_400_000,
    ),
  );

const money = (value: number, locale: "en" | "es") =>
  new Intl.NumberFormat(locale === "es" ? "es-ES" : "en-GB", {
    style: "currency",
    currency: "EUR",
  }).format(value);

const dateLabel = (value: string, locale: "en" | "es") =>
  new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));

export async function answerPriceQuestion(
  question: string,
  locale: "en" | "es",
) {
  const tokens = normalizeTokens(question);
  if (!tokens.length) {
    throw new Error(
      locale === "es"
        ? "No pude identificar la carta. Incluye su nombre en la pregunta."
        : "I could not identify the card. Include its name in the question.",
    );
  }

  const values = tokens.map((token) => `\\m${token}\\M`);
  const conditions = values
    .map((_, index) => `c.name ~* $${index + 1}`)
    .join(" and ");
  values.push(tokens.join(" "));
  const phrasePosition = values.length;
  const candidates = await query<CandidateRow>(
    `
      select
        c.scryfall_id::text as id,
        c.name,
        c.set_code,
        c.set_name,
        c.collector_number,
        coalesce(c.image_url, c.image_uris->>'normal') as image_url,
        count(p.date)::text as history_count
      from cards c
      left join prices p
        on p.scryfall_id = c.scryfall_id
        and p.source = 'mtgjson'
        and p.eur is not null
      where ${conditions}
      group by c.scryfall_id, c.name, c.set_code, c.set_name,
        c.collector_number, c.image_url, c.image_uris, c.released_at
      having count(p.date) >= 2
      order by
        case
          when lower(c.name) = lower($${phrasePosition})
            or lower(c.name) = lower('the ' || $${phrasePosition})
          then 0 else 1
        end,
        abs(cardinality(regexp_split_to_array(trim(c.name), '\\s+')) - ${tokens.length}),
        count(p.date) desc, c.released_at asc nulls last,
        length(c.collector_number), c.collector_number
      limit 8
    `,
    values,
  );

  const selected = candidates.rows[0];
  if (!selected) {
    throw new Error(
      locale === "es"
        ? "No encontré una carta con ese nombre y suficiente historial."
        : "I could not find that card with enough price history.",
    );
  }

  const history = await query<PriceRow>(
    `
      select date::text, eur::text
      from prices
      where scryfall_id = $1 and source = 'mtgjson' and eur is not null
      order by date
    `,
    [selected.id],
  );
  const points = history.rows.map((row) => ({
    date: row.date,
    price: Number(row.eur),
  }));

  let minimumIndex = 0;
  let bestRise = {
    start: points[0],
    end: points[0],
    percent: 0,
  };
  let biggestChange = {
    start: points[0],
    end: points[1],
    percent: ((points[1].price - points[0].price) / points[0].price) * 100,
  };

  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    const previous = points[index - 1];
    const dailyChange =
      ((point.price - previous.price) / previous.price) * 100;
    if (Math.abs(dailyChange) > Math.abs(biggestChange.percent)) {
      biggestChange = { start: previous, end: point, percent: dailyChange };
    }

    const rise =
      ((point.price - points[minimumIndex].price) /
        points[minimumIndex].price) *
      100;
    if (rise > bestRise.percent) {
      bestRise = {
        start: points[minimumIndex],
        end: point,
        percent: rise,
      };
    }
    if (point.price < points[minimumIndex].price) minimumIndex = index;
  }

  const first = points[0];
  const latest = points.at(-1)!;
  const totalReturn = ((latest.price - first.price) / first.price) * 100;
  const riseDays = daysBetween(bestRise.start.date, bestRise.end.date);
  const direction = biggestChange.percent >= 0;

  const answer =
    locale === "es"
      ? `He analizado ${selected.name} (${selected.set_code.toUpperCase()}, #${selected.collector_number}). Su mayor tramo de subida fue del ${bestRise.percent.toFixed(1)}%, desde ${money(bestRise.start.price, locale)} el ${dateLabel(bestRise.start.date, locale)} hasta ${money(bestRise.end.price, locale)} el ${dateLabel(bestRise.end.date, locale)}: tardó ${riseDays} días. El mayor cambio diario ocurrió el ${dateLabel(biggestChange.end.date, locale)}: ${direction ? "subió" : "bajó"} un ${Math.abs(biggestChange.percent).toFixed(1)}%, de ${money(biggestChange.start.price, locale)} a ${money(biggestChange.end.price, locale)}. En todo el historial disponible, el cambio es ${totalReturn >= 0 ? "+" : ""}${totalReturn.toFixed(1)}%.`
      : `I analysed ${selected.name} (${selected.set_code.toUpperCase()}, #${selected.collector_number}). Its strongest rise was ${bestRise.percent.toFixed(1)}%, from ${money(bestRise.start.price, locale)} on ${dateLabel(bestRise.start.date, locale)} to ${money(bestRise.end.price, locale)} on ${dateLabel(bestRise.end.date, locale)}, taking ${riseDays} days. The largest daily move was on ${dateLabel(biggestChange.end.date, locale)}: it ${direction ? "rose" : "fell"} ${Math.abs(biggestChange.percent).toFixed(1)}%, from ${money(biggestChange.start.price, locale)} to ${money(biggestChange.end.price, locale)}. Across all available history, the change is ${totalReturn >= 0 ? "+" : ""}${totalReturn.toFixed(1)}%.`;

  return {
    answer,
    card: {
      id: selected.id,
      name: selected.name,
      setCode: selected.set_code,
      setName: selected.set_name,
      collectorNumber: selected.collector_number,
      imageUrl: selected.image_url,
    },
    metrics: {
      risePercent: bestRise.percent,
      riseDays,
      riseStart: bestRise.start,
      riseEnd: bestRise.end,
      biggestChangeDate: biggestChange.end.date,
      biggestChangePercent: biggestChange.percent,
      first,
      latest,
      totalReturn,
    },
    history: points.slice(-365),
    alternatives: candidates.rows.slice(1, 6).map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      setCode: candidate.set_code,
      setName: candidate.set_name,
      collectorNumber: candidate.collector_number,
    })),
  };
}
