import "server-only";
import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/claude";
import { hashPassword } from "@/lib/user-auth";
import { teamDisplayKo } from "@/lib/team-names";
import { kickoffLabel } from "@/lib/analysis/format";
import { leagueLabel } from "@/lib/analysis/matches";
import { botTeamName, parsePickJson, sportForLeague } from "@/lib/analysis/manager-bot";
import {
  GPT_SCORECARD_ACTIVE_MODEL,
  GPT_SCORECARD_LEGACY_MODELS,
  preferGptScorecardModel,
} from "@/lib/predict/gpt-scorecard-model";
import {
  gwakConfidence,
  passesGwakPolicy,
  selectedHandicap,
  type GwakMarket,
  type GwakPick,
} from "@/lib/analysis/gwak-policy";

const GWAK_EMAIL = "gwak-pickster@scorebase.internal";
export const GWAK_NICKNAME = "곽씨";
export const GWAK_DRAFT_CATEGORY = "PICK_DRAFT";
export const GWAK_REJECTED_CATEGORY = "PICK_REJECTED";

const HOUR = 60 * 60 * 1000;
const MIN_LEAD_HOURS = 3;
const MAX_LEAD_HOURS = 36;
const MARKET_MAX_AGE_HOURS = 48;
const DAILY_DRAFT_LIMIT = 3;

type Prediction = {
  model: string;
  market: string;
  pick: string;
  prob: number;
  line: number | null;
  reason: string | null;
  predictedAt: Date;
};

interface DraftCandidate {
  matchId: number;
  league: string;
  sport: string;
  startTime: Date;
  home: string;
  away: string;
  market: GwakMarket;
  pick: GwakPick;
  line: number | null;
  selectedLine: number | null;
  selectedOdds: number | null;
  statisticalProb: number;
  contextProb: number;
  confidence: number;
  valueEdgePp: number | null;
  movementPp: number | null;
  bookmakers: number | null;
  reason: string | null;
}

function kstDayStart(now: Date): Date {
  const shifted = new Date(now.getTime() + 9 * HOUR);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - 9 * HOUR);
}

function topOutcome(home: number | null, draw: number | null, away: number | null): GwakPick | null {
  const rows: Array<[GwakPick, number]> = [];
  if (home != null) rows.push(["HOME", home]);
  if (draw != null) rows.push(["DRAW", draw]);
  if (away != null) rows.push(["AWAY", away]);
  return rows.sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function selectedValue<T>(pick: GwakPick, home: T, draw: T, away: T): T {
  if (pick === "HOME") return home;
  if (pick === "DRAW") return draw;
  return away;
}

function linesMatch(first: number | null, second: number | null): boolean {
  return first != null && second != null && Math.abs(first - second) < 0.01;
}

function sanitizeReason(reason: string | null): string | null {
  if (!reason) return null;
  return reason.replace(/scorebase/gi, "통계 모델").replace(/gpt[-\s\w.]*/gi, "맥락 모델").replace(/\s+/g, " ").trim().slice(0, 220);
}

export async function ensureGwakPickster(): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { email: GWAK_EMAIL },
    select: { id: true, nickname: true, badge: true },
  });
  if (existing) {
    if (existing.nickname !== GWAK_NICKNAME || existing.badge != null) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { nickname: GWAK_NICKNAME, badge: null },
      });
    }
    return existing.id;
  }
  const passwordHash = await hashPassword(`gwak-${Date.now()}-${Math.random()}`);
  const user = await prisma.user.create({
    data: { email: GWAK_EMAIL, passwordHash, nickname: GWAK_NICKNAME },
    select: { id: true },
  });
  return user.id;
}

function choosePredictions(predictions: Prediction[], market: GwakMarket): [Prediction, Prediction] | null {
  const statistical = predictions.find((prediction) => prediction.model === "scorebase" && prediction.market === market);
  let context: Prediction | undefined;
  for (const prediction of predictions) {
    if (prediction.market !== market || prediction.model === "scorebase") continue;
    if (preferGptScorecardModel(context?.model, prediction.model)) context = prediction;
  }
  return statistical && context ? [statistical, context] : null;
}

