import {
  BrainCircuit,
  CircleDollarSign,
  Code2,
  Crown,
  Eye,
  Heart,
  LayoutDashboard,
  LibraryBig,
  MessageCircleQuestion,
  Network,
  Newspaper,
  Radar,
  Settings,
  Target,
  TrendingUp,
  WalletCards,
} from "lucide-react";

export const proNavigation = [
  { label: "Predict", href: "/predict", icon: Target },
  { label: "Collection Curator", href: "/brain", icon: BrainCircuit },
  { label: "Brain Signals", href: "/signals", icon: TrendingUp },
  { label: "Ask Brain", href: "/analyst", icon: MessageCircleQuestion },
  { label: "Discover", href: "/discover", icon: Heart },
] as const;

export const navigationGroups = [
  {
    label: "Market Intelligence",
    links: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/market", label: "Market", icon: TrendingUp },
      { href: "/news", label: "News", icon: Newspaper },
      { href: "/graph", label: "Opportunity Graph", icon: Network },
      {
        href: "/market/latest-set-watch",
        label: "Latest Set Watch",
        icon: Radar,
      },
    ],
  },
  {
    label: "Collection",
    links: [
      { href: "/inventory", label: "Inventory", icon: LibraryBig },
      { href: "/reserved", label: "Reserved List", icon: Crown },
      { href: "/portfolio", label: "Collection", icon: WalletCards },
      { href: "/watchlist", label: "Watchlist", icon: Eye },
    ],
  },
  {
    label: "Resources",
    links: [
      { href: "/developers", label: "Developers", icon: Code2 },
      { href: "/donate", label: "Support", icon: CircleDollarSign },
    ],
  },
  {
    label: "Account",
    links: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
] as const;

export function routeIsActive(pathname: string, href: string) {
  return href === "/"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}
