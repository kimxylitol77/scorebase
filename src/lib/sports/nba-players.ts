// NBA 선수 룩업 — 영문명 → 한글명 + ESPN 사진. data/nba-players.json (build-nba-players.ts 생성).
// 트랜잭션·연봉 페이지가 영문 선수명으로 한글·사진을 붙일 때 사용.
// 매칭 실패(방출 선수 등 현 로스터 부재)는 null → 페이지에서 영문 + 이니셜 fallback.

import rawIndex from "../../../data/nba-players.json";

interface PlayerEntry {
  name: string;
  ko: string;
  photo: string;
  espnId: string;
  pos: string | null;
}

const INDEX = rawIndex as Record<string, PlayerEntry>;

/** build-nba-players.ts 와 동일 정규화 — 악센트·suffix·구두점 제거. */
function normKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'']/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface NbaPlayerInfo {
  ko: string;
  photo: string;
  espnId: string;
  pos: string | null;
}

/** 영문 선수명 → {한글명·사진}. 매칭 실패 시 null. */
export function lookupNbaPlayer(name: string | null | undefined): NbaPlayerInfo | null {
  if (!name) return null;
  const e = INDEX[normKey(name)];
  if (!e) return null;
  return { ko: e.ko || name, photo: e.photo, espnId: e.espnId, pos: e.pos };
}
