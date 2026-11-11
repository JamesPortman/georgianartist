/**
 * Northern-hemisphere meteorological season for a given date (defaults to now).
 * Used by the sale banner so the label tracks the calendar automatically.
 */
export type Season = "Spring" | "Summer" | "Fall" | "Winter";

export function currentSeason(date: Date = new Date()): Season {
  const month = date.getMonth(); // 0 = January … 11 = December
  if (month >= 2 && month <= 4) return "Spring"; // Mar–May
  if (month >= 5 && month <= 7) return "Summer"; // Jun–Aug
  if (month >= 8 && month <= 10) return "Fall"; // Sep–Nov
  return "Winter"; // Dec–Feb
}
