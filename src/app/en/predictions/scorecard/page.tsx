// /en/predictions/scorecard — 멀티 AI 성적표 (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
import type { Metadata } from "next";
import Link from "next/link";
import { Check, X, Trophy, Sparkles, Clock, Users, ChevronDown, Crown, Handshake, FlaskConical } from "lucide-react";
import { prisma } from "@/lib/db";
import AmbientGlow from "@/components/AmbientGlow";
import LeagueBadge from "@/components/en/LeagueBadge";
import TeamBadge from "@/components/TeamBadge";
import CiteBox from "@/components/en/CiteBox";
import ConsensusGate from "@/components/en/predictions/ConsensusGate";
import { toEnglishTeamName } from "@/lib/i18n/en";
import { fifaFlag, isNationalTeamLeague } from "@/lib/sports/fifa-rankings";
import { SITE_URL } from "@/lib/site-url"; // www 강제 정규화(apex 새어나감 방지)
import { ogPageImage } from "@/lib/seo/og";
import { isGptScorecardModel } from "@/lib/predict/gpt-scorecard-model";
import { koEnLanguages } from "@/lib/i18n/en";
import { jsonLdScript } from "@/lib/seo/jsonld";
import { matchLiveHref } from "@/lib/links/match-live-link";

export const revalidate = 1800; // 30분 ISR

type Market = "1X2" | "HANDICAP" | "OU";
const MARKET_META: { key: Market; label: string }[] = [
  { key: "1X2", label: "1X2" },
  { key: "HANDICAP", label: "Handicap" },
  { key: "OU", label: "Over/Under" },
];

