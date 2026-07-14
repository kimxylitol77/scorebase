// MLB 주간 베스트 선수 ANALYSIS 의 결정론적 데이터 빌더.
// 소스: statsapi.mlb.com byDateRange(주간 타자/투수 리더). 우리 DB 아닌 MLB 공식 API 직접 호출.
// KBO/NPB 와 달리 MLB 공식 API 가 날짜범위 조회를 지원해 스냅샷 없이 "이번 주" 성적을 바로 뽑는다.
import { toKoreanTeamName } from "@/lib/team-names";
import { toKoreanPlayerName } from "@/lib/player-names";

const MIN_AB = 15; // 타율/OPS 랭킹 자격 (한 주 ~25타석 기준, 소표본 제외)
const MIN_IP = 6; // 평균자책점 랭킹 자격 (선발 1~2등판 분량)

export interface WeeklyHitter {
  name: string; // 한글명(없으면 영문)
  team: string; // 한글 팀명
  games: number;
  atBats: number;
  avg: number | null;
  homeRuns: number;
  rbi: number;
  ops: number | null;
  stolenBases: number;
}

export interface WeeklyPitcher {
  name: string;
  team: string;
  wins: number;
  losses: number;
  era: number | null;
  inningsPitched: string; // "15.1" 원문 표기
  ipNum: number; // 비교용 소수 (15.1 → 15.33)
  strikeOuts: number;
  whip: number | null;
  saves: number;
}

export interface CategoryLeader {
  name: string;
  team: string;
  value: number;
}

export interface MlbWeeklyPlayersData {
  season: string;
  weekLabelKo: string; // "7월 7일~7월 13일"
  startDate: string; // "2026-07-07"
  endDate: string; // "2026-07-13"
  topHitters: WeeklyHitter[]; // OPS 상위 (min AB)
  topPitchers: WeeklyPitcher[]; // ERA 낮은 순 (min IP)
  hrLeaders: CategoryLeader[];
  rbiLeaders: CategoryLeader[];
  sbLeaders: CategoryLeader[];
  soLeaders: CategoryLeader[];
  saveLeaders: CategoryLeader[];
}

const flt = (v: unknown): number | null => {
  if (v == null) return null;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};
