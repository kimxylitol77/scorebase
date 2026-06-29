// 2026 FIFA 월드컵 녹아웃 브래킷 빌더 — Match 73~104 고정 슬롯 규칙 백본.
//
// 2026 녹아웃은 추첨이 아니라 사전 확정 슬롯이다(FIFA 공식). 조 1·2위는 조별 순위로
// 바로 해석하고, 조 3위 8팀의 슬롯 배정(Annex C 495조합)은 실제 draw 발표 전엔 알 수 없어
// 후보 조 라벨로 둔다. 실제 녹아웃 fixture 가 들어오면 한쪽만 매칭돼도 상대(3위)를 해석하고,
// 종료된 경기의 승자를 다음 라운드로 전파(cascade)해 라이브 브래킷이 된다.

import { calcWinProbability } from "./win-probability";
import { WORLD_CUP_GROUPS, getWorldCupSeedElo } from "./world-cup-elos";
import type { WcGroupTeamRow } from "@/lib/sports/world-cup-standings";
import { fifaCountryKo, fifaFlag } from "@/lib/sports/fifa-rankings";
import { toKoreanTeamName } from "@/lib/team-names";

export type WcRound = "r32" | "r16" | "qf" | "sf" | "final" | "third";

export const WC_ROUND_LABEL: Record<WcRound, string> = {
  r32: "32강",
  r16: "16강",
  qf: "8강",
  sf: "4강",
  final: "결승",
  third: "3·4위전",
};

export const WC_ROUND_DATES: Record<WcRound, string> = {
  r32: "6.28 ~ 7.3",
  r16: "7.4 ~ 7.7",
  qf: "7.9 ~ 7.11",
  sf: "7.14 ~ 7.15",
  final: "7.19",
  third: "7.18",
};

/** 슬롯 한쪽 출처 (해석 전) */
type SlotSource =
  | { kind: "group"; group: string; pos: 1 | 2 }
  | { kind: "third"; candidates: string[] }
  | { kind: "winner"; matchNo: number }
  | { kind: "loser"; matchNo: number };

interface SlotTemplate {
  matchNo: number;
  round: WcRound;
  /** 미러링 트리에서 어느 쪽 절반 (center=결승·3·4위전) */
  half: "top" | "bottom" | "center";
  /** 컬럼 내 위·아래 정렬 순서 (connector 정합) */
  order: number;
  home: SlotSource;
  away: SlotSource;
}

const g = (group: string, pos: 1 | 2): SlotSource => ({ kind: "group", group, pos });
const t3 = (...candidates: string[]): SlotSource => ({ kind: "third", candidates });
const w = (matchNo: number): SlotSource => ({ kind: "winner", matchNo });
const l = (matchNo: number): SlotSource => ({ kind: "loser", matchNo });

