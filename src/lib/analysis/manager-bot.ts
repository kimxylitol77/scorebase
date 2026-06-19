// 매니저 자동 픽 봇 — "스코어베이스 분석팀" 가상 작성자가 매일 중요 경기 3~4개에
// 전문가 픽(1X2/핸디캡/오버언더) + 분석글을 자동 발행. 경기 종료 후 자동채점되어
// 매니저 적중률이 사이트 대표 신뢰도로 누적된다.
//
// 픽 판단은 Claude(Haiku) 가 우리 DB 데이터(Elo·시장 배당·자체 승률 예측)를 근거로 결정.
// web_search 불필요 — Match 에 이미 예측/배당이 있고, 채점도 우리 Match 결과 기준.

import "server-only";
import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/claude";
import { hashPassword } from "@/lib/user-auth";
import { toKoreanTeamName } from "@/lib/team-names";
import { kickoffLabel } from "@/lib/analysis/format";
import { leagueLabel } from "@/lib/analysis/matches";
import { ARTICLE_LEAGUES } from "@/lib/sports/types";
import {
  BASEBALL_LEAGUES,
  BASKETBALL_LEAGUES,
  HOCKEY_LEAGUES,
  LOL_LEAGUES,
} from "@/lib/sports/sport-leagues";

const MANAGER_EMAIL = "manager@scorebase.internal";
const MANAGER_NICKNAME = "스코어베이스 분석팀";

const DISCLAIMER = "\n\n---\n_데이터 기반 자동 분석입니다. 투자·베팅 결정은 본인 책임입니다._";

type Sport = "soccer" | "baseball" | "basketball" | "hockey" | "esports" | "mma" | "volleyball";

/** 매니저(가상 작성자) 계정 보장 — 없으면 생성. 로그인은 안 쓰고 authorId 만 사용. */
export async function ensureManager(): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { email: MANAGER_EMAIL },
    select: { id: true, badge: true },
  });
  if (existing) {
    // 기존 매니저도 공식 등급 보장
    if (existing.badge !== "OFFICIAL") {
      await prisma.user.update({
        where: { email: MANAGER_EMAIL },
        data: { badge: "OFFICIAL" },
      });
    }
    return existing.id;
  }
  // 로그인 불가용 더미 해시 (봇은 세션 미사용). badge=OFFICIAL → 공식 분석관 등급.
  const pw = await hashPassword(`manager-seed-${Date.now()}-${Math.random()}`);
  const u = await prisma.user.create({
    data: {
      email: MANAGER_EMAIL,
      passwordHash: pw,
      nickname: MANAGER_NICKNAME,
      badge: "OFFICIAL",
    },
    select: { id: true },
  });
  return u.id;
}

export function sportForLeague(league: string): Sport | null {
  if (BASEBALL_LEAGUES.has(league)) return "baseball";
  if (BASKETBALL_LEAGUES.has(league)) return "basketball";
  if (HOCKEY_LEAGUES.has(league)) return "hockey";
  if (LOL_LEAGUES.has(league)) return "esports"; // 2026-06 게시판 종목 확장 — 롤 픽 봇 활성
  if (league === "UFC") return "mma";
  if (league === "V_LEAGUE" || league === "VNL") return "volleyball"; // V리그 수집 합류 시 자동 활성
  return "soccer";
}

// MLB 중 한국에서 별명이 압도적으로 통용되는 팀 — 지역명 대신 별명 유지
const MLB_KEEP_NICKNAME = new Set([
  "양키스", "다저스", "레드삭스", "컵스", "메츠",
  "자이언츠", "에인절스", "카디널스", "브레이브스", "필리스", "화이트삭스",
]);

/**
 * 봇이 글에서 쓸 팀 호칭 — Claude 가 별명만 축약하는 것 방지.
 * MLB: 지역명(휴스턴·밀워키·샌디에이고). 단 양키스·다저스 등 별명 통용 팀은 유지.
 * KBO/NPB: 첫 어절(삼성·LG·요미우리 = 구단/기업명).
 * 축구·농구·하키: 전체명 그대로.
 */
export function botTeamName(koName: string, league: string): string {
  const parts = koName.trim().split(/\s+/);
  if (parts.length < 2) return koName;
  if (league === "MLB") {
    const nick = parts[parts.length - 1];
    return MLB_KEEP_NICKNAME.has(nick) ? nick : parts[0];
  }
  if (BASEBALL_LEAGUES.has(league)) return parts[0]; // KBO/NPB
  return koName;
}

