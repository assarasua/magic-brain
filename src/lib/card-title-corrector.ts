import type { CardLanguage } from "@/lib/card-languages";

const ARTIFACT_URL = "/models/card-title-corrector-v1.json";
export const CARD_TITLE_MODEL_SHA256 =
  "b1184cd8b5ff309b0fb99f51a9419f19cebc3fe8751fecc6d076f45de9a07c18";

type Artifact = {
  schemaVersion: 1;
  modelVersion: string;
  confusionCosts: Record<string, number>;
  lexicon: { en: string[]; es: string[] };
};

type LoadedModel = {
  artifact: Artifact;
  indexes: {
    en: Map<string, number[]>;
    es: Map<string, number[]>;
  };
};

let modelPromise: Promise<LoadedModel> | null = null;

function normalize(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}' -]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function trigrams(value: string) {
  const padded = `  ${normalize(value)}  `;
  const values = new Set<string>();
  for (let index = 0; index < padded.length - 2; index += 1) {
    values.add(padded.slice(index, index + 3));
  }
  return values;
}

function createIndex(titles: string[]) {
  const index = new Map<string, number[]>();
  titles.forEach((title, titleIndex) => {
    trigrams(title).forEach((gram) => {
      const entries = index.get(gram);
      if (entries) entries.push(titleIndex);
      else index.set(gram, [titleIndex]);
    });
  });
  return index;
}

async function loadModel() {
  if (!modelPromise) {
    modelPromise = fetch(ARTIFACT_URL, { cache: "force-cache" }).then(async (response) => {
      if (!response.ok) throw new Error("title_model_unavailable");
      const bytes = await response.arrayBuffer();
      const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      if (digest !== CARD_TITLE_MODEL_SHA256) {
        throw new Error("title_model_checksum_mismatch");
      }
      const artifact = JSON.parse(new TextDecoder().decode(bytes)) as Artifact;
      if (artifact.schemaVersion !== 1) throw new Error("title_model_schema");
      return {
        artifact,
        indexes: {
          en: createIndex(artifact.lexicon.en),
          es: createIndex(artifact.lexicon.es),
        },
      };
    });
  }
  return modelPromise;
}

function distance(
  observed: string,
  truth: string,
  costs: Record<string, number>,
) {
  const left = normalize(observed);
  const right = normalize(truth);
  const sequences = Object.entries(costs).filter(([operation]) => {
    const [seen, expected] = operation.split(">");
    return seen.length > 1 || expected.length > 1;
  });
  const rows = Array.from(
    { length: left.length + 1 },
    () => new Array<number>(right.length + 1).fill(0),
  );
  for (let x = 0; x <= left.length; x += 1) rows[x][0] = x;
  for (let y = 0; y <= right.length; y += 1) rows[0][y] = y;
  for (let x = 1; x <= left.length; x += 1) {
    for (let y = 1; y <= right.length; y += 1) {
      const unit = left[x - 1] === right[y - 1] ? 0 : 1;
      const weighted = costs[`${left[x - 1]}>${right[y - 1]}`] ?? unit;
      rows[x][y] = Math.min(
        rows[x - 1][y] + (costs[`>${right[y - 1]}`] ?? 1),
        rows[x][y - 1] + 1,
        rows[x - 1][y - 1] + unit * 0.85 + weighted * 0.15,
      );
      for (const [operation, cost] of sequences) {
        const [seen, expected] = operation.split(">");
        if (
          x >= seen.length &&
          y >= expected.length &&
          left.slice(x - seen.length, x) === seen &&
          right.slice(y - expected.length, y) === expected
        ) {
          rows[x][y] = Math.min(
            rows[x][y],
            rows[x - seen.length][y - expected.length] + cost,
          );
        }
      }
    }
  }
  return rows[left.length][right.length] / Math.max(1, right.length);
}

function likelyTitlePhrases(text: string) {
  const words = normalize(text).split(" ").filter(Boolean).slice(0, 10);
  return Array.from(
    { length: Math.min(8, words.length) },
    (_, index) => words.slice(0, index + 1).join(" "),
  ).filter((value) => value.length >= 3);
}

export async function prewarmCardTitleCorrector(language: CardLanguage) {
  if (language === "en" || language === "es") await loadModel();
}

export async function correctCardTitleText(
  text: string,
  language: CardLanguage,
) {
  if (language !== "en" && language !== "es") return [];
  const { artifact, indexes } = await loadModel();
  const titles = artifact.lexicon[language];
  const index = indexes[language];
  const candidates = new Map<number, number>();
  const phrases = likelyTitlePhrases(text);
  phrases.forEach((phrase) =>
    trigrams(phrase).forEach((gram) =>
      index.get(gram)?.forEach((titleIndex) =>
        candidates.set(titleIndex, (candidates.get(titleIndex) ?? 0) + 1),
      ),
    ),
  );
  return [...candidates.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 60)
    .map(([titleIndex]) => {
      const title = titles[titleIndex];
      const score = Math.min(
        ...phrases.map((phrase) =>
          distance(phrase, title, artifact.confusionCosts),
        ),
      );
      return { title, confidence: Math.max(0, 1 - score) };
    })
    .sort(
      (left, right) =>
        right.confidence - left.confidence ||
        left.title.localeCompare(right.title),
    )
    .slice(0, 3);
}
