// WKBL 등록 선수 사전 — data/wkbl-players.json (scripts/build-wkbl-players.ts 주간 빌드) 읽기 전용 로더.
import raw from "../../../data/wkbl-players.json";
import { WKBL_POS_KO } from "./wkbl-api";

export interface WkblPlayer {
  id: string; // pno
  name: string; ename: string;
  team: string; teamFull: string | null; teamId: number | null;
  no: number | null; pos: string | null; height: number | null;
  birth: string | null; school: string | null; draft: string | null;
  photo: string;
}
const FILE = raw as { meta?: { updatedAt?: string }; players: Record<string, Omit<WkblPlayer, "id">> };
const BY_ID = new Map<string, WkblPlayer>();
const BY_TEAM = new Map<number, WkblPlayer[]>();
for (const [id, p] of Object.entries(FILE.players ?? {})) {
  const e: WkblPlayer = { id, ...p };
  BY_ID.set(id, e);
  if (e.teamId != null) { if (!BY_TEAM.has(e.teamId)) BY_TEAM.set(e.teamId, []); BY_TEAM.get(e.teamId)!.push(e); }
}
export function wkblPlayer(id: string | null | undefined): WkblPlayer | null { return id ? (BY_ID.get(String(id)) ?? null) : null; }
export function wkblRoster(teamId: number): WkblPlayer[] {
  const order: Record<string, number> = { G: 0, F: 1, C: 2 };
  return [...(BY_TEAM.get(teamId) ?? [])].sort((a, b) => (order[a.pos ?? ""] ?? 3) - (order[b.pos ?? ""] ?? 3) || (a.no ?? 99) - (b.no ?? 99));
}
export function wkblPosKo(pos: string | null | undefined): string { return (pos && WKBL_POS_KO[pos]) || pos || ""; }
/** 이름+팀으로 pno 찾기 (부문별 순위표엔 이름만 온다) */
export function wkblFindByName(name: string, team?: string): WkblPlayer | null {
  const cands = [...BY_ID.values()].filter((p) => p.name === name);
  if (cands.length === 1 || !team) return cands[0] ?? null;
  return cands.find((p) => p.team && team.includes(p.team.replace(/\s/g, "").slice(0, 2))) ?? cands[0] ?? null;
}