interface Candidate {
  id: number;
  league: string;
  sport: Sport;
  startTime: Date;
  home: string;
  away: string;
  homeElo: number;
  awayElo: number;
  oddsHome: number | null;
  oddsDraw: number | null;
  oddsAway: number | null;
  hcLine: number | null;
  ouLine: number | null;
  predWinner: string | null;
  predHome: number | null;
  predDraw: number | null;
  predAway: number | null;
}

/** 오늘~내일(36h) 주요 리그 예정 경기 중, 매니저가 아직 안 쓴 경기를 중요도순으로. */
async function pickImportantMatches(managerId: string, limit: number): Promise<Candidate[]> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 36 * 60 * 60 * 1000);
  // LOL 포함 (배당·predHome 보유 — 데이터 기반 픽 가능). UFC 는 예측 데이터가 없어
  // 매니저봇(데이터 근거 전문 픽) 대상에서 제외 — 일반 회원봇만 다룬다.
  const leagues = ARTICLE_LEAGUES as readonly string[] as string[];

  const matches = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      startTime: { gte: now, lte: horizon },
      league: { in: leagues },
      posts: { none: { authorId: managerId } }, // 매니저 중복 작성 방지
    },
    select: {
      id: true,
      league: true,
      startTime: true,
      homeTeam: { select: { name: true, eloRating: true } },
      awayTeam: { select: { name: true, eloRating: true } },
      oddsHome: true,
      oddsDraw: true,
      oddsAway: true,
      oddsHcLine: true,
      oddsTotalLine: true,
      predWinner: true,
      predHome: true,
      predDraw: true,
      predAway: true,
    },
    take: 60,
  });

  const cands: Candidate[] = [];
  for (const m of matches) {
    const sport = sportForLeague(m.league);
    if (!sport) continue;
    cands.push({
      id: m.id,
      league: m.league,
      sport,
      startTime: m.startTime,
      home: botTeamName(toKoreanTeamName(m.homeTeam.name, m.league), m.league),
      away: botTeamName(toKoreanTeamName(m.awayTeam.name, m.league), m.league),
      homeElo: m.homeTeam.eloRating,
      awayElo: m.awayTeam.eloRating,
      oddsHome: m.oddsHome,
      oddsDraw: m.oddsDraw,
      oddsAway: m.oddsAway,
      hcLine: m.oddsHcLine,
      ouLine: m.oddsTotalLine,
      predWinner: m.predWinner,
      predHome: m.predHome,
      predDraw: m.predDraw,
      predAway: m.predAway,
    });
  }

  // 중요도 = 두 팀 Elo 합(강팀 빅매치 우선) + 배당 있으면 대형 가산.
  // 가산을 Elo 합 범위(~2000~4000)보다 크게 둬서, 배당 있는 경기가 항상 상위 →
  // 배당 있는 후보가 limit 이상이면 그것만 픽, 부족할 때만 배당 없는 빅매치로 채움.
  // (매니저 픽은 시장 배당 대비 분석이라 배당 없는 경기는 본질적으로 빈약)
  const score = (c: Candidate) =>
    c.homeElo + c.awayElo + (c.oddsHome != null ? 5000 : 0);
  cands.sort((a, b) => score(b) - score(a));
  return cands.slice(0, limit);
}

const MANAGER_SYSTEM = `당신은 한국어 스포츠 미디어 "스코어베이스"의 전문 분석가입니다.
주어진 경기 데이터(Elo 레이팅, 시장 배당, 자체 승률 예측)를 근거로 한 경기에 대한 전문가 픽과 분석을 작성합니다.

[톤]
- 데이터 기반의 단정한 전문가 문어체. The Athletic·Opta 스타일.
- 과장·자극적 표현 금지. 근거를 숫자로 제시.

[팀명 표기]
- 제공된 한글 팀명을 그대로 쓰거나 지역명으로 줄입니다. 별명만 단독으로 쓰지 마세요.
- 예: "파드리스"(X) → "샌디에이고", "내셔널스"(X) → "워싱턴", "양키스"는 통용되므로 OK.

[픽 규칙]
- market 은 제공된 "사용 가능 market" 중 가장 확신 있는 하나만 선택.
- pick 값: 1X2 → HOME/DRAW/AWAY (무승부 없는 종목은 HOME/AWAY), HANDICAP → HOME/AWAY, OU → OVER/UNDER.
- ⚠️ 홈 이점은 여러 요소 중 하나일 뿐이다. Elo·시장 배당·자체 예측이 원정팀 우위를 가리키면 망설이지 말고 AWAY 를 선택하라.
  배당·예측 확률이 원정 우세인데 HOME 을 고르는 것은 데이터 무시다. 픽은 항상 근거(숫자)를 따라간다.

[출력] 반드시 아래 JSON 객체 하나만 출력. 앞뒤 설명·코드블록 금지:
{"market":"1X2","pick":"AWAY","title":"제목","analysis":"마크다운 본문"}
- 위 예시의 pick 값(AWAY)을 모방하지 말 것 — 데이터 근거로 HOME/DRAW/AWAY 중 직접 판단.
- title: "[홈팀 vs 원정팀] 핵심 한 줄" 형태, 40자 이내.
- analysis: 마크다운. "## 전력 분석", "## 핵심 포인트", "## 종합" 섹션으로 250자 이상. 픽 근거를 명확히.`;