async function findCandidates(authorId: string, now: Date): Promise<DraftCandidate[]> {
  const matches = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      startTime: {
        gte: new Date(now.getTime() + MIN_LEAD_HOURS * HOUR),
        lte: new Date(now.getTime() + MAX_LEAD_HOURS * HOUR),
      },
      posts: { none: { authorId } },
      aiPredictions: {
        some: {
          model: { in: ["scorebase", GPT_SCORECARD_ACTIVE_MODEL, ...GPT_SCORECARD_LEGACY_MODELS] },
          market: { in: ["1X2", "HANDICAP"] },
          published: true,
        },
      },
    },
    select: {
      id: true,
      league: true,
      startTime: true,
      marketBookmakers: true,
      marketUpdatedAt: true,
      oddsHome: true,
      oddsDraw: true,
      oddsAway: true,
      marketHome: true,
      marketDraw: true,
      marketAway: true,
      openingMarketHome: true,
      openingMarketDraw: true,
      openingMarketAway: true,
      oddsHcLine: true,
      oddsHcHome: true,
      oddsHcAway: true,
      homeTeam: { select: { name: true, nameKo: true } },
      awayTeam: { select: { name: true, nameKo: true } },
      aiPredictions: {
        where: {
          model: { in: ["scorebase", GPT_SCORECARD_ACTIVE_MODEL, ...GPT_SCORECARD_LEGACY_MODELS] },
          market: { in: ["1X2", "HANDICAP"] },
          published: true,
        },
        select: { model: true, market: true, pick: true, prob: true, line: true, reason: true, predictedAt: true },
      },
    },
    orderBy: { startTime: "asc" },
    take: 80,
  });

  const candidates: DraftCandidate[] = [];
  for (const match of matches) {
    const sport = sportForLeague(match.league);
    if (!sport) continue;
    const home = botTeamName(teamDisplayKo(match.homeTeam, match.league), match.league);
    const away = botTeamName(teamDisplayKo(match.awayTeam, match.league), match.league);
    const marketAgeHours = match.marketUpdatedAt ? (now.getTime() - match.marketUpdatedAt.getTime()) / HOUR : null;
    const freshMarket = (match.marketBookmakers ?? 0) >= 3 && marketAgeHours != null && marketAgeHours <= MARKET_MAX_AGE_HOURS;

    for (const market of ["HANDICAP", "1X2"] as const) {
      const pair = choosePredictions(match.aiPredictions, market);
      if (!pair) continue;
      const [statistical, context] = pair;
      if (statistical.pick !== context.pick || statistical.predictedAt >= match.startTime || context.predictedAt >= match.startTime) continue;
      if (!["HOME", "DRAW", "AWAY"].includes(context.pick)) continue;
      const pick = context.pick as GwakPick;
      if (market === "HANDICAP" && pick === "DRAW") continue;

      const line = market === "HANDICAP" ? (context.line ?? statistical.line) : null;
      if (market === "HANDICAP") {
        if (line == null || !linesMatch(line, match.oddsHcLine)) continue;
        if (context.line != null && statistical.line != null && !linesMatch(context.line, statistical.line)) continue;
      }

      const selectedOdds = market === "HANDICAP"
        ? pick === "HOME" ? match.oddsHcHome : match.oddsHcAway
        : selectedValue(pick, match.oddsHome, match.oddsDraw, match.oddsAway);
      const selectedMarket = market === "1X2"
        ? selectedValue(pick, match.marketHome, match.marketDraw, match.marketAway)
        : null;
      const selectedOpening = market === "1X2"
        ? selectedValue(pick, match.openingMarketHome, match.openingMarketDraw, match.openingMarketAway)
        : null;
      const marketPick = market === "1X2" ? topOutcome(match.marketHome, match.marketDraw, match.marketAway) : pick;
      const hasComparableMarket = freshMarket && selectedOdds != null && (market === "HANDICAP" || selectedMarket != null);
      const consensus = 0.45 * statistical.prob + 0.55 * context.prob;
      const valueEdgePp = selectedMarket == null ? null : Math.round((consensus - selectedMarket) * 1000) / 10;
      const movementPp = selectedMarket == null || selectedOpening == null
        ? null
        : Math.round((selectedMarket - selectedOpening) * 1000) / 10;
      const reason = sanitizeReason(context.reason);

      if (!passesGwakPolicy({
        market,
        sport,
        league: match.league,
        pick,
        line,
        statisticalProb: statistical.prob,
        contextProb: context.prob,
        hasComparableMarket,
        selectedOdds,
        marketPick,
        valueEdgePp,
        movementPp,
        reason,
      })) continue;

      candidates.push({
        matchId: match.id,
        league: match.league,
        sport,
        startTime: match.startTime,
        home,
        away,
        market,
        pick,
        line,
        selectedLine: market === "HANDICAP" ? selectedHandicap(pick, line) : null,
        selectedOdds,
        statisticalProb: statistical.prob,
        contextProb: context.prob,
        confidence: gwakConfidence(statistical.prob, context.prob, selectedMarket),
        valueEdgePp,
        movementPp,
        bookmakers: hasComparableMarket ? match.marketBookmakers : null,
        reason,
      });
    }
  }

  return candidates.sort((a, b) =>
    (b.market === "HANDICAP" ? 4 : 0) - (a.market === "HANDICAP" ? 4 : 0)
      || b.confidence - a.confidence
      || a.startTime.getTime() - b.startTime.getTime(),
  );
}

