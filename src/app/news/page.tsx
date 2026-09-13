import type { Metadata } from "next";
import { NewsArchive } from "./news-view";

export const metadata: Metadata = {
  title: "Daily market news — Magic Brain",
  description: "Daily market briefs derived from stored Magic card prices.",
};

export default function NewsPage() {
  return <NewsArchive />;
}
