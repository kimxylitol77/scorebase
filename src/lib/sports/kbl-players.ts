// KBL 등록 선수 사전 — data/kbl-players.json (scripts/build-kbl-players.ts 주간 빌드) 읽기 전용 로더.
// 팀 페이지 로스터·선수 페이지 헤더/메타·리더보드 사진이 본다. 통계는 kbl-api 런타임 fetch.
import raw from "../../../data/kbl-players.json";
import { KBL_POS_KO } from "./kbl-api";

export interface KblPlayer {
  id: string; // playerNo
  name: string;
  ename: string;
  teamCode: string;
  teamId: number | null;
  team: string | null; // 공식 한글 팀명
  no: number | null;
  pos: string; // GD / FD / C
  height: number | null;
  weight: number | null;
  draft: string | null;
  birth: string | null;
  country: string | null;
  school: string | null;
  photo: string;
}

const FILE = raw as { meta?: { updatedAt?: string }; players: Record<string, Omit<KblPlayer, "id">> };
const BY_ID = new Map<string, KblPlayer>();
const BY_TEAM = new Map<number, KblPlayer[]>();
for (const [id, p] of Object.entries(FILE.players ?? {})) {
  const e: KblPlayer = { id, ...p };
  BY_ID.set(id, e);
  if (e.teamId != null) {
    if (!BY_TEAM.has(e.teamId)) BY_TEAM.set(e.teamId, []);
    BY_TEAM.get(e.teamId)!.push(e);
  }
}

export function kblPlayer(id: string | null | undefined): KblPlayer | null {
  return id ? (BY_ID.get(String(id)) ?? null) : null;
}

/** 우리 Team.id → 로스터 (가드→포워드→센터, 같은 포지션은 등번호순) */
export function kblRoster(teamId: number): KblPlayer[] {
  const order: Record<string, number> = { GD: 0, FD: 1, C: 2 };
  return [...(BY_TEAM.get(teamId) ?? [])].sort(
    (a, b) => (order[a.pos] ?? 3) - (order[b.pos] ?? 3) || (a.no ?? 99) - (b.no ?? 99),
  );
}

export function kblPosKo(pos: string | null | undefined): string {
  return (pos && KBL_POS_KO[pos]) || pos || "";
}

export function kblAge(birth: string | null | undefined, now = new Date()): number | null {
  if (!birth) return null;
  const b = new Date(birth);
  if (Number.isNaN(b.getTime())) return null;
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

export const KBL_PLAYERS_UPDATED_AT = FILE.meta?.updatedAt ?? null;
