import { siteConfig } from "@/data/siteConfig";
import { currentSeason } from "@/lib/season";

export default function SaleBanner() {
  if (!siteConfig.saleBanner.enabled) return null;
  return (
    // data-seasonal: its wording changes with the calendar, so the visual
    // regression screenshots mask it (e2e/visual.spec.ts).
    <div data-seasonal className="bg-brand text-white text-center text-sm py-2 px-4">
      <span className="font-semibold">{currentSeason()} {siteConfig.saleBanner.label}</span>
      {": "}{siteConfig.saleBanner.body}
    </div>
  );
}
