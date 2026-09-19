import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("primary product copy uses the collection mental model in both languages", () => {
  const language = read("src/components/language-provider.tsx");
  const home = read("src/app/page.tsx");
  const login = read("src/app/login/page.tsx");

  assert.match(language, /"Portfolio": "Colección"/);
  assert.match(language, /"My portfolio": "Mi colección"/);
  assert.match(home, /Know your cards, understand their value/);
  assert.match(home, /Conoce tus cartas, su valor/);
  assert.match(login, /Give your collection a memory/);
  assert.match(login, /Dale memoria a tu colección/);
});

test("collector labels preserve portfolio compatibility routes and APIs", () => {
  const navigation = read("src/components/product-navigation.ts");
  const collectionPage = read("src/app/portfolio/page.tsx");

  assert.match(
    navigation,
    /\{ href: "\/portfolio", label: "Collection", icon: WalletCards \}/,
  );
  assert.match(collectionPage, /fetch\(`\/api\/portfolio/);
  assert.match(collectionPage, /fetch\("\/api\/portfolio"/);
  assert.doesNotMatch(navigation, /href: "\/collection"/);
});

test("market availability copy does not imply live marketplace stock", () => {
  const market = read("src/app/market/page.tsx");

  assert.match(market, /does not yet have printings in the catalogue/);
  assert.doesNotMatch(market, /No cards are available for this set/);
});