interface PickResult {
  market: string;
  pick: string;
  line: number | null;
  title: string;
  analysis: string;
}

export function parsePickJson(raw: string): Record<string, unknown> | null {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

const pct = (x: number | null) => (x == null ? "-" : `${Math.round(x * 100)}%`);

/** 한 경기에 대해 Claude 로 픽 + 분석 생성. 검증 실패 시 null. */
async function generatePick(c: Candidate): Promise<PickResult | null> {
  const drawAllowed = c.sport === "soccer";
  const markets = ["1X2"];
  if (c.hcLine != null) markets.push("HANDICAP");
  if (c.ouLine != null) markets.push("OU");

  const lines = [
    `경기: ${c.home}(홈) vs ${c.away}(원정)`,
    `리그: ${leagueLabel(c.league)} · 경기 시각(KST): ${kickoffLabel(c.startTime)}`,
    `Elo 레이팅: ${c.home} ${Math.round(c.homeElo)} / ${c.away} ${Math.round(c.awayElo)}`,
    c.oddsHome != null
      ? `1X2 배당: 홈 ${c.oddsHome} / 무 ${c.oddsDraw ?? "-"} / 원정 ${c.oddsAway}`
      : "1X2 배당: 정보 없음",
    c.hcLine != null ? `핸디캡 라인(홈 기준): ${c.hcLine}` : null,
    c.ouLine != null ? `오버언더 기준선: ${c.ouLine}` : null,
    c.predWinner
      ? `자체 모델 예측: ${c.predWinner} (홈 ${pct(c.predHome)} / 무 ${pct(c.predDraw)} / 원정 ${pct(c.predAway)})`
      : null,
    "",
    `사용 가능 market: ${markets.join(", ")}${drawAllowed ? "" : " · 무승부 없는 종목(1X2 는 HOME/AWAY 만)"}`,
  ].filter((l): l is string => l != null);

  const raw = await generate(lines.join("\n"), {
    system: MANAGER_SYSTEM,
    maxTokens: 1500,
    temperature: 0.6,
  });

  const json = parsePickJson(raw);
  if (!json) return null;

  const market = String(json.market ?? "").trim();
  const pick = String(json.pick ?? "").trim().toUpperCase();
  const title = String(json.title ?? "").trim().slice(0, 120);
  const analysis = String(json.analysis ?? "").trim();
  if (!title || analysis.length < 20 || !markets.includes(market)) return null;

  let line: number | null = null;
  if (market === "1X2") {
    const allowed = drawAllowed ? ["HOME", "DRAW", "AWAY"] : ["HOME", "AWAY"];
    if (!allowed.includes(pick)) return null;
  } else if (market === "HANDICAP") {
    if (!["HOME", "AWAY"].includes(pick) || c.hcLine == null) return null;
    line = c.hcLine;
  } else {
    if (!["OVER", "UNDER"].includes(pick) || c.ouLine == null) return null;
    line = c.ouLine;
  }

  return { market, pick, line, title, analysis };
}

/** 매니저 픽 일괄 발행. cron 에서 호출. */
export async function runManagerPicks(limit = 4): Promise<{
  created: number;
  skipped: number;
}> {
  const managerId = await ensureManager();
  const cands = await pickImportantMatches(managerId, limit);

  let created = 0;
  let skipped = 0;
  for (const c of cands) {
    try {
      const pick = await generatePick(c);
      if (!pick) {
        skipped++;
        continue;
      }
      await prisma.post.create({
        data: {
          authorId: managerId,
          title: pick.title,
          content: pick.analysis + DISCLAIMER,
          sport: c.sport,
          matchId: c.id,
          market: pick.market,
          line: pick.line,
          pick: pick.pick,
        },
      });
      created++;
    } catch {
      skipped++;
    }
  }
  return { created, skipped };
}
