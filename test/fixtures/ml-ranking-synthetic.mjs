const DAY_MS = 86_400_000;
const AS_OF_DATES = [
  "2023-01-01",
  "2023-05-01",
  "2023-08-29",
  "2023-12-27",
  "2024-04-25",
  "2024-08-23",
  "2024-12-21",
  "2025-04-20",
];
const RARITIES = ["common", "uncommon", "rare", "mythic"];

function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function round(value) {
  return Number(value.toFixed(8));
}

export function buildSyntheticRankingFixture() {
  const rows = [];
  for (const [dateIndex, asOfDate] of AS_OF_DATES.entries()) {
    for (let cardIndex = 0; cardIndex < 18; cardIndex += 1) {
      const momentum7d = ((cardIndex * 7 + dateIndex * 3) % 21 - 10) / 100;
      const momentum30d = ((cardIndex * 11 + dateIndex * 5) % 31 - 15) / 100;
      const momentum90d = ((cardIndex * 5 + dateIndex * 7) % 41 - 20) / 100;
      const volatility30d = 0.01 + ((cardIndex * 3 + dateIndex) % 12) / 100;
      const drawdown90d = -((cardIndex * 2 + dateIndex) % 16) / 100;
      const isReserved = cardIndex % 5 === 0;
      const signal =
        momentum7d * 0.7 -
        momentum30d * 0.35 +
        momentum90d * 1.1 -
        volatility30d * 0.8 +
        (isReserved ? 0.08 : -0.01) +
        ((dateIndex % 3) - 1) * 0.025;
      const return30d =
        dateIndex === 5 && cardIndex === 17 ? null : round(signal);
      rows.push({
        featureContractVersion: "v1",
        labelContractVersion: "v1",
        datasetKind: "synthetic",
        scryfallId: `00000000-0000-4000-8000-${String(cardIndex + 1).padStart(12, "0")}`,
        asOfDate,
        priceSource: "synthetic",
        metadataAvailableAt: "2020-01-01",
        sourceMaxPriceDate:
          cardIndex % 7 === 0 ? addDays(asOfDate, -2) : asOfDate,
        priceEur: round(3 + cardIndex * 2.25 + dateIndex * 0.4),
        momentum7d: cardIndex % 13 === 0 ? null : round(momentum7d),
        momentum30d: round(momentum30d),
        momentum90d: cardIndex % 11 === 0 ? null : round(momentum90d),
        volatility30d: round(volatility30d),
        drawdown90d: round(drawdown90d),
        historyDays: 180 + dateIndex * 120 + cardIndex * 9,
        observations90d: 60 + ((cardIndex + dateIndex) % 31),
        priceStalenessDays: cardIndex % 7 === 0 ? 2 : 0,
        cardAgeDays: 800 + dateIndex * 120 + cardIndex * 31,
        rarity: RARITIES[cardIndex % RARITIES.length],
        cardType: cardIndex % 2 ? "Creature" : "Artifact",
        isReserved,
        labelCutoffDate: addDays(asOfDate, 90),
        return7d: return30d === null ? null : round(return30d * 0.35),
        return30d,
        return90d: return30d === null ? null : round(return30d * 1.4),
        downside90d:
          return30d === null
            ? null
            : round(Math.min(0, return30d - 0.07 - volatility30d)),
        realizedVolatility90d:
          return30d === null ? null : round(volatility30d * 1.25),
        has7dPrice: return30d !== null,
        has30dPrice: return30d !== null,
        has90dPrice: return30d !== null,
      });
    }
  }
  return rows;
}
