// AI 예측 성적표 — 여러 AI(스코어베이스 정량모델·GPT·Claude·Grok·Gemini·Qwen·Kimi)가 같은 경기를 경기 전 예측하고
// 결과로 채점하는 N자 리더보드 + 다가오는 경기의 전 모델 픽(AI 원탁) + 시장별·경기별 누적.
import type { Metadata } from "next";
import Link from "next/link";
import { Check, X, Trophy, Sparkles, Clock, Users, ChevronDown, Crown, Handshake, FlaskConical } from "lucide-react";
import { prisma } from "@/lib/db";
import AmbientGlow from "@/components/AmbientGlow";
import LeagueBadge from "@/components/LeagueBadge";
import TeamBadge from "@/components/TeamBadge";
import CiteBox from "@/components/CiteBox";
import ConsensusGate from "@/components/predictions/ConsensusGate";
import { toKoreanTeamName } from "@/lib/team-names";
import { fifaFlag, isNationalTeamLeague } from "@/lib/sports/fifa-rankings";
import { SITE_URL } from "@/lib/site-url"; // www 강제 정규화(apex 새어나감 방지)
import { ogPageImage } from "@/lib/seo/og";
import { isGptScorecardModel } from "@/lib/predict/gpt-scorecard-model";
import { koEnLanguages } from "@/lib/i18n/en";
import { jsonLdScript } from "@/lib/seo/jsonld";

export const revalidate = 1800; // 30분 ISR

type Market = "1X2" | "HANDICAP" | "OU";
const MARKET_META: { key: Market; label: string }[] = [
  { key: "1X2", label: "1X2 승부" },
  { key: "HANDICAP", label: "핸디캡" },
  { key: "OU", label: "오버언더" },
];

// 모델 표시 메타 — gpt-5.5/5.6 은 "gpt" 로 통합. accent 는 panelists.ts 와 맞춤.
type Accent = "rose" | "emerald" | "sky" | "amber" | "teal" | "violet" | "indigo";
const MODEL_META: Record<string, { label: string; accent: Accent; order: number }> = {
  scorebase: { label: "스코어베이스", accent: "rose", order: 0 },
  gpt: { label: "GPT-5.6 Sol", accent: "emerald", order: 1 },
  grok: { label: "Grok", accent: "sky", order: 2 },
  gemini: { label: "Gemini", accent: "amber", order: 3 },
  "qwen2.5-32b": { label: "Qwen", accent: "teal", order: 4 },
  claude: { label: "Claude", accent: "violet", order: 5 },
  "kimi-k3": { label: "Kimi K3", accent: "indigo", order: 6 },
};
function normModel(m: string): string {
  return isGptScorecardModel(m) ? "gpt" : m;
}
function metaOf(m: string) {
  return MODEL_META[m] ?? { label: m, accent: "emerald" as Accent, order: 9 };
}