// 고정 슬롯 템플릿. half/order 는 좌우 미러링 트리용:
//   top    = M101(상단 4강) 으로 모이는 가지 — 좌측 (위→아래)
//   bottom = M102(하단 4강) 으로 모이는 가지 — 우측 (위→아래)
// R16 페어: 89=W74·W77 90=W73·W75 / 93=W83·W84 94=W81·W82  (top)
//           91=W76·W78 92=W79·W80 / 95=W86·W88 96=W85·W87  (bottom)
const SLOT_TEMPLATE: SlotTemplate[] = [
  // ── 32강 (top half, 좌측 위→아래) ──
  { matchNo: 74, round: "r32", half: "top", order: 0, home: g("E", 1), away: t3("A", "B", "C", "D", "F") },
  { matchNo: 77, round: "r32", half: "top", order: 1, home: g("I", 1), away: t3("C", "D", "F", "G", "H") },
  { matchNo: 73, round: "r32", half: "top", order: 2, home: g("A", 2), away: g("B", 2) },
  { matchNo: 75, round: "r32", half: "top", order: 3, home: g("F", 1), away: g("C", 2) },
  { matchNo: 83, round: "r32", half: "top", order: 4, home: g("K", 2), away: g("L", 2) },
  { matchNo: 84, round: "r32", half: "top", order: 5, home: g("H", 1), away: g("J", 2) },
  { matchNo: 81, round: "r32", half: "top", order: 6, home: g("D", 1), away: t3("B", "E", "F", "I", "J") },
  { matchNo: 82, round: "r32", half: "top", order: 7, home: g("G", 1), away: t3("A", "E", "H", "I", "J") },
  // ── 32강 (bottom half, 우측 위→아래) ──
  { matchNo: 76, round: "r32", half: "bottom", order: 0, home: g("C", 1), away: g("F", 2) },
  { matchNo: 78, round: "r32", half: "bottom", order: 1, home: g("E", 2), away: g("I", 2) },
  { matchNo: 79, round: "r32", half: "bottom", order: 2, home: g("A", 1), away: t3("C", "E", "F", "H", "I") },
  { matchNo: 80, round: "r32", half: "bottom", order: 3, home: g("L", 1), away: t3("E", "H", "I", "J", "K") },
  { matchNo: 86, round: "r32", half: "bottom", order: 4, home: g("J", 1), away: g("H", 2) },
  { matchNo: 88, round: "r32", half: "bottom", order: 5, home: g("D", 2), away: g("G", 2) },
  { matchNo: 85, round: "r32", half: "bottom", order: 6, home: g("B", 1), away: t3("E", "F", "G", "I", "J") },
  { matchNo: 87, round: "r32", half: "bottom", order: 7, home: g("K", 1), away: t3("D", "E", "I", "J", "L") },
  // ── 16강 ──
  { matchNo: 89, round: "r16", half: "top", order: 0, home: w(74), away: w(77) },
  { matchNo: 90, round: "r16", half: "top", order: 1, home: w(73), away: w(75) },
  { matchNo: 93, round: "r16", half: "top", order: 2, home: w(83), away: w(84) },
  { matchNo: 94, round: "r16", half: "top", order: 3, home: w(81), away: w(82) },
  { matchNo: 91, round: "r16", half: "bottom", order: 0, home: w(76), away: w(78) },
  { matchNo: 92, round: "r16", half: "bottom", order: 1, home: w(79), away: w(80) },
  { matchNo: 95, round: "r16", half: "bottom", order: 2, home: w(86), away: w(88) },
  { matchNo: 96, round: "r16", half: "bottom", order: 3, home: w(85), away: w(87) },
  // ── 8강 ──
  { matchNo: 97, round: "qf", half: "top", order: 0, home: w(89), away: w(90) },
  { matchNo: 98, round: "qf", half: "top", order: 1, home: w(93), away: w(94) },
  { matchNo: 99, round: "qf", half: "bottom", order: 0, home: w(91), away: w(92) },
  { matchNo: 100, round: "qf", half: "bottom", order: 1, home: w(95), away: w(96) },
  // ── 4강 ──
  { matchNo: 101, round: "sf", half: "top", order: 0, home: w(97), away: w(98) },
  { matchNo: 102, round: "sf", half: "bottom", order: 0, home: w(99), away: w(100) },
  // ── 결승 · 3·4위전 ──
  { matchNo: 104, round: "final", half: "center", order: 0, home: w(101), away: w(102) },
  { matchNo: 103, round: "third", half: "center", order: 1, home: l(101), away: l(102) },
];

/** 실제 녹아웃 fixture (page 에서 raw.league.round 파싱해 전달) */
export interface WcKnockoutFixture {
  round: WcRound;
  homeName: string;
  awayName: string;
  homeId: number;
  awayId: number;
  homeScore: number | null;
  awayScore: number | null;
  status: string; // SCHEDULED | LIVE | FINISHED
  startTime: string; // ISO
  externalId: string | null;
  /** 승부차기 등으로 확정된 승자 (없으면 정규 스코어로 판정) */
  winnerId: number | null;
}

