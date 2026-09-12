export type Card = {
  id: string;
  name: string;
  set: string;
  setCode: string;
  price: number;
  change: number;
  sparkline: number[];
  image: string;
  rarity: string;
};

const scryfallImage = (name: string) =>
  `https://api.scryfall.com/cards/named?format=image&version=normal&exact=${encodeURIComponent(name)}`;

export const movers: Card[] = [
  {
    id: "rhystic-study",
    name: "Rhystic Study",
    set: "Wilds of Eldraine: Enchanting Tales",
    setCode: "WOT",
    price: 42.68,
    change: 18.4,
    sparkline: [31, 33, 32, 35, 36, 35, 39, 38, 41, 42.68],
    image: scryfallImage("Rhystic Study"),
    rarity: "Rare",
  },
  {
    id: "the-one-ring",
    name: "The One Ring",
    set: "The Lord of the Rings",
    setCode: "LTR",
    price: 88.12,
    change: 13.7,
    sparkline: [70, 72, 71, 75, 74, 79, 81, 80, 85, 88.12],
    image: scryfallImage("The One Ring"),
    rarity: "Mythic",
  },
  {
    id: "sheoldred",
    name: "Sheoldred, the Apocalypse",
    set: "Dominaria United",
    setCode: "DMU",
    price: 67.44,
    change: 8.9,
    sparkline: [58, 59, 61, 60, 62, 64, 63, 65, 66, 67.44],
    image: scryfallImage("Sheoldred, the Apocalypse"),
    rarity: "Mythic",
  },
  {
    id: "orcish-bowmasters",
    name: "Orcish Bowmasters",
    set: "The Lord of the Rings",
    setCode: "LTR",
    price: 35.26,
    change: -7.2,
    sparkline: [42, 41, 40, 41, 39, 38, 38, 36, 37, 35.26],
    image: scryfallImage("Orcish Bowmasters"),
    rarity: "Rare",
  },
  {
    id: "ragavan",
    name: "Ragavan, Nimble Pilferer",
    set: "Modern Horizons 2",
    setCode: "MH2",
    price: 38.91,
    change: -11.5,
    sparkline: [48, 47, 46, 45, 44, 45, 42, 41, 40, 38.91],
    image: scryfallImage("Ragavan, Nimble Pilferer"),
    rarity: "Mythic",
  },
];

export const portfolioCards = [
  { ...movers[1], quantity: 2, costBasis: 126.0 },
  { ...movers[2], quantity: 3, costBasis: 171.3 },
  {
    id: "force-of-will",
    name: "Force of Will",
    set: "Alliances",
    setCode: "ALL",
    price: 73.2,
    change: 3.1,
    sparkline: [69, 70, 69, 71, 72, 71, 73, 73.2],
    image: scryfallImage("Force of Will"),
    rarity: "Rare" as const,
    quantity: 1,
    costBasis: 58.0,
  },
];

export const portfolioHistory = [
  842, 861, 850, 884, 902, 895, 938, 955, 947, 982, 1004, 1021, 1012, 1058,
  1084, 1101, 1136, 1128, 1172, 1198, 1218, 1247.36,
];

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(value);