// 정적 Tailwind 클래스(동적 문자열 조합 금지 — purge 회피).
const ACCENT: Record<Accent, { text: string; dot: string; bar: string; soft: string; ring: string }> = {
  rose: { text: "text-rose-600 dark:text-rose-400", dot: "bg-rose-500", bar: "bg-rose-500", soft: "bg-rose-500/10", ring: "ring-rose-400/60 dark:ring-rose-400/40" },
  emerald: { text: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500", bar: "bg-emerald-500", soft: "bg-emerald-500/10", ring: "ring-emerald-400/60 dark:ring-emerald-400/40" },
  sky: { text: "text-sky-600 dark:text-sky-400", dot: "bg-sky-500", bar: "bg-sky-500", soft: "bg-sky-500/10", ring: "ring-sky-400/60 dark:ring-sky-400/40" },
  amber: { text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500", bar: "bg-amber-500", soft: "bg-amber-500/10", ring: "ring-amber-400/60 dark:ring-amber-400/40" },
  teal: { text: "text-teal-600 dark:text-teal-400", dot: "bg-teal-500", bar: "bg-teal-500", soft: "bg-teal-500/10", ring: "ring-teal-400/60 dark:ring-teal-400/40" },
  violet: { text: "text-violet-600 dark:text-violet-400", dot: "bg-violet-500", bar: "bg-violet-500", soft: "bg-violet-500/10", ring: "ring-violet-400/60 dark:ring-violet-400/40" },
  indigo: { text: "text-indigo-600 dark:text-indigo-400", dot: "bg-indigo-500", bar: "bg-indigo-500", soft: "bg-indigo-500/10", ring: "ring-indigo-400/60 dark:ring-indigo-400/40" },
};

// ⚠ 패널이 늘면 여기 모델명도 같이 갱신할 것 — metadata 는 정적 export 라
// board(DB) 를 못 읽는다. panelists.ts 좌석 추가 시 함께 손대는 지점.
export const metadata: Metadata = {
  title: "AI 예측 성적표 — GPT·Claude·Grok·Gemini·Qwen·Kimi 승부예측 리더보드",
  description:
    "여러 AI가 같은 경기를 경기 전에 예측하고 결과로 채점합니다. 스코어베이스 통계모델·GPT·Claude·Grok·Gemini·Qwen·Kimi K3의 1X2·핸디캡·오버언더 적중률을 투명하게 공개하는 멀티 AI 리더보드.",
  keywords: [
    "AI 예측 성적표", "멀티 AI 승부예측", "AI 적중률 비교", "GPT 예측", "Grok 예측",
    "Gemini 예측", "Claude 예측", "Kimi 예측", "AI 스포츠 예측 리더보드", "핸디캡 예측", "오버언더 예측",
  ],
  alternates: {
    canonical: `${SITE_URL}/predictions/scorecard`,
    // 영어판 hreflang 상호 연결
    languages: koEnLanguages("/predictions/scorecard", "/en/predictions/scorecard"),
  },
  openGraph: {
    title: "AI 예측 성적표 — 멀티 AI 승부예측 리더보드",
    description: "스코어베이스·GPT·Claude·Grok·Gemini·Qwen·Kimi가 같은 경기를 두고 맞붙는 승부예측 성적표.",
    url: `${SITE_URL}/predictions/scorecard`,
    images: ogPageImage({ title: "AI 예측 성적표", subtitle: "멀티 AI 승부예측 리더보드", tag: "AI 대결" }),
  },
};

interface Cell {
  pick: string;
  prob: number;
  line: number | null;
  reason: string | null;
  correct: boolean | null;
}
interface DP {
  matchId: number;
  market: Market;
  league: string;
  externalId: string;
  startTime: Date;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  home: string;
  away: string;
  homeRaw: string; // 영문 원본 — 국가대항 국기(fifaFlag) 해석용
  awayRaw: string;
  homeLogo: string | null;
  awayLogo: string | null;
  cells: Map<string, Cell>; // model → cell
}
interface Tally {
  predicted: number;
  graded: number;
  correct: number;
  rate: number;
}

function pickText(market: Market, pick: string, home: string, away: string, line: number | null): string {
  if (market === "OU") return `${pick === "OVER" ? "오버" : "언더"}${line != null ? ` ${line}` : ""}`;
  if (market === "HANDICAP") return `${pick === "HOME" ? home : away}${line != null ? ` ${pick === "HOME" ? "-" : "+"}${Math.abs(line)}` : ""}`;
  if (pick === "HOME") return home;
  if (pick === "AWAY") return away;
  return "무승부";
}
function matchHref(league: string, externalId: string): string {
  if (league === "KBO" || league === "NPB" || league === "MLB") return `/live/${league.toLowerCase()}/${externalId}`;
  if (league === "LOL") return `/live/lol/${externalId}`;
  return `/live/${league}/${externalId}`;
}

function shortPick(pick: string, home: string, away: string): string {
  if (pick === "HOME") return home;
  if (pick === "AWAY") return away;
  if (pick === "DRAW") return "무";
  return pick;
}

// 팀 라인 — 로고(국가대항은 국기)+팀명, 클릭 시 해당 경기 라이브 페이지로 이동.
function TeamsLine(props: {
  league: string;
  externalId: string;
  home: string;
  away: string;
  homeRaw: string;
  awayRaw: string;
  homeLogo: string | null;
  awayLogo: string | null;
}) {
  const flag = isNationalTeamLeague(props.league);
  const side = (raw: string, ko: string, logo: string | null) =>
    flag ? (
      <span className="shrink-0">{fifaFlag(raw, ko)}</span>
    ) : (
      <TeamBadge logoUrl={logo} size={16} className="bg-white rounded-sm" />
    );
  return (
    <Link
      href={matchHref(props.league, props.externalId)}
      className="inline-flex min-w-0 items-center gap-1.5 text-[15px] font-semibold text-zinc-900 underline-offset-2 hover:underline dark:text-white"
    >
      {side(props.homeRaw, props.home, props.homeLogo)}
      <span className="truncate">{props.home}</span>
      <span className="shrink-0 text-xs font-normal text-zinc-400 dark:text-white/30">vs</span>
      {side(props.awayRaw, props.away, props.awayLogo)}
      <span className="truncate">{props.away}</span>
    </Link>
  );
}

export default async function ScorecardPage() {
  const rows = await prisma.aiPrediction.findMany({
    where: { market: { in: ["1X2", "HANDICAP", "OU"] }, published: true },
    orderBy: { match: { startTime: "asc" } },
    select: {
      model: true, market: true, pick: true, prob: true, line: true, reason: true, correct: true,
      match: {
        select: {
          id: true, league: true, startTime: true, status: true, homeScore: true, awayScore: true, externalId: true,
          homeTeam: { select: { name: true, logoUrl: true } },
          awayTeam: { select: { name: true, logoUrl: true } },
        },
      },
    },
  });

  // (matchId, market) 단위로 전 모델 픽을 한 데이터포인트로 묶음.
  const byKey = new Map<string, DP>();
  for (const r of rows) {
    const m = r.match;
    const mk = r.market as Market;
    const key = `${m.id}:${mk}`;
    let dp = byKey.get(key);
    if (!dp) {
      dp = {
        matchId: m.id, market: mk, league: m.league, startTime: m.startTime, status: m.status,
        homeScore: m.homeScore, awayScore: m.awayScore, externalId: m.externalId,
        home: toKoreanTeamName(m.homeTeam.name, m.league) || m.homeTeam.name,
        away: toKoreanTeamName(m.awayTeam.name, m.league) || m.awayTeam.name,
        homeRaw: m.homeTeam.name, awayRaw: m.awayTeam.name,
        homeLogo: m.homeTeam.logoUrl, awayLogo: m.awayTeam.logoUrl,
        cells: new Map(),
      };
      byKey.set(key, dp);
    }
    const nm = normModel(r.model);
    const existing = dp.cells.get(nm);
    // gpt 통합 시 채점된 쪽(과거 5.5)을 우선 보존.
    if (!existing || (existing.correct === null && r.correct !== null)) {
      dp.cells.set(nm, { pick: r.pick, prob: r.prob, line: r.line, reason: r.reason, correct: r.correct });
    }
  }

  const datapoints = [...byKey.values()];

  // 데이터에 실제 존재하는 모델(정렬은 MODEL_META order).
  const present = [...new Set(rows.map((r) => normModel(r.model)))].sort(
    (a, b) => metaOf(a).order - metaOf(b).order,
  );

  // 모델별 누적 성적(채점된 것 기준) + 예측 수.
  const tallyOf = (model: string, filter?: (d: DP) => boolean): Tally => {
    let predicted = 0, graded = 0, correct = 0;
    for (const d of datapoints) {
      if (filter && !filter(d)) continue;
      const c = d.cells.get(model);
      if (!c) continue;
      predicted++;
      if (c.correct !== null) {
        graded++;
        if (c.correct) correct++;
      }
    }
    return { predicted, graded, correct, rate: graded > 0 ? correct / graded : 0 };
  };

  // 모델별 최근 N건 성적 — 누적 이력이 긴 모델(GPT·스코어베이스)과 갓 합류한 모델을
  // 같은 표본 크기로 비교하기 위한 헤드라인 지표. datapoints 가 startTime asc 이므로 뒤에서부터 센다.
  const RECENT_WINDOW = 100;
  const recentTallyOf = (model: string) => {
    let graded = 0, correct = 0;
    for (let i = datapoints.length - 1; i >= 0 && graded < RECENT_WINDOW; i--) {
      const c = datapoints[i].cells.get(model);
      if (!c || c.correct === null) continue;
      graded++;
      if (c.correct) correct++;
    }
    return { graded, correct, rate: graded > 0 ? correct / graded : 0 };
  };

  // 어제(KST) 시작 경기의 채점 성적 — 채점 cron 이 자정 1회라 "어제"가 항상 완결 상태.
  const DAY_MS = 86400000, KST_MS = 9 * 3600000;
  const todayStartKst = new Date(Math.floor((Date.now() + KST_MS) / DAY_MS) * DAY_MS - KST_MS);
  const ydayStartKst = new Date(todayStartKst.getTime() - DAY_MS);
  const ydayTallyOf = (model: string) =>
    tallyOf(model, (d) => d.startTime >= ydayStartKst && d.startTime < todayStartKst);

  // 최근 7/14/30일 롤링 — 경기 시작 시간 기준 인메모리 필터 (채점 완료분만 적중률에 반영).
  const rollingTallyOf = (model: string, days: number) =>
    tallyOf(model, (d) => d.startTime >= new Date(Date.now() - days * DAY_MS));

  const board = present
    .map((m) => ({ model: m, ...metaOf(m), tally: tallyOf(m), recent: recentTallyOf(m), yday: ydayTallyOf(m), r7: rollingTallyOf(m, 7), r14: rollingTallyOf(m, 14), r30: rollingTallyOf(m, 30) }))
    // 실적 있는 모델 먼저(누적 적중률 desc), 채점 대기 모델은 뒤로(예측 수 desc).
    .sort((a, b) => {
      const ag = a.tally.graded > 0, bg = b.tally.graded > 0;
      if (ag !== bg) return ag ? -1 : 1;
      if (ag) return b.tally.rate - a.tally.rate;
      return b.tally.predicted - a.tally.predicted;
    });
  // 소표본 왜곡 방지 — 채점 30건 미만 모델은 순위에 안 올리고 "표본 누적 중" 구간에 성적만 표시.
  // (예: 첫날 12건 중 8건 맞춘 모델이 900건짜리 기록 위에 1위로 뜨는 왜곡 차단)
  const RANK_MIN = 30;
  // 전 모델 채점 건수 합 — "계속 진화하는 성적표" 섹션의 대표 숫자(하드코딩 금지).
  const totalGraded = board.reduce((s, b) => s + b.tally.graded, 0);
  const gradedModels = board.filter((b) => b.tally.graded >= RANK_MIN);
  const provisionalModels = board.filter((b) => b.tally.graded > 0 && b.tally.graded < RANK_MIN);
  const pendingModels = board.filter((b) => b.tally.graded === 0);
  const maxRate = Math.max(0.0001, ...gradedModels.map((b) => b.tally.rate));

  // 고신뢰 픽 — 어떤 모델이든 확률 65% 이상으로 확신한 픽의 채점 성적(전 시장 누적).
  // 확신 강도와 실제 적중이 비례하는지 보여주는 대표 숫자. DB 동적 계산(하드코딩 금지).
  const CONF_MIN = 0.65;
  let confGraded = 0, confWins = 0;
  for (const d of datapoints) {
    for (const c of d.cells.values()) {
      if (c.prob >= CONF_MIN && c.correct !== null) {
        confGraded++;
        if (c.correct) confWins++;
      }
    }
  }
  const confRate = confGraded > 0 ? confWins / confGraded : 0;

  // 시장별 성적(채점된 모델만).
  const perMarket = MARKET_META.map((mm) => ({
    ...mm,
    models: present
      .map((m) => ({ model: m, ...metaOf(m), tally: tallyOf(m, (d) => d.market === mm.key) }))
      .filter((x) => x.tally.graded > 0)
      .sort((a, b) => b.tally.rate - a.tally.rate),
  })).filter((mm) => mm.models.length > 0);

  // 만장일치 성적 — 픽을 낸 AI가 MIN_PANEL 이상이고 전원이 같은 쪽을 고른 (경기, 시장) 묶음.
  // 원탁 카드의 "만장일치/의견갈림" 뱃지가 실제로 성적 차이를 만드는지 검증하는 숫자.
  // 초기에 모델 2개만 픽을 내던 구간을 만장일치로 세면 과장이라 3개 이상으로 자른다.
  const MIN_PANEL = 3;
  interface AgreeAgg {
    graded: number;
    correct: number;
    sweepFail: number; // 만장일치인데 전원 오답
    total: number; // (경기, 시장) 묶음 수
  }
  const emptyAgg = (): AgreeAgg => ({ graded: 0, correct: 0, sweepFail: 0, total: 0 });
  const unanAgg = new Map<Market, AgreeAgg>();
  const splitAgg = new Map<Market, AgreeAgg>();
  const unanAll = emptyAgg(), splitAll = emptyAgg();
  // 만장일치인데 전원이 틀린 경기 — 최근순으로 모은다(datapoints 는 startTime asc).
  const betrayals: { dp: DP; pick: string; line: number | null; panel: number }[] = [];
  for (const d of datapoints) {
    const cells = [...d.cells.values()];
    if (cells.length < MIN_PANEL) continue;
    const graded = cells.filter((c) => c.correct !== null);
    if (graded.length === 0) continue;
    const unan = new Set(cells.map((c) => c.pick)).size === 1;
    const correct = graded.filter((c) => c.correct).length;
    const bucket = unan ? unanAgg : splitAgg;
    const agg = bucket.get(d.market) ?? emptyAgg();
    const all = unan ? unanAll : splitAll;
    agg.graded += graded.length; agg.correct += correct; agg.total++;
    all.graded += graded.length; all.correct += correct; all.total++;
    if (unan && correct === 0) {
      agg.sweepFail++; all.sweepFail++;
      // 핸디캡·오버언더는 같은 픽이라도 모델마다 라인이 다를 수 있다.
      // 전원이 같은 라인일 때만 라인을 붙이고, 갈리면 생략(대표값 하나로 뭉뚱그리지 않는다).
      const lines = new Set(cells.map((c) => c.line));
      betrayals.push({ dp: d, pick: cells[0].pick, line: lines.size === 1 ? cells[0].line : null, panel: cells.length });
    }
    bucket.set(d.market, agg);
  }
  betrayals.reverse(); // 최근순
  const rateOf = (a: AgreeAgg) => (a.graded > 0 ? a.correct / a.graded : 0);
  const agreeGap = rateOf(unanAll) - rateOf(splitAll);
  // 시장별 비교 행 — 양쪽 모두 표본이 RANK_MIN 이상인 시장만.
  const agreeRows = MARKET_META.map((mm) => ({
    ...mm,
    unan: unanAgg.get(mm.key) ?? emptyAgg(),
    split: splitAgg.get(mm.key) ?? emptyAgg(),
  })).filter((r) => r.unan.graded >= RANK_MIN && r.split.graded >= RANK_MIN);

  // 리그별 성적 — 같은 리그 안에서만 모델을 줄 세운다.
  // (리그 간 적중률 비교는 종목별 난이도가 달라 — 야구는 무승부가 없고 축구 1X2 는 3지선다 — 참고용)
  // 끝난 단발 대회는 제외 — 상시 리그와 나란히 두면 지금도 진행 중인 것처럼 읽힌다.
  const LEAGUE_EXCLUDE = new Set(["WORLD_CUP"]);
  const leagueBoard = [...new Set(datapoints.map((d) => d.league))]
    .filter((lg) => !LEAGUE_EXCLUDE.has(lg))
    .map((lg) => {
      const all = present
        .map((m) => ({ model: m, ...metaOf(m), tally: tallyOf(m, (d) => d.league === lg) }))
        .filter((x) => x.tally.graded > 0);
      // 리그 순위는 모델별 채점 RANK_MIN 이상만 — 리그 합산 표본은 커도 특정 모델이
      // 6건으로 1위에 오르는 왜곡(예: K리그1 Qwen 6건)을 차단.
      const models = all
        .filter((x) => x.tally.graded >= RANK_MIN)
        .sort((a, b) => b.tally.rate - a.tally.rate);
      const graded = all.reduce((s, x) => s + x.tally.graded, 0);
      return { league: lg, models, graded };
    })
    .sort((a, b) => b.graded - a.graded);
  // 순위에 올릴 모델이 2개 이상인 리그만 카드로, 나머지는 "표본 누적 중" 칩.
  const leagueMain = leagueBoard.filter((x) => x.models.length >= 2);
  const leagueThin = leagueBoard.filter((x) => x.models.length < 2);

  // 다가오는 맞대결(AI 원탁) — 예정 경기의 1X2 를 전 모델 나란히 + 컨센서스.
  // 핸디캡·오버언더 픽이 있으면 같은 카드의 접이식 부가 시장으로 붙는다.
  const MARKET_ORDER: Record<Market, number> = { "1X2": 0, HANDICAP: 1, OU: 2 };
  interface UpPick {
    model: string;
    pick: string;
    prob: number;
    line: number | null;
  }
  interface UpMatch {
    matchId: number;
    league: string;
    externalId: string;
    startTime: Date;
    home: string;
    away: string;
    homeRaw: string;
    awayRaw: string;
    homeLogo: string | null;
    awayLogo: string | null;
    picks: UpPick[]; // 1X2
    extras: { market: Market; picks: UpPick[] }[]; // 핸디캡·오버언더
  }
  const picksOf = (d: DP): UpPick[] =>
    present
      .map((m) => {
        const c = d.cells.get(m);
        return c ? { model: m, pick: c.pick, prob: c.prob, line: c.line } : null;
      })
      .filter((x): x is UpPick => x !== null);
  const upMap = new Map<number, UpMatch>();
  for (const d of datapoints) {
    if (d.market !== "1X2" || d.status !== "SCHEDULED") continue;
    const picks = picksOf(d);
    if (picks.length === 0) continue;
    upMap.set(d.matchId, {
      matchId: d.matchId, league: d.league, externalId: d.externalId, startTime: d.startTime,
      home: d.home, away: d.away, homeRaw: d.homeRaw, awayRaw: d.awayRaw,
      homeLogo: d.homeLogo, awayLogo: d.awayLogo, picks, extras: [],
    });
  }
  for (const d of datapoints) {
    if (d.market === "1X2" || d.status !== "SCHEDULED") continue;
    const up = upMap.get(d.matchId);
    if (!up) continue;
    const picks = picksOf(d);
    if (picks.length === 0) continue;
    up.extras.push({ market: d.market, picks });
  }
  for (const up of upMap.values()) up.extras.sort((a, b) => MARKET_ORDER[a.market] - MARKET_ORDER[b.market]);
  const upcoming = [...upMap.values()].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  // 컨센서스(다수결) 계산.
  const consensusOf = (picks: { pick: string }[]) => {
    const cnt = new Map<string, number>();
    for (const p of picks) cnt.set(p.pick, (cnt.get(p.pick) ?? 0) + 1);
    let best = "", n = 0;
    for (const [k, v] of cnt) if (v > n) { best = k; n = v; }
    return { pick: best, agree: n, total: picks.length };
  };

  // 경기별 성적 피드 — 채점된 데이터포인트, 최근순.
  const resolved = datapoints
    .filter((d) => [...d.cells.values()].some((c) => c.correct !== null))
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

  // 경기 단위로 묶음 — 같은 경기의 1X2·핸디캡·오버언더가 카드 3장으로 흩어지던 것을
  // 카드 1장 + 시장 드롭다운으로 통합. resolved 가 최근순이라 Map 삽입 순서 = 최근순 유지.
  const matchGroupMap = new Map<number, DP[]>();
  for (const d of resolved) {
    const arr = matchGroupMap.get(d.matchId) ?? [];
    arr.push(d);
    matchGroupMap.set(d.matchId, arr);
  }
  const resolvedMatches = [...matchGroupMap.values()].map((arr) =>
    [...arr].sort((a, b) => MARKET_ORDER[a.market] - MARKET_ORDER[b.market]),
  );
  // 시장 하나의 모델 채점 요약 (적중/채점 수) — 접힌 상태 칩 표시용.
  const marketSummary = (d: DP) => {
    let graded = 0, correct = 0;
    for (const c of d.cells.values()) {
      if (c.correct === null) continue;
      graded++;
      if (c.correct) correct++;
    }
    return { graded, correct };
  };

  const fmtDate = (d: Date) => d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });
  const fmtTime = (d: Date) => d.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
  // 롤링 탤리 표기 — 채점 0건이면 "—".
  const rollLabel = (t: Tally) =>
    t.graded > 0 ? `${(t.rate * 100).toFixed(1)}% (${t.correct}/${t.graded})` : "—";

  const leader = gradedModels[0];
  const citeDate = new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" });
  const citeUrl = `${SITE_URL}/predictions/scorecard`;
  const citation =
    leader
      ? `AI 예측 성적표 — ${gradedModels.map((m) => `${m.label} ${(m.tally.rate * 100).toFixed(1)}%`).join(", ")} (채점 ${leader.tally.graded}경기 기준, ${present.length}개 AI 리더보드 · 출처 Scorebase ${citeUrl}, ${citeDate})`
      : `AI 예측 성적표 — 멀티 AI 승부예측 리더보드 (출처 Scorebase ${citeUrl})`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "AI 예측 성적표 — 멀티 AI 승부예측 리더보드",
    description: "여러 AI가 같은 경기를 경기 전에 예측하고 결과로 채점한 1X2·핸디캡·오버언더 적중률 비교 데이터셋.",
    url: citeUrl,
    keywords: ["AI 예측 성적표", "멀티 AI 승부예측", "AI 적중률 비교", "Grok 예측", "Gemini 예측"],
    creator: { "@type": "Organization", name: "스코어베이스", url: SITE_URL },
    isAccessibleForFree: true,
  };

  return (
    <main className="relative max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <AmbientGlow />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />

      <header className="mb-10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <Users className="h-3 w-3" aria-hidden /> 멀티 AI 리더보드
        </span>
        <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-white">
          AI 예측 성적표
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-zinc-600 dark:text-white/60">
          스코어베이스 통계모델과 <strong className="text-zinc-800 dark:text-white/80">GPT·Claude·Grok·Gemini·Qwen·Kimi</strong> 등
          여러 AI가 <strong className="text-zinc-800 dark:text-white/80">정확히 같은 경기</strong>를 경기 전에 예측합니다.
          1X2·핸디캡·오버언더 세 시장을 두고 맞붙어, 결과가 나오면 <strong className="text-zinc-800 dark:text-white/80">전패까지 그대로</strong> 채점해 쌓습니다.
        </p>
      </header>

      {/* 진화 선언 — 낮은 적중률·신규 모델의 소표본을 방문자가 "부실"이 아니라 "검증 과정"으로
          읽게 하는 맥락. 회원 게이트(ConsensusGate)보다 앞이라 비로그인도 본다(사용자 지시).
          숫자는 전부 DB 동적(하드코딩 금지). */}
      <section className="mb-12">
        <div className="rounded-3xl bg-gradient-to-br from-emerald-500/[0.07] to-sky-500/[0.07] p-6 ring-1 ring-emerald-500/20 dark:from-emerald-500/10 dark:to-sky-500/10">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-600 dark:text-emerald-400">
            계속 진화하는 성적표
          </div>
          <h2 className="mt-2 text-[19px] font-bold text-zinc-900 dark:text-white">
            AI는 오늘보다 내일 더 정확해집니다
          </h2>
          <div className="mt-3 space-y-3 text-[14px] leading-relaxed text-zinc-700 dark:text-white/70">
            <p>
              스포츠 예측에 완성된 모델은 없습니다. 그래서 스코어베이스는 하나의 AI에 기대는 대신,
              시장에 새로운 모델이 나올 때마다 <strong>같은 경기·같은 데이터·같은 기준</strong>으로 투입해
              실제 결과로 검증합니다. 지금 <strong>{board.length}개</strong>가 이 성적표 위에서 경쟁하고 있고,
              지금까지 <strong>{totalGraded.toLocaleString()}건</strong>이 채점됐습니다.
            </p>
            <p>
              새로 합류한 모델은 처음엔 미숙합니다. 표본이 {RANK_MIN}건을 넘기 전까지 순위에 올리지 않는 이유이기도 합니다.
              그러나 데이터가 쌓일수록 어떤 리그에 강하고 어떤 시장에서 흔들리는지가 드러나고,
              그 약점이 다음 개선의 출발점이 됩니다.
            </p>
            <p>
              <strong>틀린 예측도 지우지 않습니다.</strong> 맞은 것만 남기면 성적표가 아니라 광고가 됩니다.
              경기 시작 전에 제출된 픽을 그대로 두고 결과로 채점하는 이 기록 전부가,
              다음 모델을 고르고 프롬프트를 다듬는 근거가 됩니다.
            </p>
            <p className="text-[13px] text-zinc-500 dark:text-white/45">
              이 페이지는 새로운 AI가 등장할 때마다 갱신됩니다. 회원으로 가입하시면 예정 경기의 전체 AI 픽을 보고,
              같은 기준으로 직접 채점받으실 수 있습니다.
            </p>
            <Link
              href="/lab"
              className="mt-1 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] font-bold text-white transition-opacity hover:opacity-85"
            >
              <FlaskConical className="h-4 w-4" aria-hidden />
              나만의 맞춤 예측 봇 만들기 — 손잡이 5개로 백테스트까지
            </Link>
          </div>
        </div>
      </section>

      {/* 고신뢰 픽 히어로 — 확률 65%+ 픽의 실제 적중률. 표본 30건부터 노출. */}
      {confGraded >= RANK_MIN && (
        <section className="mb-12">
          <div className="rounded-3xl bg-gradient-to-br from-emerald-500/[0.07] to-sky-500/[0.07] p-6 ring-1 ring-emerald-500/20 dark:from-emerald-500/10 dark:to-sky-500/10">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-600 dark:text-emerald-400">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> 고신뢰 픽 적중률
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
              <div>
                <span className="text-4xl sm:text-5xl font-bold tabular-nums text-zinc-900 dark:text-white">
                  {(confRate * 100).toFixed(1)}%
                </span>
                <span className="ml-2 text-[14px] text-zinc-500 dark:text-white/50 tabular-nums">
                  {confWins}적중 / {confGraded}픽
                </span>
              </div>
            </div>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-zinc-600 dark:text-white/50">
              통계모델과 AI들이 <strong className="text-zinc-800 dark:text-white/75">확률 {Math.round(CONF_MIN * 100)}% 이상</strong>으로
              확신한 픽만 모은 실제 성적입니다. 확신이 강한 픽일수록 정말 더 많이 맞는지, 전 시장 누적으로 검증합니다.
            </p>
          </div>
        </section>
      )}

      {/* 리더보드 */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-white">
          <Trophy className="h-4 w-4 text-rose-500" aria-hidden /> 누적 적중률 리더보드
        </h2>
        <div className="space-y-2">
          {gradedModels.map((b, i) => {
            const a = ACCENT[b.accent];
            return (
              <div
                key={b.model}
                className={`relative overflow-hidden rounded-2xl bg-white p-4 shadow-sm ring-1 dark:bg-white/[0.04] ${i === 0 ? a.ring + " ring-2" : "ring-zinc-200/70 dark:ring-white/10"}`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-6 shrink-0 text-center text-sm font-bold ${i === 0 ? a.text : "text-zinc-400 dark:text-white/30"}`}>
                    {i + 1}
                  </span>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${a.dot}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[15px] font-semibold text-zinc-900 dark:text-white">
                        {b.label}
                        {i === 0 && <span className="ml-1.5 align-middle text-[10px] font-bold text-amber-500">1위</span>}
                      </span>
                      <span className={`shrink-0 text-xl font-bold tabular-nums ${a.text}`}>
                        {(b.tally.rate * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.06]">
                      <div className={`h-full rounded-full ${a.bar}`} style={{ width: `${(b.tally.rate / maxRate) * 100}%` }} />
                    </div>
                    <div className="mt-1 text-[11px] tabular-nums text-zinc-400 dark:text-white/30">
                      {b.tally.correct} / {b.tally.graded} 적중 · 최근 {b.recent.graded}건 {b.recent.correct}적중
                      {b.yday.graded > 0 && <> · 어제 {b.yday.correct}/{b.yday.graded}</>}
                    </div>
                    <div className="mt-0.5 text-[11px] tabular-nums text-zinc-400 dark:text-white/30">
                      최근 7일 {rollLabel(b.r7)} · 14일 {rollLabel(b.r14)} · 30일 {rollLabel(b.r30)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {(provisionalModels.length > 0 || pendingModels.length > 0) && (
          <div className="mt-3 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200/70 dark:bg-white/[0.02] dark:ring-white/10">
            <div className="mb-2 text-[12px] font-medium text-zinc-500 dark:text-white/40">
              표본 누적 중 — 채점 {RANK_MIN}건부터 순위에 반영됩니다
            </div>
            <div className="flex flex-wrap gap-2">
              {provisionalModels.map((b) => {
                const a = ACCENT[b.accent];
                return (
                  <span key={b.model} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium ${a.soft} ${a.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} aria-hidden />
                    {b.label}
                    <span className="tabular-nums">{(b.tally.rate * 100).toFixed(1)}%</span>
                    <span className="tabular-nums opacity-70">{b.tally.correct}/{b.tally.graded}</span>
                  </span>
                );
              })}
              {pendingModels.map((b) => {
                const a = ACCENT[b.accent];
                return (
                  <span key={b.model} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium ${a.soft} ${a.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} aria-hidden />
                    {b.label}
                    <span className="tabular-nums opacity-70">예측 {b.tally.predicted} · 채점 대기</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}
        {leader && (
          <p className="mt-3 text-center text-[13px] text-zinc-500 dark:text-white/40">
            채점 {leader.tally.graded}경기 기준 · 같은 경기·같은 라인으로 공정 비교
            {leader.tally.graded < 50 && <span className="text-amber-600 dark:text-amber-400"> · 표본 누적 중</span>}
          </p>
        )}
      </section>

      {/* 다가오는 맞대결 — AI 원탁 */}
      {upcoming.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-white">
            <Clock className="h-4 w-4 text-rose-500" aria-hidden /> 다가오는 맞대결 — AI 원탁
          </h2>
          <p className="mb-3 text-[13px] text-zinc-500 dark:text-white/40">
            예정 경기를 두고 각 AI가 낸 1X2·핸디캡·오버언더 픽. 다수결이 갈릴수록 어려운 경기입니다.
          </p>
          <div className="mb-4 flex items-center gap-2.5 rounded-xl bg-emerald-500/[0.07] px-3.5 py-2.5 ring-1 ring-emerald-500/15 flex-wrap">
            <span className="text-[13px] text-zinc-700 dark:text-white/70">
              <strong>AI {board.length}개와 대결해 보세요</strong> — 경기에서 픽을 남기면 AI와 같은 기준으로 채점되고, 적중률이 기록됩니다.
            </span>
            <Link
              href="/signup?from=%2Fpredictions%2Fscorecard"
              className="ml-auto shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-bold text-white transition-opacity hover:opacity-85"
            >
              3초 구글 가입
            </Link>
          </div>
          {(() => {
            const renderCard = (e: UpMatch) => {
              const con = consensusOf(e.picks);
              const split = con.agree < con.total;
              return (
                <div key={e.matchId} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 dark:bg-white/[0.04] dark:ring-white/10">
                  <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-white/40">
                    <LeagueBadge league={e.league} />
                    <span>{fmtDate(e.startTime)} {fmtTime(e.startTime)}</span>
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${split ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}>
                      {split ? `의견 갈림 ${con.agree}/${con.total}` : `만장일치 ${con.total}`}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <TeamsLine
                      league={e.league}
                      externalId={e.externalId}
                      home={e.home}
                      away={e.away}
                      homeRaw={e.homeRaw}
                      awayRaw={e.awayRaw}
                      homeLogo={e.homeLogo}
                      awayLogo={e.awayLogo}
                    />
                    <Link
                      href={matchHref(e.league, e.externalId)}
                      className="text-[12px] font-semibold text-emerald-600 underline-offset-2 hover:underline dark:text-emerald-400"
                    >
                      내 픽 남기기 →
                    </Link>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {e.picks.map((p) => {
                      const a = ACCENT[metaOf(p.model).accent];
                      return (
                        <span key={p.model} className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-50 px-2.5 py-1.5 text-[12px] ring-1 ring-zinc-100 dark:bg-white/[0.03] dark:ring-white/[0.06]">
                          <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} aria-hidden />
                          <span className="text-zinc-400 dark:text-white/40">{metaOf(p.model).label}</span>
                          <span className="font-semibold text-zinc-800 dark:text-white/80">{shortPick(p.pick, e.home, e.away)}</span>
                          <span className="tabular-nums text-zinc-400 dark:text-white/30">{(p.prob * 100).toFixed(0)}%</span>
                        </span>
                      );
                    })}
                  </div>
                  {e.extras.length > 0 && (
                    <details className="group mt-2.5">
                      <summary className="flex cursor-pointer list-none items-center gap-1 text-[12px] font-medium text-zinc-400 hover:text-zinc-600 dark:text-white/35 dark:hover:text-white/60 [&::-webkit-details-marker]:hidden">
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform duration-300 group-open:rotate-180" aria-hidden />
                        {e.extras.map((x) => MARKET_META.find((m) => m.key === x.market)?.label).join("·")} 픽 보기
                      </summary>
                      <div className="mt-2 space-y-2.5">
                        {e.extras.map((x) => (
                          <div key={x.market}>
                            <div className="text-[11px] font-bold uppercase tracking-wide text-zinc-400 dark:text-white/35">
                              {MARKET_META.find((m) => m.key === x.market)?.label}
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {x.picks.map((p) => {
                                const a = ACCENT[metaOf(p.model).accent];
                                return (
                                  <span key={p.model} className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-50 px-2.5 py-1.5 text-[12px] ring-1 ring-zinc-100 dark:bg-white/[0.03] dark:ring-white/[0.06]">
                                    <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} aria-hidden />
                                    <span className="text-zinc-400 dark:text-white/40">{metaOf(p.model).label}</span>
                                    <span className="font-semibold text-zinc-800 dark:text-white/80">{pickText(x.market, p.pick, e.home, e.away, p.line)}</span>
                                    <span className="tabular-nums text-zinc-400 dark:text-white/30">{(p.prob * 100).toFixed(0)}%</span>
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              );
            };
            return (
              <ConsensusGate
                title={`AI ${board.length}개의 예정 경기 픽은 회원 공개입니다`}
                desc="무료 가입하면 모든 예정 경기의 AI 픽과 만장일치·의견갈림을 볼 수 있고, 내 픽도 AI와 같은 기준으로 채점됩니다."
              >
                <div className="space-y-2">{upcoming.slice(0, 20).map(renderCard)}</div>
              </ConsensusGate>
            );
          })()}
        </section>
      )}

      {/* 만장일치 성적 — 원탁의 만장일치/의견갈림 뱃지가 실제 성적 차이를 만드는지 */}
      {unanAll.graded >= RANK_MIN && splitAll.graded >= RANK_MIN && (
        <section className="mb-12">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-white">
            <Handshake className="h-4 w-4 text-rose-500" aria-hidden /> 만장일치는 얼마나 맞았나
          </h2>
          <p className="mb-4 text-[13px] text-zinc-500 dark:text-white/40">
            위 원탁에 붙는 <strong className="text-zinc-600 dark:text-white/60">만장일치</strong> 뱃지가 실제로 성적 차이를 만드는지
            채점 기록으로 확인합니다. AI {MIN_PANEL}개 이상이 픽을 낸 경기만 셉니다.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-emerald-500/[0.07] p-5 ring-1 ring-emerald-500/20">
              <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-600 dark:text-emerald-400">
                전원 같은 픽
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-4xl font-bold tabular-nums text-zinc-900 dark:text-white">
                  {(rateOf(unanAll) * 100).toFixed(1)}%
                </span>
                <span className="text-[13px] tabular-nums text-zinc-500 dark:text-white/40">
                  {unanAll.correct} / {unanAll.graded}
                </span>
              </div>
            </div>
            <div className="rounded-2xl bg-amber-500/[0.07] p-5 ring-1 ring-amber-500/20">
              <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-600 dark:text-amber-400">
                의견 갈림
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-4xl font-bold tabular-nums text-zinc-900 dark:text-white">
                  {(rateOf(splitAll) * 100).toFixed(1)}%
                </span>
                <span className="text-[13px] tabular-nums text-zinc-500 dark:text-white/40">
                  {splitAll.correct} / {splitAll.graded}
                </span>
              </div>
            </div>
          </div>
          <p className="mt-2.5 text-center text-[13px] text-zinc-500 dark:text-white/40">
            AI들이 뭉쳤을 때가{" "}
            <strong className={agreeGap >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
              {agreeGap >= 0 ? "+" : ""}{(agreeGap * 100).toFixed(1)}%p
            </strong>{" "}
            {agreeGap >= 0 ? "더 맞았습니다" : "오히려 덜 맞았습니다"}
          </p>

          {agreeRows.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/70 dark:bg-white/[0.04] dark:ring-white/10">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-black/5 text-[11px] uppercase tracking-wide text-zinc-400 dark:border-white/5 dark:text-white/35">
                    <th className="px-4 py-2.5 text-left font-semibold">시장</th>
                    <th className="px-3 py-2.5 text-right font-semibold">전원 같은 픽</th>
                    <th className="px-3 py-2.5 text-right font-semibold">의견 갈림</th>
                    <th className="px-4 py-2.5 text-right font-semibold">차이</th>
                  </tr>
                </thead>
                <tbody>
                  {agreeRows.map((r) => {
                    const gap = rateOf(r.unan) - rateOf(r.split);
                    return (
                      <tr key={r.key} className="border-b border-black/[0.03] last:border-0 dark:border-white/[0.03]">
                        <td className="px-4 py-2.5 font-semibold text-zinc-800 dark:text-white/80">{r.label}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-zinc-600 dark:text-white/60">
                          {(rateOf(r.unan) * 100).toFixed(1)}%
                          <span className="ml-1 text-[11px] text-zinc-400 dark:text-white/30">({r.unan.correct}/{r.unan.graded})</span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-zinc-600 dark:text-white/60">
                          {(rateOf(r.split) * 100).toFixed(1)}%
                          <span className="ml-1 text-[11px] text-zinc-400 dark:text-white/30">({r.split.correct}/{r.split.graded})</span>
                        </td>
                        <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${gap >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                          {gap >= 0 ? "+" : ""}{(gap * 100).toFixed(1)}%p
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {betrayals.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-[13px] font-bold text-zinc-800 dark:text-white/80">
                만장일치가 배신당한 경기
                <span className="ml-1.5 font-normal text-zinc-400 dark:text-white/30">
                  전원 같은 픽 {unanAll.total}건 중 {unanAll.sweepFail}건이 전원 오답
                </span>
              </div>
              <div className="space-y-1.5">
                {betrayals.slice(0, 6).map((b) => (
                  <div
                    key={`${b.dp.matchId}:${b.dp.market}`}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-rose-500/[0.05] px-3.5 py-2.5 ring-1 ring-rose-500/15"
                  >
                    <LeagueBadge league={b.dp.league} />
                    <TeamsLine
                      league={b.dp.league}
                      externalId={b.dp.externalId}
                      home={b.dp.home}
                      away={b.dp.away}
                      homeRaw={b.dp.homeRaw}
                      awayRaw={b.dp.awayRaw}
                      homeLogo={b.dp.homeLogo}
                      awayLogo={b.dp.awayLogo}
                    />
                    <span className="tabular-nums text-xs font-semibold text-zinc-500 dark:text-white/50">
                      {b.dp.homeScore ?? "-"}:{b.dp.awayScore ?? "-"}
                    </span>
                    <span className="ml-auto flex items-center gap-1.5 text-[12px]">
                      <span className="text-zinc-400 dark:text-white/35">
                        AI {b.panel}개 전원 {MARKET_META.find((m) => m.key === b.dp.market)?.label}
                      </span>
                      <span className="rounded-md bg-rose-500/10 px-2 py-0.5 font-semibold text-rose-600 dark:text-rose-400">
                        {pickText(b.dp.market, b.pick, b.dp.home, b.dp.away, b.line)}
                      </span>
                      <X className="h-3.5 w-3.5 text-rose-500" aria-hidden />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 시장별 성적 */}
      {perMarket.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-white">
            <Sparkles className="h-4 w-4 text-rose-500" aria-hidden /> 시장별 성적
          </h2>
          <ConsensusGate
            title="시장별 상세 성적은 회원 공개입니다"
            desc="1X2·핸디캡·오버언더 시장별 AI 성적을 무료 가입 후 볼 수 있습니다."
          >
          <div className="grid gap-3 sm:grid-cols-3">
            {perMarket.map((mm) => (
              <div key={mm.key} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 dark:bg-white/[0.04] dark:ring-white/10">
                <div className="mb-2 text-[13px] font-bold text-zinc-800 dark:text-white/80">{mm.label}</div>
                <div className="space-y-1.5">
                  {mm.models.map((x) => {
                    const a = ACCENT[x.accent];
                    return (
                      <div key={x.model} className="flex items-center justify-between text-[12px]">
                        <span className="flex items-center gap-1.5 text-zinc-500 dark:text-white/50">
                          <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} aria-hidden /> {x.label}
                        </span>
                        <span className={`font-semibold tabular-nums ${a.text}`}>
                          {(x.tally.rate * 100).toFixed(1)}%
                          <span className="ml-1 font-normal text-zinc-400 dark:text-white/30">({x.tally.correct}/{x.tally.graded})</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          </ConsensusGate>
        </section>
      )}

      {/* 리그별 성적 */}
      {leagueMain.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-white">
            <Crown className="h-4 w-4 text-rose-500" aria-hidden /> 리그별 성적
          </h2>
          <p className="mb-4 text-[13px] text-zinc-500 dark:text-white/40">
            리그마다 강한 AI가 다릅니다. 같은 리그·같은 경기끼리만 줄 세운 순위입니다.
            리그 사이 적중률은 종목 난이도가 달라(야구는 무승부가 없고, 축구 1X2 는 세 갈래) 직접 비교하지 마세요.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {leagueMain.map((lb) => {
              const top = lb.models[0];
              const ta = ACCENT[top.accent];
              return (
                <div key={lb.league} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 dark:bg-white/[0.04] dark:ring-white/10">
                  <div className="mb-2 flex items-center gap-2">
                    <LeagueBadge league={lb.league} />
                    <span className="ml-auto text-[11px] tabular-nums text-zinc-400 dark:text-white/30">
                      채점 {lb.graded}
                    </span>
                  </div>
                  <div className="mb-2.5 flex items-baseline gap-1.5">
                    <Crown className={`h-3.5 w-3.5 shrink-0 self-center ${ta.text}`} aria-hidden />
                    <span className="truncate text-[13px] font-bold text-zinc-800 dark:text-white/80">{top.label}</span>
                    <span className={`ml-auto shrink-0 text-lg font-bold tabular-nums ${ta.text}`}>
                      {(top.tally.rate * 100).toFixed(1)}%
                      <span className="ml-1 text-[12px] font-normal text-zinc-400 dark:text-white/30">({top.tally.correct}/{top.tally.graded})</span>
                    </span>
                  </div>
                  <div className="space-y-1.5 border-t border-black/5 pt-2.5 dark:border-white/5">
                    {lb.models.slice(1).map((x) => {
                      const a = ACCENT[x.accent];
                      return (
                        <div key={x.model} className="flex items-center justify-between text-[12px]">
                          <span className="flex items-center gap-1.5 text-zinc-500 dark:text-white/50">
                            <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} aria-hidden /> {x.label}
                          </span>
                          <span className={`font-semibold tabular-nums ${a.text}`}>
                            {(x.tally.rate * 100).toFixed(1)}%
                            <span className="ml-1 font-normal text-zinc-400 dark:text-white/30">({x.tally.correct}/{x.tally.graded})</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {leagueThin.length > 0 && (
            <div className="mt-3 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200/70 dark:bg-white/[0.02] dark:ring-white/10">
              <div className="mb-2 text-[12px] font-medium text-zinc-500 dark:text-white/40">
                표본 누적 중 — 한 모델이 {RANK_MIN}건 이상 채점된 리그부터 카드로 올라옵니다
              </div>
              <div className="flex flex-wrap gap-2">
                {leagueThin.map((lb) => (
                  <span key={lb.league} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[12px] font-medium text-zinc-500 ring-1 ring-zinc-200/70 dark:bg-white/[0.04] dark:text-white/50 dark:ring-white/10">
                    <LeagueBadge league={lb.league} />
                    <span className="tabular-nums">채점 {lb.graded}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 경기별 성적 피드 */}
      {resolved.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-white">
            <Trophy className="h-4 w-4 text-rose-500" aria-hidden /> 경기별 성적
          </h2>
          <ConsensusGate
            title="경기별 픽 기록은 회원 공개입니다"
            desc="어떤 AI가 어떤 경기에서 무엇을 찍고 맞았는지, 전체 기록을 무료 가입 후 볼 수 있습니다."
          >
          <div className="space-y-2">
            {resolvedMatches.slice(0, 30).map((mkts) => {
              const f = mkts[0];
              return (
                <details
                  key={f.matchId}
                  className="group overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/70 dark:bg-white/[0.04] dark:ring-white/10"
                >
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1.5 p-3.5 [&::-webkit-details-marker]:hidden">
                    <LeagueBadge league={f.league} />
                    <TeamsLine
                      league={f.league}
                      externalId={f.externalId}
                      home={f.home}
                      away={f.away}
                      homeRaw={f.homeRaw}
                      awayRaw={f.awayRaw}
                      homeLogo={f.homeLogo}
                      awayLogo={f.awayLogo}
                    />
                    <span className="tabular-nums text-xs font-semibold text-zinc-500 dark:text-white/50">
                      {f.homeScore ?? "-"}:{f.awayScore ?? "-"}
                    </span>
                    <span className="text-[11px] text-zinc-400 dark:text-white/30">{fmtDate(f.startTime)}</span>
                    <span className="ml-auto flex items-center gap-1.5">
                      {mkts.map((d) => {
                        const s = marketSummary(d);
                        return (
                          <span
                            key={d.market}
                            className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-zinc-500 dark:bg-white/[0.06] dark:text-white/50"
                          >
                            {MARKET_META.find((m) => m.key === d.market)?.label} {s.correct}/{s.graded}
                          </span>
                        );
                      })}
                      <ChevronDown
                        className="h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-300 group-open:rotate-180"
                        aria-hidden
                      />
                    </span>
                  </summary>
                  <div className="space-y-3 border-t border-black/5 px-3.5 pb-3.5 pt-3 dark:border-white/5">
                    {mkts.map((d) => (
                      <div key={d.market}>
                        <div className="text-[11px] font-bold uppercase tracking-wide text-zinc-400 dark:text-white/35">
                          {MARKET_META.find((m) => m.key === d.market)?.label}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {present.map((m) => {
                            const c = d.cells.get(m);
                            if (!c || c.correct === null) return null;
                            const a = ACCENT[metaOf(m).accent];
                            return (
                              <span key={m} className="inline-flex items-center gap-1 rounded-lg bg-zinc-50 px-2 py-1 text-[11px] ring-1 ring-zinc-100 dark:bg-white/[0.03] dark:ring-white/[0.06]">
                                <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} aria-hidden />
                                <span className="text-zinc-400 dark:text-white/40">{metaOf(m).label}</span>
                                <span className="font-medium text-zinc-700 dark:text-white/70">{pickText(d.market, c.pick, d.home, d.away, c.line)}</span>
                                {c.correct ? (
                                  <Check className="h-3 w-3 text-emerald-500" aria-hidden />
                                ) : (
                                  <X className="h-3 w-3 text-rose-500" aria-hidden />
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
          </ConsensusGate>
        </section>
      )}

      {/* 방법론 + 인용 */}
      <section className="space-y-4">
        <div className="rounded-2xl bg-zinc-50 p-5 text-[13px] leading-relaxed text-zinc-600 ring-1 ring-zinc-200/70 dark:bg-white/[0.03] dark:text-white/50 dark:ring-white/10">
          <p className="font-semibold text-zinc-700 dark:text-white/70">계산 방법</p>
          <p className="mt-1.5">
            모든 AI가 <strong>경기 시작 전</strong>에 1X2·핸디캡·오버언더 픽을 제출합니다. 스코어베이스 AI는
            Elo·Dixon-Coles + 선발/골리 + 시장 배당 블렌드 통계모델이고, 나머지 AI(GPT·Claude·Grok·Gemini·Qwen·Kimi)는
            같은 경기 데이터(순위·최근 폼·홈/원정·휴식일·상대전적)와 <strong>동일한 기준선</strong>을 받아
            (우리 모델 수치는 보지 않고) 독립 예측합니다. 경기가 끝나면 같은 라인으로 채점합니다(축구는 정규시간 기준).
            공정성을 위해 같은 경기·같은 시장만 비교하며, 각 모델의 예측 시점 이후 종료된 경기부터 성적에 반영됩니다.
          </p>
          <p className="mt-2 text-zinc-500 dark:text-white/40">
            전체 리그·시장별 적중률은{" "}
            <Link href="/predictions/accuracy" className="font-medium text-rose-600 underline-offset-2 hover:underline dark:text-rose-400">
              AI 예측 적중률 보드
            </Link>
            에서 확인하세요.
          </p>
        </div>
        <CiteBox citation={citation} url={citeUrl} />
      </section>
    </main>
  );
}
