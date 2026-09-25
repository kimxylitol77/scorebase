// UEFA 클럽대회(UCL·UEL·UECL) 리그페이즈 규칙 — 단계 판정·일정 탭 묶음 키·진출 구역.
// 공식 포맷(2024-25~): 36팀 단일 리그페이즈, 1~8위 16강 직행, 9~24위 녹아웃 플레이오프, 25위 이하 탈락.
// 리그페이즈 경기 수는 UCL·UEL 8경기, UECL 6경기. prisma 없음(테스트용).
import { stageKo } from "./cup-journey";

export const UEFA_LEAGUE_PHASE: Readonly<Record<string, { matchdays: number }>> = {
  UCL: { matchdays: 8 },
  UEL: { matchdays: 8 },
  UECL: { matchdays: 6 },
};

/** 16강 직행 / 녹아웃 플레이오프 마지막 순위 */
export const UEFA_DIRECT_R16 = 8;
export const UEFA_PLAYOFF_LAST = 24;

/** 일정 탭 묶음 키 — 0 = 예선(리그페이즈 전), 1~8 = 리그페이즈 라운드, 9~ = 녹아웃 */
export const UEFA_QUALIFYING_KEY = 0;
const KNOCKOUT_ORDER = ["플레이오프", "16강", "8강", "4강", "결승"] as const;
export const UEFA_KNOCKOUT_BASE = 9;

export interface UefaStage {
  /** 리그페이즈면 라운드 번호, 아니면 null */
  leagueRound: number | null;
  /** 원문 단계 이름(ts stageName / af round) */
  label: string;
}

/** raw 에서 단계 — ts {"thesports":{"round":{stageName,roundNum}}} 또는 af {"league":{"round":"League Stage - 3"}} */
export function uefaStage(raw: string | null): UefaStage | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as {
      thesports?: { round?: { stageName?: string | null; roundNum?: number } };
      league?: { round?: string };
    };
    const ts = j.thesports?.round;
    if (ts?.stageName) {
      const isLeague = /^league (phase|round|stage)$/i.test(ts.stageName.trim());
      return { leagueRound: isLeague && ts.roundNum ? ts.roundNum : null, label: ts.stageName.trim() };
    }
    const af = j.league?.round;
    if (af) {
      const m = af.match(/^league (?:phase|stage|round)\s*-\s*(\d+)$/i);
      return { leagueRound: m ? Number(m[1]) : null, label: af.trim() };
    }
  } catch {
    // 깨진 raw 는 단계 미상
  }
  return null;
}

/**
 * 일정 탭 묶음 키.
 * - 리그페이즈 라운드 → 그 번호
 * - 리그페이즈 첫 경기보다 앞선 경기(예선·예선 플레이오프) → 0
 * - 뒤의 경기 → 녹아웃 단계 순서(플레이오프 9, 16강 10 … 결승 13). 모르는 이름은 null
 */
export function uefaFixtureKey(stage: UefaStage | null, startTime: Date, leaguePhaseStart: Date | null): number | null {
  if (stage?.leagueRound) return stage.leagueRound;
  if (!leaguePhaseStart || startTime < leaguePhaseStart) return UEFA_QUALIFYING_KEY;
  if (!stage) return null;
  const ko = /play-?offs?/i.test(stage.label) ? "플레이오프" : stageKo(stage.label);
  const i = KNOCKOUT_ORDER.indexOf(ko as (typeof KNOCKOUT_ORDER)[number]);
  return i >= 0 ? UEFA_KNOCKOUT_BASE + i : null;
}

/** 묶음 키 이름 — 선택 상자·칩 */
export function uefaFixtureKeyName(key: number): { chip: string; option: string } {
  if (key === UEFA_QUALIFYING_KEY) return { chip: "예선", option: "예선" };
  if (key >= UEFA_KNOCKOUT_BASE) {
    const n = KNOCKOUT_ORDER[key - UEFA_KNOCKOUT_BASE] ?? "녹아웃";
    return { chip: n, option: n };
  }
  return { chip: `${key}R`, option: `리그페이즈 ${key}라운드` };
}

export type UefaZone = "r16" | "playoff" | "out";

/** 최종 순위 → 구역 */
export function uefaZone(position: number): UefaZone {
  if (position <= UEFA_DIRECT_R16) return "r16";
  if (position <= UEFA_PLAYOFF_LAST) return "playoff";
  return "out";
}
