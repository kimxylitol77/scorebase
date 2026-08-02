// 선발 매치업 카드 공용 헬퍼 — 카드 컴포넌트(/predictions/starters)와 OG 이미지가 같은 규칙을 쓰도록.
import { kboPhotoUrl } from "@/lib/sports/kbo-official";
import { mlbHeadshotUrl } from "@/lib/sports/mlb-stats-api";
import { toKoreanPlayerName } from "@/lib/player-names";

export interface StarterJson {
  name?: string;
  pid?: number | string;
  photoUrl?: string;
  era?: number;
  whip?: number;
  k9?: number;
  wins?: number;
  losses?: number;
  ip?: string;
  hand?: string;
  recentEra?: number;
  recentIp?: number;
}

export function parseStarter(raw: unknown): StarterJson | null {
  if (!raw) return null;
  try {
    const o = typeof raw === "string" ? JSON.parse(raw) : raw;
    return o && typeof o === "object" ? (o as StarterJson) : null;
  } catch {
    return null;
  }
}

/** 리그별 선발 사진 URL — KBO 네이버 CDN·MLB 공식·NPB npb.jp(cron 이 enrich 시 photoUrl 저장). */
export function pitcherPhoto(league: string, s: StarterJson | null): string | null {
  if (s?.photoUrl) return s.photoUrl; // NPB — cron 이 npb.jp profile HTML 에서 추출해 저장
  if (!s?.pid) return null;
  if (league === "KBO") return kboPhotoUrl(s.pid);
  if (league === "MLB") return mlbHeadshotUrl(Number(s.pid));
  return null;
}

/** 선발 표시명 — MLB 만 소스가 영문이라 사전 변환. KBO·NPB 는 수집 시점부터 DB 가 한글이라 그대로. */
export function starterName(league: string, s: StarterJson | null | undefined): string {
  const raw = s?.name?.trim();
  if (!raw) return "";
  return league === "MLB" ? toKoreanPlayerName(raw) : raw;
}

export const fmtStat = (v: number | undefined, d = 2) =>
  v == null || Number.isNaN(v) ? "—" : v.toFixed(d);

/** 보여줄 지표가 하나라도 있나 — 전무하면 빈 타일 대신 "시즌 기록 미집계" 를 띄운다.
 *  (예: 올 시즌 첫 등판 예정 투수는 소스에 시즌 성적이 아예 없다) */
export const hasStats = (s: StarterJson | null | undefined) =>
  s != null && (s.era != null || s.whip != null || s.k9 != null || s.recentEra != null);
