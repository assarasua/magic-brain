export type FinancialPoint = {
  date: string;
  value: number;
};

export type SeriesMetrics = {
  startValue: number;
  endValue: number;
  absoluteReturn: number;
  returnPercent: number;
  high: number;
  low: number;
  maxDrawdownPercent: number;
  annualizedVolatilityPercent: number;
  averageDailyMovePercent: number;
  observations: number;
};

const round = (value: number, digits = 2) =>
  Number(value.toFixed(digits));

export function calculateSeriesMetrics(
  points: FinancialPoint[],
): SeriesMetrics | null {
  const valid = points.filter(
    (point) => Number.isFinite(point.value) && point.value > 0,
  );
  if (valid.length < 2) return null;

  const values = valid.map((point) => point.value);
  const dailyReturns = values.slice(1).map(
    (value, index) => (value - values[index]) / values[index],
  );
  const mean =
    dailyReturns.reduce((sum, value) => sum + value, 0) /
    dailyReturns.length;
  const variance =
    dailyReturns.reduce(
      (sum, value) => sum + (value - mean) ** 2,
      0,
    ) / dailyReturns.length;

  let peak = values[0];
  let maxDrawdown = 0;
  values.forEach((value) => {
    peak = Math.max(peak, value);
    maxDrawdown = Math.min(maxDrawdown, (value - peak) / peak);
  });

  const startValue = values[0];
  const endValue = values.at(-1) ?? startValue;

  return {
    startValue,
    endValue,
    absoluteReturn: round(endValue - startValue),
    returnPercent: round(((endValue - startValue) / startValue) * 100),
    high: round(Math.max(...values)),
    low: round(Math.min(...values)),
    maxDrawdownPercent: round(maxDrawdown * 100),
    annualizedVolatilityPercent: round(Math.sqrt(variance) * Math.sqrt(365) * 100),
    averageDailyMovePercent: round(
      (dailyReturns.reduce((sum, value) => sum + Math.abs(value), 0) /
        dailyReturns.length) *
        100,
    ),
    observations: valid.length,
  };
}

export function movingAverage(
  points: FinancialPoint[],
  window: number,
) {
  return points.map((point, index) => {
    const start = Math.max(0, index - window + 1);
    const values = points.slice(start, index + 1);
    return {
      date: point.date,
      value:
        values.reduce((sum, current) => sum + current.value, 0) /
        values.length,
    };
  });
}
