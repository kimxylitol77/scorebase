// NHL 라이브 매치 선수명 — TheSports player_id → 한글 이름 (data/nhl-player-names-haiku.json).
// 주간 cron(weekly-static-refresh)이 갱신하는 json. Vercel 은 이 파일만 읽어
// incidents/players 의 player_id 를 표시명으로 변환 (TheSports 직접 호출 불필요 — IP whitelist 회피).
import raw from "../../../data/nhl-player-names-haiku.json";

const MAP = raw as Record<string, { ko: string; en: string; pos?: string }>;

/** player_id → 한글 이름 (없으면 영문, 둘 다 없으면 빈 문자열) */
export function nhlPlayerKo(id: string | undefined | null): string {
  if (!id) return "";
  const e = MAP[id];
  return e?.ko || e?.en || "";
}

/** player_id → 전체 정보 (한글·영문·포지션) */
export function nhlPlayerInfo(
  id: string | undefined | null,
): { ko: string; en: string; pos?: string } | null {
  if (!id) return null;
  return MAP[id] ?? null;
}
