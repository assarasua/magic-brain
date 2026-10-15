import { PausedLanding } from "@/components/paused-landing";
import OverviewPage from "@/components/overview-page";
import { SITE_PAUSED } from "@/lib/site-mode";

export default function Home() {
  return SITE_PAUSED ? <PausedLanding /> : <OverviewPage />;
}
