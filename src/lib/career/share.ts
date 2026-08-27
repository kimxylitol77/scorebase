// 커리어 결과 공유 — 결과를 URL 쿼리에 담았다 되꺼낸다 (게임이 서버·DB 를 안 쓰므로 저장할 곳이 없다)
import type { CareerState } from "./types";
import type { CareerSummary } from "./engine";
import { NATION_BY_CODE } from "./nations";

export interface ShareData {
  nation: string;
  position: string;
  peakOvr: number;
  peakValue: number;
  apps: number;
  goals: number;
  assists: number;
  titles: number;
  clubs: number;
  caps: number;
  /** 커리어에서 가장 높은 티어의 구단 — 자랑거리 */
  topClub: string;
}

/** 가장 높은 티어(동률이면 능력치가 높았던 때)의 구단명 */
export function topClubOf(state: CareerState): string {
  let best = state.history[0];
  for (const s of state.history) {
    if (!best || s.club.t < best.club.t || (s.club.t === best.club.t && s.ovr > best.ovr)) best = s;
  }
  return best?.club.n ?? "";
}

export function buildShareParams(state: CareerState, sum: CareerSummary): URLSearchParams {
  return new URLSearchParams({
    n: state.nation,
    p: state.position,
    o: String(sum.peakOvr),
    v: String(Math.round(sum.peakValue)),
    a: String(sum.apps),
    g: String(sum.goals),
    s: String(sum.assists),
    t: String(sum.titles),
    c: String(sum.clubs),
    cp: String(state.caps),
    cl: topClubOf(state),
  });
}

/** 정수 파라미터를 범위 안으로 강제한다. URL 은 누구나 고칠 수 있으므로 값을 믿지 않는다. */
function clampInt(raw: string | null, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** 카드에 그려넣을 문자열 — 제어문자 제거 + 길이 제한 */
function safeText(raw: string | null, maxLen: number): string {
  if (!raw) return "";
  return raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maxLen);
}

export function parseShareParams(sp: URLSearchParams): ShareData | null {
  const nation = safeText(sp.get("n"), 4).toUpperCase();
  if (!NATION_BY_CODE[nation]) return null;
  const position = safeText(sp.get("p"), 2).toUpperCase();
  if (!["GK", "DF", "MF", "FW"].includes(position)) return null;

  return {
    nation,
    position,
    peakOvr: clampInt(sp.get("o"), 40, 99),
    peakValue: clampInt(sp.get("v"), 0, 999),
    apps: clampInt(sp.get("a"), 0, 9999),
    goals: clampInt(sp.get("g"), 0, 9999),
    assists: clampInt(sp.get("s"), 0, 9999),
    titles: clampInt(sp.get("t"), 0, 99),
    clubs: clampInt(sp.get("c"), 0, 99),
    caps: clampInt(sp.get("cp"), 0, 999),
    topClub: safeText(sp.get("cl"), 24),
  };
}

const POSITION_LABEL: Record<string, string> = {
  GK: "골키퍼", DF: "수비수", MF: "미드필더", FW: "공격수",
};

export function positionLabel(code: string): string {
  return POSITION_LABEL[code] ?? code;
}

/** "대한민국 미드필더 · 통산 673경기 136골" 같은 한 줄 요약 */
export function shareHeadline(d: ShareData): string {
  const nat = NATION_BY_CODE[d.nation];
  return `${nat?.label ?? d.nation} ${positionLabel(d.position)} · 통산 ${d.apps}경기 ${d.goals}골`;
}
