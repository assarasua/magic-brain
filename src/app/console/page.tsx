import type { Metadata } from "next";
import { ConsoleClient } from "./console-client";

export const metadata: Metadata = {
  title: "Magic Brain Console",
  description:
    "Run safe Magic Brain API commands directly in the browser without installing a CLI.",
};

export default function ConsolePage() {
  return <ConsoleClient />;
}
