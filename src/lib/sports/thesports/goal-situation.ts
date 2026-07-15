import type { SoccerGoal } from "@/lib/sports/live-scores";

export type GoalSituation =
  | "open_play"
  | "fast_break"
  | "corner"
  | "free_kick"
  | "set_piece"
  | "throw_in"
  | "penalty"
  | "own_goal";

export const GOAL_SITUATION_LABEL: Record<GoalSituation, string> = {
  open_play: "오픈 플레이",
  fast_break: "역습",
  corner: "코너킥",
  free_kick: "프리킥",
  set_piece: "세트피스",
  throw_in: "스로인 세트피스",
  penalty: "페널티킥",
  own_goal: "자책골",
};

interface GoalLineLike {
  own_goal?: number;
  pass?: Array<{ x?: string | number; y?: string | number }>;
}

interface TimelineEntry {
  data?: unknown;
  time?: unknown;
  position?: unknown;
}

interface ClassifyGoalSituationOptions {
  goal: GoalLineLike;
  event?: SoccerGoal;
  minute: number;
  scoringSide: 1 | 2;
  shotSituation?: string | null;
  timeline?: unknown;
}

function parseMinute(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const match = String(value).match(/(\d+)(?:[’']?\+(\d+))?/);
  if (!match) return null;
  return Number(match[1]) + Number(match[2] ?? 0);
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, "");
}

function findGoalCommentary(
  timeline: unknown,
  minute: number,
  scoringSide: 1 | 2,
  scorer?: string,
): string | null {
  if (!Array.isArray(timeline)) return null;
  const scorerKey = scorer ? normalizeName(scorer) : "";
  const candidates = timeline.flatMap((raw) => {
    const entry = raw as TimelineEntry;
    const data = typeof entry?.data === "string" ? entry.data : "";
    if (!/goal!/i.test(data)) return [];
    const entryMinute = parseMinute(entry.time ?? data);
    if (entryMinute == null || Math.abs(entryMinute - minute) > 1) return [];
    const position = Number(entry.position);
    if ((position === 1 || position === 2) && position !== scoringSide) return [];
    return [{ data, distance: Math.abs(entryMinute - minute) }];
  });
  if (candidates.length === 0) return null;

  return candidates
    .sort((a, b) => {
      const aScorer = scorerKey && normalizeName(a.data).includes(scorerKey) ? 1 : 0;
      const bScorer = scorerKey && normalizeName(b.data).includes(scorerKey) ? 1 : 0;
      return bScorer - aScorer || a.distance - b.distance;
    })[0].data;
}

function fromShotSituation(value: string | null | undefined): GoalSituation | null {
  switch (value) {
    case "regular":
    case "assisted":
      return "open_play";
    case "fast_break":
      return "fast_break";
    case "corner":
      return "corner";
    case "free_kick":
      return "free_kick";
    case "set_piece":
      return "set_piece";
    case "throw_in_set_piece":
      return "throw_in";
    case "penalty":
      return "penalty";
    default:
      return null;
  }
}

function fromCommentary(value: string | null): GoalSituation | null {
  if (!value) return null;
  if (/takes? a penalty kick|from the penalty spot|penalty/i.test(value)) return "penalty";
  if (/following a corner|from a corner/i.test(value)) return "corner";
  if (/from (?:a )?free kick|direct free[ -]?kick/i.test(value)) return "free_kick";
  if (/following a set[ -]?piece situation/i.test(value)) return "set_piece";
  if (/following a fast break|counter[ -]?attack/i.test(value)) return "fast_break";
  return null;
}

function startsAtCorner(goal: GoalLineLike): boolean {
  const first = goal.pass?.[0];
  if (!first) return false;
  const x = Number(first.x);
  const y = Number(first.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return (x <= 3 || x >= 97) && (y <= 3 || y >= 97);
}

export function classifyGoalSituation({
  goal,
  event,
  minute,
  scoringSide,
  shotSituation,
  timeline,
}: ClassifyGoalSituationOptions): GoalSituation | null {
  if (Number(goal.own_goal) === 1 || event?.ownGoal) return "own_goal";
  if (event?.penaltyKick) return "penalty";

  const structuredSituation = fromShotSituation(shotSituation);
  if (structuredSituation) return structuredSituation;

  const commentary = findGoalCommentary(timeline, minute, scoringSide, event?.player);
  const commentarySituation = fromCommentary(commentary);
  if (commentarySituation) return commentarySituation;

  return startsAtCorner(goal) ? "corner" : null;
}