/** 렌더용 — 슬롯 한쪽 팀(해석 결과) */
export interface BracketTeamRef {
  teamId: number | null;
  /** 영문명 (해석됐을 때) */
  name: string | null;
  nameKo: string | null;
  flag: string | null;
  /** 출신 조 */
  group: string | null;
  /** 미해석 시 라벨 ("E조 1위" / "A·B·C·D·F조 3위" / "M89 승자") */
  label: string;
  /** 조별리그 미완으로 잠정 결과 */
  provisional: boolean;
  /** 진출(승리) 측 */
  won: boolean;
  /** 탈락 측 */
  out: boolean;
}

export interface BracketSlot {
  matchNo: number;
  round: WcRound;
  half: "top" | "bottom" | "center";
  order: number;
  home: BracketTeamRef;
  away: BracketTeamRef;
  status: "SCHEDULED" | "LIVE" | "FINISHED" | null;
  homeScore: number | null;
  awayScore: number | null;
  startTime: string | null;
  externalId: string | null;
  /** 양쪽 확정+미종료 시 advance 확률 (0~1) */
  homeProb: number | null;
  awayProb: number | null;
}

const norm = (s: string) => s.toLowerCase().replace(/[\s.&'-]/g, "");
// 분음부호까지 접는 강한 정규화 — 조별(api-football)·녹아웃(TheSports) 소스 팀명 변형 흡수.
const nfold = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\s.&'-]/g, "");
const koOf = (en: string) => fifaCountryKo(en) ?? toKoreanTeamName(en) ?? en;
const eloOf = (en: string) => getWorldCupSeedElo(en) ?? 1500;

function emptyRef(label: string): BracketTeamRef {
  return { teamId: null, name: null, nameKo: null, flag: null, group: null, label, provisional: false, won: false, out: false };
}

function resolvedRef(name: string, teamId: number | null, group: string | null, provisional: boolean): BracketTeamRef {
  return {
    teamId,
    name,
    nameKo: koOf(name),
    flag: fifaFlag(name) || null,
    group,
    label: koOf(name),
    provisional,
    won: false,
    out: false,
  };
}

/** advance 확률 — 무승부(draw)는 Elo 비율 PK 로 분배. 중립 구장. */
function advanceProb(homeName: string, awayName: string): { home: number; away: number } {
  const p = calcWinProbability(eloOf(homeName), eloOf(awayName), "WORLD_CUP");
  const base = p.home + p.away || 1;
  const home = p.home + p.draw * (p.home / base);
  return { home, away: 1 - home };
}

/** 조 완료 여부 — 4팀이 모두 3경기 소화(round-robin) */
function groupComplete(rows: WcGroupTeamRow[] | undefined): boolean {
  if (!rows || rows.length < 4) return false;
  return rows.reduce((s, r) => s + r.played, 0) >= 12;
}

export function buildWcBracket(input: {
  groupStandings: Map<string, WcGroupTeamRow[]>;
  teamIdByName: Map<string, number>;
  knockout: WcKnockoutFixture[];
}): BracketSlot[] {
  const { groupStandings, teamIdByName, knockout } = input;
  const idByName = new Map<string, number>();
  for (const [n, id] of teamIdByName) idByName.set(norm(n), id);

  // 라운드별 실제 fixture 버킷
  const fxByRound = new Map<WcRound, WcKnockoutFixture[]>();
  for (const fx of knockout) {
    const arr = fxByRound.get(fx.round) ?? [];
    arr.push(fx);
    fxByRound.set(fx.round, arr);
  }

  const slots = new Map<number, BracketSlot>();
  // 각 슬롯의 승자/패자 ref (cascade 용)
  const winnerRef = new Map<number, BracketTeamRef>();
  const loserRef = new Map<number, BracketTeamRef>();

  const resolveSource = (src: SlotSource): BracketTeamRef => {
    if (src.kind === "group") {
      const rows = groupStandings.get(src.group);
      const row = rows?.find((r) => r.posInGroup === src.pos);
      const labelBase = `${src.group}조 ${src.pos}위`;
      if (!row || row.played === 0) return emptyRef(labelBase);
      const id = idByName.get(norm(row.team)) ?? null;
      const ref = resolvedRef(row.team, id, src.group, !groupComplete(rows));
      // 잠정일 땐 "E조 1위" 라벨 유지(팀명은 별도 표시). 확정이면 팀명.
      ref.label = ref.provisional ? `${labelBase} 유력` : labelBase;
      return ref;
    }
    if (src.kind === "third") {
      return emptyRef(`${src.candidates.join("·")}조 3위`);
    }
    if (src.kind === "winner") {
      return winnerRef.get(src.matchNo) ?? emptyRef(`M${src.matchNo} 승자`);
    }
    // loser (3·4위전)
    return loserRef.get(src.matchNo) ?? emptyRef(`M${src.matchNo} 패자`);
  };

  // 실제 fixture 를 슬롯에 매칭 — 양쪽/한쪽 매칭 모두. 한쪽만 알면 상대를 fixture 에서 해석.
  const overlay = (slot: BracketSlot, src: SlotTemplate) => {
    const cands = fxByRound.get(slot.round);
    if (!cands?.length) return;
    // ref(슬롯 팀)가 fixture 의 어느 쪽인지 — id 우선, 없으면 팀명(분음부호 폴딩).
    // ⚠️ 소스별 teamId 가 달라(조별=api-football, 녹아웃=TheSports) id 매칭만으론 안 붙음 → 이름 병행.
    const sideOf = (ref: BracketTeamRef, fx: WcKnockoutFixture): "home" | "away" | null => {
      const id = ref.teamId;
      const nm = ref.name ? nfold(ref.name) : null;
      if (id != null && fx.homeId === id) return "home";
      if (id != null && fx.awayId === id) return "away";
      if (nm && nfold(fx.homeName) === nm) return "home";
      if (nm && nfold(fx.awayName) === nm) return "away";
      return null;
    };
    const homeResolved = slot.home.teamId != null || slot.home.name != null;
    const awayResolved = slot.away.teamId != null || slot.away.name != null;
    if (!homeResolved && !awayResolved) return; // 양쪽 미해석 — 앵커 없음

    for (const fx of cands) {
      const sHome = homeResolved ? sideOf(slot.home, fx) : null;
      const sAway = awayResolved ? sideOf(slot.away, fx) : null;

      // 매칭 + orientation(슬롯 home 이 fixture 의 어느 쪽인지)
      let homeIsFxHome: boolean;
      if (homeResolved && awayResolved) {
        if (!sHome || !sAway || sHome === sAway) continue; // 둘이 서로 다른 쪽에 매칭돼야
        homeIsFxHome = sHome === "home";
      } else if (homeResolved) {
        if (!sHome) continue;
        homeIsFxHome = sHome === "home";
        slot.away = homeIsFxHome // 상대(미해석)를 fixture 반대쪽으로 채움
          ? resolvedRef(fx.awayName, fx.awayId, null, false)
          : resolvedRef(fx.homeName, fx.homeId, null, false);
      } else {
        if (!sAway) continue;
        homeIsFxHome = sAway === "away";
        slot.home = homeIsFxHome
          ? resolvedRef(fx.homeName, fx.homeId, null, false)
          : resolvedRef(fx.awayName, fx.awayId, null, false);
      }

      // 스코어를 슬롯 home/away 방향에 맞춰 배치
      slot.homeScore = homeIsFxHome ? fx.homeScore : fx.awayScore;
      slot.awayScore = homeIsFxHome ? fx.awayScore : fx.homeScore;
      slot.status = fx.status === "LIVE" ? "LIVE" : fx.status === "FINISHED" ? "FINISHED" : "SCHEDULED";
      slot.startTime = fx.startTime;
      slot.externalId = fx.externalId;

      // 승자/패자 판정 — 이긴 fixture 쪽(home/away) → orientation 으로 슬롯에 매핑
      if (slot.status === "FINISHED") {
        let winFxSide: "home" | "away" | null = null;
        if (fx.winnerId != null) winFxSide = fx.winnerId === fx.homeId ? "home" : fx.winnerId === fx.awayId ? "away" : null;
        if (!winFxSide && fx.homeScore != null && fx.awayScore != null && fx.homeScore !== fx.awayScore) {
          winFxSide = fx.homeScore > fx.awayScore ? "home" : "away";
        }
        if (winFxSide) {
          const homeWon = (winFxSide === "home") === homeIsFxHome;
          const winSide = homeWon ? slot.home : slot.away;
          const loseSide = homeWon ? slot.away : slot.home;
          winSide.won = true;
          loseSide.out = true;
          winnerRef.set(slot.matchNo, { ...winSide, won: false, out: false, label: winSide.nameKo ?? winSide.label });
          loserRef.set(slot.matchNo, { ...loseSide, won: false, out: false, label: loseSide.nameKo ?? loseSide.label });
        }
      }
      break;
    }
  };

  // 라운드 순서대로 — winner/loser 출처가 항상 먼저 처리되도록
  const ROUND_SEQ: WcRound[] = ["r32", "r16", "qf", "sf", "final", "third"];
  const templateByRound = (r: WcRound) =>
    SLOT_TEMPLATE.filter((s) => s.round === r).sort((a, b) => a.order - b.order);

  for (const round of ROUND_SEQ) {
    for (const tpl of templateByRound(round)) {
      const slot: BracketSlot = {
        matchNo: tpl.matchNo,
        round: tpl.round,
        half: tpl.half,
        order: tpl.order,
        home: resolveSource(tpl.home),
        away: resolveSource(tpl.away),
        status: null,
        homeScore: null,
        awayScore: null,
        startTime: null,
        externalId: null,
        homeProb: null,
        awayProb: null,
      };
      overlay(slot, tpl);

      // AI advance 확률 — 양쪽 확정 + 미종료
      if (slot.home.name && slot.away.name && slot.status !== "FINISHED") {
        const ap = advanceProb(slot.home.name, slot.away.name);
        slot.homeProb = ap.home;
        slot.awayProb = ap.away;
      }
      slots.set(tpl.matchNo, slot);
    }
  }

  return [...slots.values()];
}

/** api-football raw.league.round → 내부 WcRound (없으면 null) */
export function parseKnockoutRound(roundStr: string | undefined | null): WcRound | null {
  if (!roundStr) return null;
  const r = roundStr.toLowerCase();
  if (r.includes("round of 32")) return "r32";
  if (r.includes("round of 16")) return "r16";
  if (r.includes("quarter")) return "qf";
  if (r.includes("semi")) return "sf";
  if (r.includes("3rd place") || r.includes("third place")) return "third";
  if (r.includes("final")) return "final";
  return null;
}

// 라운드 라벨이 없는 매치(TheSports 소스는 raw 가 비어 round 미제공)용 — 경기 날짜로 라운드 유추.
// 2026 FIFA 월드컵 녹아웃 일정은 사전 확정이라 날짜 구간이 라운드와 1:1. (UTC 경계, 구간 겹침 없음)
// ⚠️ round 가 "있는데" 녹아웃이 아닌(=그룹) 경기엔 쓰면 안 됨 — 호출부에서 round 부재 시에만 사용.
const KO_DATE_WINDOWS: { from: string; to: string; round: WcRound }[] = [
  { from: "2026-06-28", to: "2026-07-04", round: "r32" },
  { from: "2026-07-04", to: "2026-07-08", round: "r16" },
  { from: "2026-07-08", to: "2026-07-13", round: "qf" },
  { from: "2026-07-13", to: "2026-07-17", round: "sf" },
  { from: "2026-07-17", to: "2026-07-19", round: "third" },
  { from: "2026-07-19", to: "2026-07-21", round: "final" },
];

export function knockoutRoundFromDate(d: Date): WcRound | null {
  const t = d.getTime();
  for (const w of KO_DATE_WINDOWS) {
    if (t >= new Date(w.from + "T00:00:00Z").getTime() && t < new Date(w.to + "T00:00:00Z").getTime()) {
      return w.round;
    }
  }
  return null;
}
