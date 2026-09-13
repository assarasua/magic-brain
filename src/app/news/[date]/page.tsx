import type { Metadata } from "next";
import { NewsDetail } from "../news-view";

export const metadata: Metadata = {
  title: "Daily market brief — Magic Brain",
};

export default async function NewsDetailPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  return <NewsDetail marketDataDate={date} />;
}
