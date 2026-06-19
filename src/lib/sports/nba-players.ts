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
  bdlId?: number;
  // TheSports basketball player/list 보강 (enrich-nba-players-thesports.ts)
  tsId?: string;
  birthday?: number; // unix sec
  city?: string; // 출생지 "Akron, OH"
  careerAge?: number; // 리그 경력연수
  salary?: number; // 연봉 USD (슈퍼스타만 채워짐)
  drafted?: string; // "1997:Rd 1,Pk 11"
  school?: string;
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
  /** balldontlie id — /players/{bdlId}?league=NBA 선수 상세 연결용. 매칭 실패 시 undefined. */
  bdlId?: number;
  // TheSports 보강 프로필 (선수 상세 페이지 헤더용)
  birthday?: number;
  city?: string;
  careerAge?: number;
  salary?: number;
  drafted?: string;
  school?: string;
}

/** 영문 선수명 → {한글명·사진·bdlId}. 매칭 실패 시 null. */
export function lookupNbaPlayer(name: string | null | undefined): NbaPlayerInfo | null {
  if (!name) return null;
  const e = INDEX[normKey(name)];
  if (!e) return null;
  return {
    ko: e.ko || name, photo: e.photo, espnId: e.espnId, pos: e.pos, bdlId: e.bdlId,
    birthday: e.birthday, city: e.city, careerAge: e.careerAge, salary: e.salary, drafted: e.drafted, school: e.school,
  };
}

/** balldontlie 선수 상세 href — bdlId 있을 때만. */
export function nbaPlayerHref(info: NbaPlayerInfo | null): string | null {
  return info?.bdlId != null ? `/players/${info.bdlId}?league=NBA` : null;
}
