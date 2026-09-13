import assert from "node:assert/strict";
import test from "node:test";
import {
  consolidateConfirmedImport,
  MAX_IMPORT_ROWS,
  parsePortfolioCsv,
  parsePortfolioText,
  validateConfirmedImport,
} from "./portfolio-import-model.ts";

test("parses Moxfield-style CSV with quoted names and metadata", () => {
  const result = parsePortfolioCsv(
    [
      "Count,Name,Edition,Collector Number,Condition,Language,Purchase Price",
      '2,"Fire // Ice",mh2,290,Near Mint,English,€3.50',
    ].join("\n"),
  );
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.rows[0], {
    row: 2,
    quantity: 2,
    name: "Fire // Ice",
    setCode: "mh2",
    collectorNumber: "290",
    purchasePrice: 3.5,
    condition: "near_mint",
    language: "en",
    acquiredAt: undefined,
  });
});

test("parses Deckstats collection columns", () => {
  const result = parsePortfolioCsv(
    [
      "amount,card_name,is_foil,set_code,language,condition,comment",
      "4,Lightning Bolt,false,2xm,en,LP,owned",
    ].join("\n"),
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0].quantity, 4);
  assert.equal(result.rows[0].name, "Lightning Bolt");
  assert.equal(result.rows[0].setCode, "2xm");
  assert.equal(result.rows[0].condition, "light_played");
});

test("parses common plain-text and printing-aware deck lines", () => {
  const result = parsePortfolioText(
    [
      "Deck",
      "4 Lightning Bolt",
      "2x Counterspell",
      "1 Black Lotus (LEA) 232",
      "3 [M11] Preordain",
    ].join("\n"),
  );
  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.rows.map(({ quantity, name, setCode, collectorNumber }) => ({
      quantity,
      name,
      setCode,
      collectorNumber,
    })),
    [
      { quantity: 4, name: "Lightning Bolt", setCode: undefined, collectorNumber: undefined },
      { quantity: 2, name: "Counterspell", setCode: undefined, collectorNumber: undefined },
      { quantity: 1, name: "Black Lotus", setCode: "lea", collectorNumber: "232" },
      { quantity: 3, name: "Preordain", setCode: "m11", collectorNumber: undefined },
    ],
  );
});

test("reports invalid rows without discarding valid rows", () => {
  const result = parsePortfolioText("2 Sol Ring\nno quantity\n0 Island");
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.errors, [
    { row: 2, message: "Expected “quantity card name”" },
    { row: 3, message: "Quantity must be a positive whole number" },
  ]);
});

test("enforces the import row limit", () => {
  const input = Array.from(
    { length: MAX_IMPORT_ROWS + 1 },
    (_, index) => `1 Card ${index}`,
  ).join("\n");
  assert.equal(parsePortfolioText(input).rows.length, 0);
});

test("rejects the full confirmation when any row is invalid", () => {
  assert.equal(
    validateConfirmedImport([
      {
        cardId: "00000000-0000-4000-8000-000000000001",
        quantity: 1,
        purchasePrice: 2,
        condition: "near_mint",
        language: "en",
      },
      {
        cardId: "not-a-card",
        quantity: 1,
        purchasePrice: 2,
        condition: "near_mint",
        language: "en",
      },
    ]),
    null,
  );
});

test("consolidates exact duplicate rows but preserves distinct lots", () => {
  const base = {
    cardId: "00000000-0000-4000-8000-000000000001",
    purchasePrice: 2,
    condition: "near_mint",
    language: "en",
  };
  const rows = consolidateConfirmedImport([
    { ...base, quantity: 2 },
    { ...base, quantity: 3 },
    { ...base, quantity: 1, purchasePrice: 4 },
  ]);
  assert.deepEqual(rows?.map(({ quantity, purchasePrice }) => ({ quantity, purchasePrice })), [
    { quantity: 5, purchasePrice: 2 },
    { quantity: 1, purchasePrice: 4 },
  ]);
});
