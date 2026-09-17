export const webMcpDestinations = [
  { id: "overview", label: "Overview", path: "/", description: "Open the Magic Brain overview dashboard." },
  { id: "market", label: "Market", path: "/market", description: "Browse market movements and pricing activity." },
  { id: "latest-set-watch", label: "Latest Set Watch", path: "/market/latest-set-watch", description: "Review opportunities in the latest Magic set." },
  { id: "portfolio", label: "Portfolio", path: "/portfolio", description: "Open the signed-in user's collection portfolio." },
  { id: "inventory", label: "Inventory", path: "/inventory", description: "Manage the signed-in user's card inventory." },
  { id: "discover", label: "Discover", path: "/discover", description: "Discover cards using Magic Brain filters." },
  { id: "watchlist", label: "Watchlist", path: "/watchlist", description: "Open the signed-in user's card watchlist." },
  { id: "reserved-list", label: "Reserved List", path: "/reserved", description: "Explore Reserved List cards." },
  { id: "brain", label: "Brain", path: "/brain", description: "Open Magic Brain's research workspace." },
  { id: "signals", label: "Signals", path: "/signals", description: "Review market signals." },
  { id: "analyst", label: "Analyst", path: "/analyst", description: "Open the price analyst." },
  { id: "predict", label: "Predict", path: "/predict", description: "Open price prediction tools." },
  { id: "settings", label: "Settings", path: "/settings", description: "Open account and application settings." },
  { id: "developers", label: "Developers", path: "/developers", description: "Open API and MCP developer resources." },
] as const;

export type WebMcpDestinationId = (typeof webMcpDestinations)[number]["id"];

export function getWebMcpDestination(id: string) {
  return webMcpDestinations.find((destination) => destination.id === id) ?? null;
}
