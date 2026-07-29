// 선발 매치업 카드 공용 헬퍼 — 카드 컴포넌트(/predictions/starters)와 OG 이미지가 같은 규칙을 쓰도록.
import { kboPhotoUrl } from "@/lib/sports/kbo-official";
import { mlbHeadshotUrl } from "@/lib/sports/mlb-stats-api";

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

export const fmtStat = (v: number | undefined, d = 2) =>
  v == null || Number.isNaN(v) ? "—" : v.toFixed(d);