const int = (v: unknown): number => {
  if (v == null) return 0;
  const n = parseInt(String(v).replace(/[, ]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
};
/** 야구 이닝 표기 "15.1"(15와 1/3) → 비교용 소수. */
function parseIp(v: unknown): number {
  const s = String(v ?? "0");
  const [whole, frac] = s.split(".");
  const w = parseInt(whole, 10) || 0;
  const f = frac === "1" ? 1 / 3 : frac === "2" ? 2 / 3 : 0;
  return w + f;
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface MlbSplit {
  team?: { name?: string };
  player?: { id?: number; fullName?: string };
  stat?: Record<string, unknown>;
}

async function fetchSplits(
  group: "hitting" | "pitching",
  startDate: string,
  endDate: string,
  season: string,
): Promise<MlbSplit[]> {
  const url =
    `https://statsapi.mlb.com/api/v1/stats?stats=byDateRange&group=${group}` +
    `&startDate=${startDate}&endDate=${endDate}&season=${season}` +
    `&sportId=1&gameType=R&limit=300&playerPool=all`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`MLB ${group} byDateRange HTTP ${res.status}`);
  const data = (await res.json()) as { stats?: Array<{ splits?: MlbSplit[] }> };
  return data.stats?.[0]?.splits ?? [];
}

/**
 * MLB 주간 베스트 선수 데이터. refDate(기본 now) 기준 최근 7일을 "이번 주"로 본다.
 * 자격 선수가 너무 적으면(비시즌 등) null.
 */
export async function buildMlbWeeklyPlayers(
  refDate: Date = new Date(),
): Promise<MlbWeeklyPlayersData | null> {
  const season = String(refDate.getFullYear());
  const from = new Date(refDate.getTime() - 7 * 86400000);
  const startDate = dateStr(from);
  const endDate = dateStr(refDate);

  const [hitSplits, pitSplits] = await Promise.all([
    fetchSplits("hitting", startDate, endDate, season),
    fetchSplits("pitching", startDate, endDate, season),
  ]);

  const hitters: WeeklyHitter[] = hitSplits
    .filter((s) => s.player?.fullName)
    .map((s) => {
      const st = s.stat ?? {};
      const teamEn = s.team?.name ?? "";
      return {
        name: toKoreanPlayerName(s.player!.fullName) || s.player!.fullName!,
        team: toKoreanTeamName(teamEn) || teamEn,
        games: int(st.gamesPlayed),
        atBats: int(st.atBats),
        avg: flt(st.avg),
        homeRuns: int(st.homeRuns),
        rbi: int(st.rbi),
        ops: flt(st.ops),
        stolenBases: int(st.stolenBases),
      };
    });

  const pitchers: WeeklyPitcher[] = pitSplits
    .filter((s) => s.player?.fullName)
    .map((s) => {
      const st = s.stat ?? {};
      const teamEn = s.team?.name ?? "";
      return {
        name: toKoreanPlayerName(s.player!.fullName) || s.player!.fullName!,
        team: toKoreanTeamName(teamEn) || teamEn,
        wins: int(st.wins),
        losses: int(st.losses),
        era: flt(st.era),
        inningsPitched: String(st.inningsPitched ?? "0"),
        ipNum: parseIp(st.inningsPitched),
        strikeOuts: int(st.strikeOuts),
        whip: flt(st.whip),
        saves: int(st.saves),
      };
    });

  // 자료가 사실상 없으면(비시즌·API 이상) 발행하지 않는다.
  if (hitters.length < 20 || pitchers.length < 20) return null;

  const topN = <T>(arr: T[], n = 3) => arr.slice(0, n);
  const cat = (h: { name: string; team: string }, value: number): CategoryLeader => ({
    name: h.name,
    team: h.team,
    value,
  });

  const topHitters = hitters
    .filter((h) => h.atBats >= MIN_AB && h.ops != null)
    .sort((a, b) => (b.ops! - a.ops!) || b.homeRuns - a.homeRuns)
    .slice(0, 6);

  const topPitchers = pitchers
    .filter((p) => p.ipNum >= MIN_IP && p.era != null)
    .sort((a, b) => (a.era! - b.era!) || b.strikeOuts - a.strikeOuts)
    .slice(0, 6);

  // 자격 선수가 너무 적으면(주중 얇은 주) 스킵 — 표가 빈약하면 글 품질이 떨어진다.
  if (topHitters.length < 3 || topPitchers.length < 3) return null;

  const hrLeaders = topN(
    [...hitters].filter((h) => h.homeRuns > 0).sort((a, b) => b.homeRuns - a.homeRuns),
  ).map((h) => cat(h, h.homeRuns));
  const rbiLeaders = topN(
    [...hitters].filter((h) => h.rbi > 0).sort((a, b) => b.rbi - a.rbi),
  ).map((h) => cat(h, h.rbi));
  const sbLeaders = topN(
    [...hitters].filter((h) => h.stolenBases > 0).sort((a, b) => b.stolenBases - a.stolenBases),
  ).map((h) => cat(h, h.stolenBases));
  const soLeaders = topN(
    [...pitchers].filter((p) => p.strikeOuts > 0).sort((a, b) => b.strikeOuts - a.strikeOuts),
  ).map((p) => cat(p, p.strikeOuts));
  const saveLeaders = topN(
    [...pitchers].filter((p) => p.saves > 0).sort((a, b) => b.saves - a.saves),
  ).map((p) => cat(p, p.saves));

  const fromKo = new Date(from.getTime() + 9 * 3600000);
  const toKo = new Date(refDate.getTime() + 9 * 3600000);
  const weekLabelKo = `${fromKo.getUTCMonth() + 1}월 ${fromKo.getUTCDate()}일~${toKo.getUTCMonth() + 1}월 ${toKo.getUTCDate()}일`;

  return {
    season,
    weekLabelKo,
    startDate,
    endDate,
    topHitters,
    topPitchers,
    hrLeaders,
    rbiLeaders,
    sbLeaders,
    soLeaders,
    saveLeaders,
  };
}

/** 본문에서 숫자를 뽑아 절댓값·3자리 반올림한 multiset(정렬 배열). ".500"·"0.500"·"7.0" 등 표기차 흡수. */
function rowNumbers(line: string): number[] {
  const out: number[] = [];
  // 앞자리 0 없는 소수(".500")도 잡도록 \d* 를 앞에 둔다.
  for (const m of line.matchAll(/-?\d*\.?\d+/g)) {
    const n = Math.abs(parseFloat(m[0]));
    if (Number.isFinite(n)) out.push(Math.round(n * 1000) / 1000);
  }
  return out.sort((a, b) => a - b);
}
function sameMultiset(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => Math.abs(v - b[i]) < 0.006);
}
function expected(nums: (number | null)[]): number[] {
  return nums
    .filter((n): n is number => n != null)
    .map((n) => Math.round(Math.abs(n) * 1000) / 1000)
    .sort((a, b) => a - b);
}

export interface FaithfulnessResult {
  blockers: string[]; // 발행 차단 사유(창작·수치 불일치)
  warnings: string[]; // 경미(부문 1위 누락 등)
}

/**
 * 결정론적 팩트 검증 — 표 각 행의 수치를 원천 선수 데이터와 multiset 대조하고,
 * 부문 1위 선수 이름이 본문에 존재하는지 확인한다. LLM 무관, 100% 정확.
 */
export function checkMlbWeeklyFaithfulness(
  content: string,
  d: MlbWeeklyPlayersData,
): FaithfulnessResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const hitterExp = new Map(
    d.topHitters.map((h) => [h.name, expected([h.games, h.avg, h.homeRuns, h.rbi, h.ops])]),
  );
  const pitcherExp = new Map(
    d.topPitchers.map((p) => [
      p.name,
      expected([p.wins, p.losses, p.era, Number(p.inningsPitched), p.strikeOuts, p.whip]),
    ]),
  );

  const lines = content.split("\n");
  let mode: "hitter" | "pitcher" | null = null;
  for (const line of lines) {
    const isRow = /^\s*\|/.test(line);
    if (!isRow) {
      mode = null;
      continue;
    }
    // 헤더 행으로 표 종류 판별.
    if (/OPS/i.test(line)) { mode = "hitter"; continue; }
    if (/WHIP|ERA/i.test(line)) { mode = "pitcher"; continue; }
    if (/^\s*\|[-\s|:]+\|?\s*$/.test(line)) continue; // 구분선
    if (!mode) continue;

    const exp = mode === "hitter" ? hitterExp : pitcherExp;
    const label = mode === "hitter" ? "타자" : "투수";
    // 이 행이 어떤 원천 선수의 행인지 이름으로 매칭.
    const matched = [...exp.keys()].find((name) => line.includes(name));
    if (!matched) {
      blockers.push(`${label} 표에 원천에 없는 선수 행: ${line.trim().slice(0, 60)}`);
      continue;
    }
    if (!sameMultiset(rowNumbers(line), exp.get(matched)!)) {
      blockers.push(
        `${label} 표 수치 불일치(${matched}): 표 [${rowNumbers(line).join(",")}] vs 원천 [${exp.get(matched)!.join(",")}]`,
      );
    }
  }

  // 부문 1위 이름이 본문에 없으면(누락) 경고.
  const cats: Array<[string, CategoryLeader[]]> = [
    ["홈런", d.hrLeaders],
    ["타점", d.rbiLeaders],
    ["도루", d.sbLeaders],
    ["탈삼진", d.soLeaders],
    ["세이브", d.saveLeaders],
  ];
  for (const [cat, arr] of cats) {
    if (arr.length && !content.includes(arr[0].name)) {
      warnings.push(`${cat} 1위 ${arr[0].name} 이(가) 본문에 누락됨`);
    }
  }

  return { blockers, warnings };
}

