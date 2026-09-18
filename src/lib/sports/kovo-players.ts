// V-리그 현역 선수 사전 — data/kovo-players.json (scripts/build-kovo-players.ts 주간 빌드) 읽기 전용 로더.
import raw from "../../../data/kovo-players.json";
import { KOVO_POS_KO } from "./kovo-api";

export interface KovoPlayer {
  id: string; name: string; league: "V_LEAGUE" | "V_LEAGUE_W"; teamCode: string; teamId: number; team: string;
  no: number | null; pos: string; birth: string | null; height: number | null; weight: number | null;
  school: string | null; photo: string | null; foreign: boolean; history: string[];
}
const FILE = raw as { meta?: { updatedAt?: string }; players: Record<string, Omit<KovoPlayer, "id">> };
const BY_ID = new Map<string, KovoPlayer>();
const BY_TEAM = new Map<number, KovoPlayer[]>();
for (const [id, p] of Object.entries(FILE.players ?? {})) {
  const e: KovoPlayer = { id, ...p };
  BY_ID.set(id, e);
  if (!BY_TEAM.has(e.teamId)) BY_TEAM.set(e.teamId, []);
  BY_TEAM.get(e.teamId)!.push(e);
}
export function kovoPlayer(id: string | null | undefined): KovoPlayer | null { return id ? (BY_ID.get(String(id)) ?? null) : null; }
const POS_ORDER: Record<string, number> = { S: 0, OH: 1, OP: 2, MB: 3, L: 4, Li: 4 };
export function kovoRoster(teamId: number): KovoPlayer[] {
  return [...(BY_TEAM.get(teamId) ?? [])].sort((a, b) => (POS_ORDER[a.pos] ?? 5) - (POS_ORDER[b.pos] ?? 5) || (a.no ?? 99) - (b.no ?? 99));
}
export function kovoPosKo(pos: string | null | undefined): string { return (pos && KOVO_POS_KO[pos]) || pos || ""; }
