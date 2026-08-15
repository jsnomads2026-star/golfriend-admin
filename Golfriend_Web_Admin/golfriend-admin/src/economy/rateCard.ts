export type PricingMode = "free" | "fixed" | "metered";
export type RateSurface = "App" | "Admin" | "Portal" | "Web";

export interface EconomyRate {
  id: string;
  section: string;
  label: string;
  surfaces: RateSurface[];
  mode: PricingMode;
  tees: number;
  directCostUsd: number;
  rewardTees: number;
  active: boolean;
  effectiveAt: string;
  version: string;
}

const free = (id: string, section: string, label: string, surfaces: RateSurface[] = ["App"]): EconomyRate => ({
  id, section, label, surfaces, mode: "free", tees: 0, directCostUsd: 0,
  rewardTees: 0, active: true, effectiveAt: "2026-08-15", version: "hybrid-profit-v1",
});
const fixed = (id: string, section: string, label: string, tees: number, directCostUsd = 0): EconomyRate => ({
  id, section, label, surfaces: ["App"], mode: "fixed", tees, directCostUsd,
  rewardTees: 0, active: true, effectiveAt: "2026-08-15", version: "hybrid-profit-v1",
});
const metered = (id: string, section: string, label: string, minimumTees: number): EconomyRate => ({
  ...fixed(id, section, label, minimumTees), mode: "metered",
});

export const INITIAL_ECONOMY_RATE_CARD: EconomyRate[] = [
  free("auth.gateway", "Gateway", "Authentication and verification"),
  free("lounge.navigation", "Lounge", "Lounge navigation"),
  free("profile.safety", "Locker Room", "Profile and safety controls"),
  free("chat.basic", "Chat", "Basic text chat"),
  free("match.basic", "Match", "Basic match request"),
  free("course.cached", "Play Golf", "Cached course discovery"),
  free("booking.handoff", "Booking", "Third-party booking handoff"),
  free("score.entry", "Play Golf", "Score entry"),
  free("history.view", "Play Golf", "Round history"),
  free("ledger.view", "Economy", "Wallet and ledger view"),

  fixed("match.shortlist", "Match", "AI player shortlist", 5),
  fixed("match.refresh", "Match", "Precision shortlist refresh", 3),
  fixed("match.worldwide", "Match", "Worldwide region visit", 10),
  fixed("match.waitingRoom", "Match", "Waiting-room priority assist", 5),
  fixed("match.roundPlan", "Match", "AI round plan", 8),

  fixed("chat.draft", "Chat", "AI message draft", 1),
  fixed("chat.translate", "Chat", "AI message translation", 1),
  fixed("chat.summary", "Chat", "AI thread summary", 3),
  fixed("chat.group", "Chat", "AI group coordination", 5),

  fixed("play.bookingAssistant", "Play Golf", "Booking assistant", 5),
  fixed("play.courseCompare", "Play Golf", "Course comparison", 5),
  fixed("play.preRound", "Play Golf", "Pre-round plan", 10),
  fixed("play.liveCaddie", "Play Golf", "Live AI Caddie — 18 holes", 25),
  fixed("play.postRound", "Play Golf", "Post-round analysis", 10),
  fixed("play.rules", "Play Golf", "Complex rules expert", 2),

  fixed("practice.swing", "Practice", "Standard swing analysis", 15),
  fixed("practice.swingDeep", "Practice", "Deep swing analysis", 30),
  fixed("practice.plan", "Practice", "AI practice plan", 8),

  fixed("album.enhance", "Master Album", "Photo enhancement", 5),
  fixed("album.fun", "Master Album", "Fun creation", 8),
  fixed("album.story", "Master Album", "Story or caption", 3),
  fixed("album.video", "Master Album", "Video highlight", 25),
  fixed("album.export", "Master Album", "Premium export", 5),

  fixed("tournament.create", "Tournament", "Create and coordinate tournament", 50),
  fixed("tournament.draw", "Tournament", "AI draw or pairings", 15),
  fixed("tournament.live", "Tournament", "Live update package", 25),
  fixed("tournament.story", "Tournament", "Results story package", 20),

  fixed("organizer.group", "Organizer", "Group round coordination", 25),
  fixed("organizer.concierge", "Organizer", "Concierge request", 50),
  fixed("organizer.power", "Organizer", "Power workflow", 100),

  fixed("storage.photo", "Storage", "Extra photo slot", 20),
  fixed("storage.video", "Storage", "Extra video slot", 100),
  fixed("storage.album", "Storage", "Master Album expansion", 50),

  metered("ai.actualCost", "AI Metering", "Unlisted high-cost AI action", 1),
];

export const USD_PER_TEE = 0.10;

export function rateMargin(rate: EconomyRate) {
  const revenueUsd = rate.tees * USD_PER_TEE;
  const marginUsd = revenueUsd - rate.directCostUsd;
  const marginPercent = revenueUsd === 0 ? null : marginUsd / revenueUsd;
  return { revenueUsd, marginUsd, marginPercent };
}
