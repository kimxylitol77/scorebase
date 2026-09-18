// KHL 선수 사전 — data/khl-players.json (scripts/build-khl-players.ts 주간 빌드) 읽기 전용 로더.
// 팀 페이지 로스터(팀별 F/D/G)·리더보드 선수명·사진·라이브 이름 폴백이 이 파일을 본다. Vercel 은 ts 호출 없이 json 만 읽는다.
import raw from "../../../data/khl-players.json";

export interface KhlPlayer {
  id: string;
  en: string;
  ko?: string;
  short?: string;
  pos?: string; // F / D / G
  no?: number;
  teamTs: string;
  teamId: number;
  photo?: string;
  birth?: string; // YYYY-MM-DD
  height?: number;
  weight?: number;
  nat?: string;
  natKo?: string;
}

const FILE = raw as { meta?: { updatedAt?: string }; players: Record<string, Omit<KhlPlayer, "id">> };
const BY_ID = new Map<string, KhlPlayer>();
const BY_TEAM = new Map<number, KhlPlayer[]>();
for (const [id, p] of Object.entries(FILE.players ?? {})) {
  const e: KhlPlayer = { id, ...p };
  BY_ID.set(id, e);
  if (!BY_TEAM.has(e.teamId)) BY_TEAM.set(e.teamId, []);
  BY_TEAM.get(e.teamId)!.push(e);
}

export const KHL_PLAYERS_UPDATED_AT = FILE.meta?.updatedAt ?? null;

/** ts player_id → 선수 (없으면 null) */
export function khlPlayerInfo(id: string | null | undefined): KhlPlayer | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}

/** 우리 Team.id → 로스터 (포지션 G→D→F 순, 같은 포지션은 등번호순) */
export function khlRoster(teamId: number): KhlPlayer[] {
  const order: Record<string, number> = { G: 0, D: 1, F: 2 };
  return [...(BY_TEAM.get(teamId) ?? [])].sort(
    (a, b) => (order[a.pos ?? ""] ?? 3) - (order[b.pos ?? ""] ?? 3) || (a.no ?? 99) - (b.no ?? 99),
  );
}

/** 표시명 — 한글 우선, 없으면 영문 */
export function khlPlayerName(p: Pick<KhlPlayer, "ko" | "en">): string {
  return p.ko || p.en;
}

/** 생년월일 → 만 나이 (없으면 null) */
export function khlAge(birth: string | undefined, now = new Date()): number | null {
  if (!birth) return null;
  const b = new Date(birth);
  if (Number.isNaN(b.getTime())) return null;
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) age--;
  return age;
}