/** 심판관 팩트체크용 — 본문이 인용해도 되는 모든 선수·수치를 평문으로 나열(정답 집합). */
export function serializeMlbWeeklyFacts(d: MlbWeeklyPlayersData): string {
  const L: string[] = [];
  L.push(`기간: ${d.startDate} ~ ${d.endDate} (MLB ${d.season} 정규시즌)`);
  L.push("[타자 — 인용 가능한 값 전부]");
  for (const h of d.topHitters) {
    L.push(
      `- ${h.name} (${h.team}): ${h.games}경기 ${h.atBats}타수, 타율 ${h.avg == null ? "-" : h.avg.toFixed(3)}, 홈런 ${h.homeRuns}, 타점 ${h.rbi}, OPS ${h.ops == null ? "-" : h.ops.toFixed(3)}, 도루 ${h.stolenBases}`,
    );
  }
  L.push("[투수 — 인용 가능한 값 전부]");
  for (const p of d.topPitchers) {
    L.push(
      `- ${p.name} (${p.team}): ${p.wins}승 ${p.losses}패, ERA ${p.era == null ? "-" : p.era.toFixed(2)}, ${p.inningsPitched}이닝, 탈삼진 ${p.strikeOuts}, WHIP ${p.whip == null ? "-" : p.whip.toFixed(2)}, 세이브 ${p.saves}`,
    );
  }
  const cat = (label: string, arr: CategoryLeader[], unit: string) =>
    arr.length ? `- ${label}: ${arr.map((x) => `${x.name}(${x.team}) ${x.value}${unit}`).join(", ")}` : "";
  L.push("[부문 리더]");
  for (const line of [
    cat("홈런", d.hrLeaders, "개"),
    cat("타점", d.rbiLeaders, "타점"),
    cat("도루", d.sbLeaders, "개"),
    cat("탈삼진", d.soLeaders, "K"),
    cat("세이브", d.saveLeaders, "SV"),
  ].filter(Boolean)) {
    L.push(line);
  }
  return L.join("\n");
}
