// 선발 매치업 카드 공용 헬퍼 — 카드 컴포넌트(/predictions/starters)와 OG 이미지가 같은 규칙을 쓰도록.
import { kboPhotoUrl } from "@/lib/sports/kbo-official";
import { mlbHeadshotUrl } from "@/lib/sports/mlb-stats-api";
import { toKoreanPlayerName } from "@/lib/player-names";
import { npbPlayerToKorean } from "@/lib/sports/npb-player-names";

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

/**
 * 선발 표시명 — /scores 의 localizeStarter 와 같은 방어 규칙.
 *
 * "KBO·NPB 는 DB 가 한글"이라는 종전 가정은 매일 아침 무너진다 — NPB 선발 발표 직후
 * 원문(한자)이 DB 에 잠깐 들어오는 창이 있고(2026-08-19 실측 10:52 원문 노출 → 11:00
 * cron 이 한글로 갱신), 그동안 이 헬퍼가 원문을 그대로 그려 synthetic 알림이 매일 왔다.
 * content-quality 탐지기는 "화면이 렌더 시 음역한다"를 가정하므로 이 경로만 사각이었다.
 */
export function starterName(league: string, s: StarterJson | null | undefined): string {
  const raw = s?.name?.trim();
  if (!raw) return "";
  if (league === "NPB") {
    // 깨진 mid-conversion(한글+카나 혼합)은 이름을 숨긴다 — /scores 와 동일
    if (/[가-힣]/.test(raw) && /[぀-ゟ゠-ヿ]/.test(raw)) return "";
    return npbPlayerToKorean(raw);
  }
  if (/[가-힣]/.test(raw)) return raw;
  return toKoreanPlayerName(raw) || raw;
}

export const fmtStat = (v: number | undefined, d = 2) =>
  v == null || Number.isNaN(v) ? "—" : v.toFixed(d);

/** 보여줄 지표가 하나라도 있나 — 전무하면 빈 타일 대신 "시즌 기록 미집계" 를 띄운다.
 *  (예: 올 시즌 첫 등판 예정 투수는 소스에 시즌 성적이 아예 없다) */
export const hasStats = (s: StarterJson | null | undefined) =>
  s != null && (s.era != null || s.whip != null || s.k9 != null || s.recentEra != null);
