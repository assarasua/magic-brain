import type { Metadata } from "next";
import PlayTable from "./play-table";

export const metadata: Metadata = {
  title: "Play Commander · Magic Brain",
  description:
    "Play Commander with 2–4 humans or computer opponents. Create a private online room, import deck lists, control each phase, and consult Oracle text and rulings.",
  alternates: { canonical: "https://magicbrain.es/play" },
};
export default function PlayPage() {
  return <PlayTable />;
}