// 모델 표시 메타 — gpt-5.5/5.6 은 "gpt" 로 통합. accent 는 panelists.ts 와 맞춤.
type Accent = "rose" | "emerald" | "sky" | "amber" | "teal" | "violet" | "indigo";
const MODEL_META: Record<string, { label: string; accent: Accent; order: number }> = {
  scorebase: { label: "Scorebase", accent: "rose", order: 0 },
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
  title: "AI Prediction Scorecard — GPT, Claude, Grok, Gemini, Qwen and Kimi Leaderboard",
  description:
    "Several AI models predict the same fixtures before kick-off and are scored on the result. A transparent leaderboard of 1X2, handicap and over/under accuracy for the Scorebase statistical model, GPT, Claude, Grok, Gemini, Qwen and Kimi K3.",
  keywords: [
    "AI Prediction Scorecard", "multi-AI predictions", "AI accuracy comparison", "GPT predictions", "Grok predictions",
    "Gemini predictions", "Claude predictions", "Kimi predictions", "AI sports prediction leaderboard", "handicap predictions", "over/under predictions",
  ],
  alternates: {
    canonical: `${SITE_URL}/en/predictions/scorecard`,
    // 영어판 hreflang 상호 연결
    languages: koEnLanguages("/predictions/scorecard", "/en/predictions/scorecard"),
  },
  openGraph: {
    title: "AI Prediction Scorecard — Multi-AI Leaderboard",
    description: "Scorebase, GPT, Claude, Grok, Gemini, Qwen and Kimi going head-to-head on the same fixtures.",
    url: `${SITE_URL}/predictions/scorecard`,
    images: ogPageImage({ title: "AI Prediction Scorecard", subtitle: "Multi-AI prediction leaderboard", tag: "AI head-to-head" }),
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
  if (market === "OU") return `${pick === "OVER" ? "Over" : "Under"}${line != null ? ` ${line}` : ""}`;
  if (market === "HANDICAP") return `${pick === "HOME" ? home : away}${line != null ? ` ${pick === "HOME" ? "-" : "+"}${Math.abs(line)}` : ""}`;
  if (pick === "HOME") return home;
  if (pick === "AWAY") return away;
  return "Draw";
}
function shortPick(pick: string, home: string, away: string): string {
  if (pick === "HOME") return home;
  if (pick === "AWAY") return away;
  if (pick === "DRAW") return "D";
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
      href={matchLiveHref(props.league, props.externalId)}
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
        home: toEnglishTeamName(m.homeTeam.name),
        away: toEnglishTeamName(m.awayTeam.name),
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
  // 서버 컴포넌트 — 요청(또는 revalidate)마다 1회 렌더라 클라이언트 렌더 순수성 규칙 대상이 아니다.
  // eslint-disable-next-line react-hooks/purity
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

  const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });
  const fmtTime = (d: Date) => d.toLocaleTimeString("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
  // 롤링 탤리 표기 — 채점 0건이면 "—".
  const rollLabel = (t: Tally) =>
    t.graded > 0 ? `${(t.rate * 100).toFixed(1)}% (${t.correct}/${t.graded})` : "—";

  const leader = gradedModels[0];
  const citeDate = new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" });
  const citeUrl = `${SITE_URL}/predictions/scorecard`;
  const citation =
    leader
      ? `AI Prediction Scorecard — ${gradedModels.map((m) => `${m.label} ${(m.tally.rate * 100).toFixed(1)}%`).join(", ")} (scored ${leader.tally.graded} matches, ${present.length} AI leaderboard · source Scorebase ${citeUrl}, ${citeDate})`
      : `AI Prediction Scorecard — multi-AI leaderboard (source Scorebase ${citeUrl})`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "AI Prediction Scorecard — Multi-AI Leaderboard",
    description: "A dataset comparing 1X2, handicap and over/under accuracy across AI models predicting the same fixtures before kick-off.",
    url: citeUrl,
    keywords: ["AI Prediction Scorecard", "multi-AI predictions", "AI accuracy comparison", "Grok predictions", "Gemini predictions"],
    creator: { "@type": "Organization", name: "Scorebase", url: SITE_URL },
    isAccessibleForFree: true,
  };

  return (
    <main className="relative max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <AmbientGlow />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />

      <header className="mb-10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <Users className="h-3 w-3" aria-hidden /> multi-AI leaderboard
        </span>
        <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-white">
          AI Prediction Scorecard
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-zinc-600 dark:text-white/60">
          The Scorebase statistical model and <strong className="text-zinc-800 dark:text-white/80">GPT·Claude·Grok·Gemini·Qwen·Kimi</strong>  — several AI models predicting <strong className="text-zinc-800 dark:text-white/80">exactly the same fixtures</strong> before kick-off. They compete across 1X2, handicap and over/under, and once results land we score everything — <strong className="text-zinc-800 dark:text-white/80">losing runs included</strong> .
        </p>
      </header>

      {/* 진화 선언 — 낮은 적중률·신규 모델의 소표본을 방문자가 "부실"이 아니라 "검증 과정"으로
          읽게 하는 맥락. 회원 게이트(ConsensusGate)보다 앞이라 비로그인도 본다(사용자 지시).
          숫자는 전부 DB 동적(하드코딩 금지). */}
      <section className="mb-12">
        <div className="rounded-3xl bg-gradient-to-br from-emerald-500/[0.07] to-sky-500/[0.07] p-6 ring-1 ring-emerald-500/20 dark:from-emerald-500/10 dark:to-sky-500/10">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-600 dark:text-emerald-400">
            A scorecard that keeps evolving
          </div>
          <h2 className="mt-2 text-[19px] font-bold text-zinc-900 dark:text-white">
            AI gets more accurate over time
          </h2>
          <div className="mt-3 space-y-3 text-[14px] leading-relaxed text-zinc-700 dark:text-white/70">
            <p>
              No model is finished in sports prediction. Rather than lean on a single AI, Scorebase adds each new model as it appears and runs it on <strong>the same fixtures, the same data and the same standard</strong>, verified against actual results. Right now <strong>{board.length}</strong> are competing on this scorecard, and so far <strong>{totalGraded.toLocaleString()}</strong> have been scored.
            </p>
            <p>
              A newly added model starts rough. That is why we hold it off the ranking until the sample passes {RANK_MIN}.
              As data accumulates, it becomes clear which leagues a model handles well and which markets it wobbles in —
              and that weakness is where the next improvement starts.
            </p>
            <p>
              <strong>We do not delete the wrong calls.</strong> Keeping only the hits would make this an advert, not a scorecard.
              Every pick submitted before kick-off stays as it was and is scored on the result —
              and that full record is what informs the next model choice and prompt revision.
            </p>
            <p className="text-[13px] text-zinc-500 dark:text-white/45">
              This page updates whenever a new AI appears. Sign in to see every AI pick for upcoming fixtures and be scored on the same basis.
            </p>
            <Link
              href="/lab"
              className="mt-1 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] font-bold text-white transition-opacity hover:opacity-85"
            >
              <FlaskConical className="h-4 w-4" aria-hidden />
              Build your own prediction bot — five dials, backtest included
            </Link>
          </div>
        </div>
      </section>

      {/* 고신뢰 픽 히어로 — 확률 65%+ 픽의 실제 적중률. 표본 30건부터 노출. */}
      {confGraded >= RANK_MIN && (
        <section className="mb-12">
          <div className="rounded-3xl bg-gradient-to-br from-emerald-500/[0.07] to-sky-500/[0.07] p-6 ring-1 ring-emerald-500/20 dark:from-emerald-500/10 dark:to-sky-500/10">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-600 dark:text-emerald-400">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> High-confidence accuracy
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
              <div>
                <span className="text-4xl sm:text-5xl font-bold tabular-nums text-zinc-900 dark:text-white">
                  {(confRate * 100).toFixed(1)}%
                </span>
                <span className="ml-2 text-[14px] text-zinc-500 dark:text-white/50 tabular-nums">
                  {confWins}correct / {confGraded} picks
                </span>
              </div>
            </div>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-zinc-600 dark:text-white/50">
              The statistical model and the AI models, <strong className="text-zinc-800 dark:text-white/75">probability {Math.round(CONF_MIN * 100)}% or higher</strong> — the actual record of picks made at that confidence. Whether stronger conviction really does convert more often, verified across all markets.
            </p>
          </div>
        </section>
      )}

      {/* 리더보드 */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-white">
          <Trophy className="h-4 w-4 text-rose-500" aria-hidden /> Cumulative accuracy leaderboard
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
                        {i === 0 && <span className="ml-1.5 align-middle text-[10px] font-bold text-amber-500">1st</span>}
                      </span>
                      <span className={`shrink-0 text-xl font-bold tabular-nums ${a.text}`}>
                        {(b.tally.rate * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.06]">
                      <div className={`h-full rounded-full ${a.bar}`} style={{ width: `${(b.tally.rate / maxRate) * 100}%` }} />
                    </div>
                    <div className="mt-1 text-[11px] tabular-nums text-zinc-400 dark:text-white/30">
                      {b.tally.correct} / {b.tally.graded} correct · last {b.recent.graded} {b.recent.correct}correct
                      {b.yday.graded > 0 && <> · yesterday {b.yday.correct}/{b.yday.graded}</>}
                    </div>
                    <div className="mt-0.5 text-[11px] tabular-nums text-zinc-400 dark:text-white/30">
                      Last 7 days {rollLabel(b.r7)} · 14 days {rollLabel(b.r14)} · 30 days {rollLabel(b.r30)}
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
              Building sample — scored {RANK_MIN} needed to enter the ranking
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
                    <span className="tabular-nums opacity-70"> predictions {b.tally.predicted} · awaiting scoring</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}
        {leader && (
          <p className="mt-3 text-center text-[13px] text-zinc-500 dark:text-white/40">
            scored {leader.tally.graded} matches · same fixtures, same lines, fair comparison
            {leader.tally.graded < 50 && <span className="text-amber-600 dark:text-amber-400"> · building sample</span>}
          </p>
        )}
      </section>

      {/* 다가오는 맞대결 — AI 원탁 */}
      {upcoming.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-white">
            <Clock className="h-4 w-4 text-rose-500" aria-hidden /> Upcoming fixtures — the AI round table
          </h2>
          <p className="mb-3 text-[13px] text-zinc-500 dark:text-white/40">
            Each model's 1X2, handicap and over/under pick for upcoming fixtures. The more the votes split, the harder the match.
          </p>
          <div className="mb-4 flex items-center gap-2.5 rounded-xl bg-emerald-500/[0.07] px-3.5 py-2.5 ring-1 ring-emerald-500/15 flex-wrap">
            <span className="text-[13px] text-zinc-700 dark:text-white/70">
              <strong>AI {board.length} — take them on</strong>  — leave your own pick on a match and it is scored on the same basis, with your accuracy tracked.
            </span>
            <Link
              href="/signup?from=%2Fpredictions%2Fscorecard"
              className="ml-auto shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-bold text-white transition-opacity hover:opacity-85"
            >
              Sign in with Google
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
                      {split ? `Split ${con.agree}/${con.total}` : `Unanimous ${con.total}`}
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
                      href={matchLiveHref(e.league, e.externalId)}
                      className="text-[12px] font-semibold text-emerald-600 underline-offset-2 hover:underline dark:text-emerald-400"
                    >
                      Leave your pick →
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
                        {e.extras.map((x) => MARKET_META.find((m) => m.key === x.market)?.label).join("·")} See picks
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
                title={`AI ${board.length} upcoming fixtures' picks are for members`}
                desc="Sign up free to see every model's pick on upcoming fixtures, where they agree and split, and to have your own picks scored the same way."
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
            <Handshake className="h-4 w-4 text-rose-500" aria-hidden /> How often is unanimity right?
          </h2>
          <p className="mb-4 text-[13px] text-zinc-500 dark:text-white/40">
            The <strong className="text-zinc-600 dark:text-white/60">unanimous</strong>  badge on the round table above — does it actually change the hit rate? Checked against the scored record, counting only matches where at least {MIN_PANEL} models made a pick.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-emerald-500/[0.07] p-5 ring-1 ring-emerald-500/20">
              <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-600 dark:text-emerald-400">
                Unanimous
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
                Split
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
            When the models agreed, they were{" "}
            <strong className={agreeGap >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
              {agreeGap >= 0 ? "+" : ""}{(agreeGap * 100).toFixed(1)}%p
            </strong>{" "}
            {agreeGap >= 0 ? "more often right" : "actually less often right"}
          </p>

          {agreeRows.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/70 dark:bg-white/[0.04] dark:ring-white/10">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-black/5 text-[11px] uppercase tracking-wide text-zinc-400 dark:border-white/5 dark:text-white/35">
                    <th className="px-4 py-2.5 text-left font-semibold">market</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Unanimous</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Split</th>
                    <th className="px-4 py-2.5 text-right font-semibold">difference</th>
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
                When unanimity was wrong
                <span className="ml-1.5 font-normal text-zinc-400 dark:text-white/30">
                  Unanimous {unanAll.total} of  {unanAll.sweepFail} had every model wrong
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
                        AI {b.panel} all {MARKET_META.find((m) => m.key === b.dp.market)?.label}
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
            <Sparkles className="h-4 w-4 text-rose-500" aria-hidden /> By market
          </h2>
          <ConsensusGate
            title="Market-by-market detail is for members"
            desc="Sign up free to see each model's record in the 1X2, handicap and over/under markets."
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
            <Crown className="h-4 w-4 text-rose-500" aria-hidden /> By league
          </h2>
          <p className="mb-4 text-[13px] text-zinc-500 dark:text-white/40">
            Different models are strong in different leagues. This ranks them only within the same league and fixtures.
            Do not compare accuracy across leagues — the difficulty differs (baseball has no draw; football 1X2 has three ways).
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
                      scored {lb.graded}
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
                Building sample — a league appears as a card once a model has {RANK_MIN} scored predictions in it
              </div>
              <div className="flex flex-wrap gap-2">
                {leagueThin.map((lb) => (
                  <span key={lb.league} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[12px] font-medium text-zinc-500 ring-1 ring-zinc-200/70 dark:bg-white/[0.04] dark:text-white/50 dark:ring-white/10">
                    <LeagueBadge league={lb.league} />
                    <span className="tabular-nums">scored {lb.graded}</span>
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
            <Trophy className="h-4 w-4 text-rose-500" aria-hidden /> Match-by-match record
          </h2>
          <ConsensusGate
            title="Match-by-match picks are for members"
            desc="Sign up free to see which model picked what, on which match, and whether it landed."
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
          <p className="font-semibold text-zinc-700 dark:text-white/70">How it works</p>
          <p className="mt-1.5">
            Every model submits its <strong>before kick-off</strong> 1X2, handicap and over/under picks. The Scorebase model blends Elo and Dixon-Coles with starters, goalies and market odds; the others (GPT, Claude, Grok, Gemini, Qwen, Kimi) get the same match data — table, recent form, home/away, rest days, head-to-head — and <strong>the same baseline</strong>, predicting independently without sight of our model's numbers. Once a match ends, all are scored on the same lines (regulation time for football).
            For fairness only identical fixtures and markets are compared, and a model's record starts from matches finishing after it joined.
          </p>
          <p className="mt-2 text-zinc-500 dark:text-white/40">
            Accuracy across all leagues and markets is on the{" "}
            <Link href="/predictions/accuracy" className="font-medium text-rose-600 underline-offset-2 hover:underline dark:text-rose-400">
              AI accuracy board
            </Link>
            .
          </p>
        </div>
        <CiteBox citation={citation} url={citeUrl} />
      </section>
    </main>
  );
}
