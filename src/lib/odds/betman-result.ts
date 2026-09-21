// 베트맨 프로토 결과 코드·AI 판정·회차 집계·배당 변동 요약 — 순수 함수만 (prisma 없음, 테스트 대상).
// 코드표 근거는 reports/plans/betman-proto-round/context-notes.md (raw 260112 + DB 대조로 확정).

/** 베트맨 gameResult — 0 승(win 쪽) · 1 무(draw 쪽) · 2 패(lose 쪽) · 4 적특(취소·환불). null 은 미판정. */
export type BetmanResultCode = "0" | "1" | "2" | "4";

export type LineKind = "1x2" | "wl" | "handicap" | "ou" | "oddeven" | "winN";

/** betTypNm("일반 소수핸디캡")·betNm("야구 승1패") → 라인 종류 */
export function lineKind(betTypNm: string | null, betNm: string | null): LineKind {
  const t = betTypNm ?? "";
  const n = betNm ?? "";
  if (t.includes("언더오버")) return "ou";
  if (t.includes("홀짝")) return "oddeven";
  if (t.includes("핸디캡")) return "handicap";
  if (t.includes("승N패") || /승\d+패/.test(n)) return "winN";
  if (t.includes("승무패")) return "1x2";
  return "wl";
}

export interface ResultLabel {
  text: string;
  side: "win" | "draw" | "lose" | "void";
}

/**
 * 결과 코드 → 화면 라벨. 라인 종류마다 양쪽 이름이 다르다(승무패=홈/원정, 언더오버=언더/오버, 홀짝=홀/짝).
 * 언더오버는 winAllot 쪽이 언더다(베트맨 winTxt 실측) — 뒤집지 말 것.
 */
export function resultLabel(code: string | null, kind: LineKind, betNm: string | null): ResultLabel | null {
  if (code == null) return null;
  if (code === "4") return { text: "적특", side: "void" };
  const n = betNm?.match(/승(\d+)패/)?.[1];
  const table: Record<LineKind, Partial<Record<"0" | "1" | "2", string>>> = {
    "1x2": { "0": "홈승", "1": "무", "2": "원정승" },
    wl: { "0": "홈승", "1": "무", "2": "원정승" },
    handicap: { "0": "핸디 홈승", "1": "핸디 무", "2": "핸디 원정승" },
    ou: { "0": "언더", "2": "오버" },
    oddeven: { "0": "홀", "2": "짝" },
    winN: { "0": "홈승", "1": n ? `${n}점차` : "무", "2": "원정승" },
  };
  const text = table[kind][code as "0" | "1" | "2"];
  if (!text) return null;
  return { text, side: code === "0" ? "win" : code === "1" ? "draw" : "lose" };
}

export type AiVerdict = "hit" | "miss" | "void" | "pending";

const PICK_CODE: Record<string, BetmanResultCode> = { HOME: "0", DRAW: "1", AWAY: "2" };

/** 우리 1X2 픽 vs 베트맨 공식 판정. 픽이 없으면 null(도장 없음). */
export function aiVerdict(predWinner: string | null | undefined, code: string | null | undefined): AiVerdict | null {
  if (!predWinner || !(predWinner in PICK_CODE)) return null;
  if (code == null) return "pending";
  if (code === "4") return "void";
  return PICK_CODE[predWinner] === code ? "hit" : "miss";
}

export interface RoundSummary {
  /** 픽이 있는 기본형 라인 수 */
  total: number;
  /** 판정 완료(적특 제외) */
  scored: number;
  hit: number;
  void: number;
  pending: number;
  bySport: Record<string, { scored: number; hit: number }>;
}

/** 회차 안 기본형 라인들의 AI 적중 집계. 적특·미판정은 분모에서 뺀다(정배당 정산 규칙과 동일). */
export function summarizeRound(
  rows: Array<{ itemCode: string | null; predWinner: string | null; gameResult: string | null }>,
): RoundSummary {
  const s: RoundSummary = { total: 0, scored: 0, hit: 0, void: 0, pending: 0, bySport: {} };
  for (const r of rows) {
    const v = aiVerdict(r.predWinner, r.gameResult);
    if (v == null) continue;
    s.total++;
    if (v === "void") { s.void++; continue; }
    if (v === "pending") { s.pending++; continue; }
    s.scored++;
    const sp = s.bySport[r.itemCode ?? "-"] ?? { scored: 0, hit: 0 };
    sp.scored++;
    if (v === "hit") { s.hit++; sp.hit++; }
    s.bySport[r.itemCode ?? "-"] = sp;
  }
  return s;
}

export interface ChangeRow {
  changedAt: string;
  beforeWin: number | null; afterWin: number | null;
  beforeDraw: number | null; afterDraw: number | null;
  beforeLose: number | null; afterLose: number | null;
  beforeWinHandi: number | null; afterWinHandi: number | null;
}

export interface SideMove { from: number; to: number; dir: "up" | "down" | "flat" }
export interface ChangeSummary {
  count: number;
  win: SideMove | null;
  draw: SideMove | null;
  lose: SideMove | null;
  /** 핸디 라인이 바뀐 적이 있으면 처음→마지막 */
  handi: { from: number; to: number } | null;
  lastAt: string;
}

/**
 * 한 라인의 변경 이력 → "회차 첫 배당 → 현재" 요약. 이력은 시각순으로 정렬해 첫 before 와 마지막 after 를 잡는다.
 * 배당이 없던 쪽(승패형 무 배당 0)은 null.
 */
export function summarizeChanges(rows: ChangeRow[]): ChangeSummary | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => a.changedAt.localeCompare(b.changedAt));
  const first = sorted[0], last = sorted[sorted.length - 1];
  const move = (from: number | null, to: number | null): SideMove | null => {
    if (from == null || to == null || from <= 0 || to <= 0) return null;
    return { from, to, dir: to > from ? "up" : to < from ? "down" : "flat" };
  };
  const handi =
    first.beforeWinHandi != null && last.afterWinHandi != null && first.beforeWinHandi !== last.afterWinHandi
      ? { from: first.beforeWinHandi, to: last.afterWinHandi }
      : null;
  return {
    count: rows.length,
    win: move(first.beforeWin, last.afterWin),
    draw: move(first.beforeDraw, last.afterDraw),
    lose: move(first.beforeLose, last.afterLose),
    handi,
    lastAt: last.changedAt,
  };
}

/** 260111 → "2026년 111회차" */
export function roundLabel(gmTs: number): string {
  // 260111 = 26(연도) + 0111(회차) — 회차는 네 자리다.
  const year = 2000 + Math.floor(gmTs / 10000);
  const no = gmTs % 10000;
  return `${year}년 ${no}회차`;
}

/** 베트맨 CHG_DTM("20260921130320863455", KST) → Date. 14자리 미만이면 null. */
export function parseChgDtm(s: string | null | undefined): Date | null {
  if (!s || s.length < 14) return null;
  const y = +s.slice(0, 4), mo = +s.slice(4, 6), d = +s.slice(6, 8), h = +s.slice(8, 10), mi = +s.slice(10, 12), se = +s.slice(12, 14);
  if (![y, mo, d, h, mi, se].every(Number.isFinite)) return null;
  return new Date(Date.UTC(y, mo - 1, d, h - 9, mi, se));
}

/** tooltipList 배당은 x100 정수(159 = 1.59). 0 은 "배당 없음". */
export function oddsX100(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) / 100 : null;
}
