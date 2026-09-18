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

export interface KhlInjury {
  playerId: string;
  teamId: number;
  /** ts 원본(reason·start_time·end_time 등). 실데이터가 들어오면 여기서 라벨을 뽑는다. */
  raw: Record<string, unknown>;
}

const FILE = raw as {
  meta?: { updatedAt?: string; injuries?: number; injuriesCheckedAt?: string };
  players: Record<string, Omit<KhlPlayer, "id">>;
  injuries?: KhlInjury[];
};
const BY_ID = new Map<string, KhlPlayer>();
const BY_TEAM = new Map<number, KhlPlayer[]>();
for (const [id, p] of Object.entries(FILE.players ?? {})) {
  const e: KhlPlayer = { id, ...p };
  BY_ID.set(id, e);
  if (!BY_TEAM.has(e.teamId)) BY_TEAM.set(e.teamId, []);
  BY_TEAM.get(e.teamId)!.push(e);
}

export const KHL_PLAYERS_UPDATED_AT = FILE.meta?.updatedAt ?? null;

const INJURY_BY_PLAYER = new Map<string, KhlInjury>();
const INJURY_BY_TEAM = new Map<number, KhlInjury[]>();
for (const i of FILE.injuries ?? []) {
  INJURY_BY_PLAYER.set(i.playerId, i);
  if (!INJURY_BY_TEAM.has(i.teamId)) INJURY_BY_TEAM.set(i.teamId, []);
  INJURY_BY_TEAM.get(i.teamId)!.push(i);
}

/** 팀 부상자 (TheSports team/injury/list 주간 스냅샷). 비어 있으면 "부상자 없음"이 아니라 "제공 데이터 없음"일 수 있다. */
export function khlInjuries(teamId: number): KhlInjury[] {
  return INJURY_BY_TEAM.get(teamId) ?? [];
}

export function khlInjuryOf(playerId: string): KhlInjury | null {
  return INJURY_BY_PLAYER.get(playerId) ?? null;
}

/** ts 부상 원본에서 표시 문구 — reason/type/injury 중 문자열 첫 것, 없으면 "부상" */
export function khlInjuryLabel(i: KhlInjury): string {
  for (const k of ["reason", "type", "injury", "description"]) {
    const v = i.raw[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "부상";
}

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