const GWAK_SYSTEM = `당신은 스포츠 픽 게시판에서 "곽씨"라는 닉네임으로 활동하는 픽스터의 글 초안을 씁니다.

[말투]
- 말수가 적고 차분한 존댓말. 결론은 단호하지만 적중을 장담하지 않습니다.
- 데이터 숫자를 그대로 나열하지 말고, 핵심 숫자 2~3개만 자연스럽게 풀어 씁니다.
- 플러스 핸디캡과 시장 라인 변화를 특히 중요하게 봅니다.
- 기사체, 광고 문구, 이모지, 해시태그, 과장된 승률 표현을 쓰지 않습니다.
- 실제 직관 경험·업계 경력·개인적 인맥처럼 제공되지 않은 사실을 만들지 않습니다.

[작성 규칙]
- 제공된 확정 픽을 절대 바꾸지 않습니다.
- 제목은 35자 이내의 자연스러운 게시판 제목입니다.
- 본문은 4~7문장입니다. 선택 이유, 반대 시나리오, 최종 픽 순서로 씁니다.
- 같은 문장 구조를 반복하지 않습니다.
- 출력은 JSON 하나만: {"title":"제목","content":"본문"}`;

function pickLabel(candidate: DraftCandidate): string {
  if (candidate.market === "HANDICAP") {
    const team = candidate.pick === "HOME" ? candidate.home : candidate.away;
    return `${team} +${candidate.selectedLine}`;
  }
  if (candidate.pick === "DRAW") return "무승부";
  return `${candidate.pick === "HOME" ? candidate.home : candidate.away} 승`;
}

async function writeDraft(candidate: DraftCandidate): Promise<{ title: string; content: string } | null> {
  const data = [
    `경기: ${candidate.home}(홈) vs ${candidate.away}(원정)`,
    `리그·시각: ${leagueLabel(candidate.league)} · ${kickoffLabel(candidate.startTime)}`,
    `확정 픽: ${pickLabel(candidate)}`,
    `두 예측 확률: ${Math.round(candidate.statisticalProb * 100)}% / ${Math.round(candidate.contextProb * 100)}%`,
    `내부 신뢰도: ${candidate.confidence}점`,
    candidate.selectedOdds != null ? `현재 평균 배당: ${candidate.selectedOdds.toFixed(2)}` : "비교 가능한 현재 배당 없음",
    candidate.bookmakers != null ? `비교 배당사: ${candidate.bookmakers}곳` : null,
    candidate.valueEdgePp != null ? `모델-시장 확률 차이: ${candidate.valueEdgePp.toFixed(1)}%p` : null,
    candidate.movementPp != null ? `오프닝 이후 선택 방향 변화: ${candidate.movementPp.toFixed(1)}%p` : null,
    candidate.reason ? `경기 맥락: ${candidate.reason}` : null,
    "주의할 변수: 경기 직전 선발·라인업과 라인 변동",
  ].filter(Boolean).join("\n");

  const raw = await generate(data, { system: GWAK_SYSTEM, maxTokens: 800, temperature: 0.85 });
  const json = parsePickJson(raw);
  if (!json) return null;
  const title = String(json.title ?? "").trim().slice(0, 120);
  const content = String(json.content ?? "").trim();
  if (title.length < 2 || content.length < 40) return null;
  return { title, content };
}

/** 엄격 선별 → 곽씨 문체 초안 저장. 공개 발행은 관리자 승인 액션에서만 한다. */
export async function runGwakDrafts(limit = 2): Promise<{ created: number; skipped: number; candidates: number; draftIds: number[] }> {
  const authorId = await ensureGwakPickster();
  const now = new Date();
  const todayCount = await prisma.post.count({
    where: {
      authorId,
      createdAt: { gte: kstDayStart(now) },
      category: { in: [GWAK_DRAFT_CATEGORY, GWAK_REJECTED_CATEGORY, "ANALYSIS"] },
    },
  });
  const allowance = Math.max(0, Math.min(limit, DAILY_DRAFT_LIMIT - todayCount));
  if (allowance === 0) return { created: 0, skipped: 0, candidates: 0, draftIds: [] };

  const candidates = await findCandidates(authorId, now);
  let created = 0;
  let skipped = 0;
  const draftIds: number[] = [];
  for (const candidate of candidates.slice(0, allowance)) {
    try {
      const copy = await writeDraft(candidate);
      if (!copy) {
        skipped++;
        continue;
      }
      const post = await prisma.post.create({
        data: {
          authorId,
          category: GWAK_DRAFT_CATEGORY,
          title: copy.title,
          content: copy.content,
          sport: candidate.sport,
          matchId: candidate.matchId,
          market: candidate.market,
          line: candidate.line,
          pick: candidate.pick,
        },
        select: { id: true },
      });
      created++;
      draftIds.push(post.id);
    } catch {
      skipped++;
    }
  }
  return { created, skipped, candidates: candidates.length, draftIds };
}
