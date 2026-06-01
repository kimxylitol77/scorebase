// 가짜 일반 회원 픽 봇 — 매니저(전문가·공식 등급)와 달리, 평범한 회원 여러 명이
// 짧고 캐주얼한 픽을 하루 1~2개 랜덤 발행. 자동채점되어 랭킹에 다양한 회원이 채워짐.
// 일반 등급(badge 없음) → 적중 쌓이면 등급 상승.

import "server-only";
import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/claude";
import { hashPassword } from "@/lib/user-auth";
import { toKoreanTeamName } from "@/lib/team-names";
import { kickoffLabel } from "@/lib/analysis/format";
import { leagueLabel } from "@/lib/analysis/matches";
import { ARTICLE_LEAGUES } from "@/lib/sports/types";
import { sportForLeague, parsePickJson, botTeamName } from "@/lib/analysis/manager-bot";

// 가짜 회원 닉네임 풀 (스포츠 커뮤니티 팬 톤)
const FAKE_NICKNAMES = [
  "오늘은간다",
  "느낌충만",
  "직관러",
  "역배장인",
  "안전제일",
  "고배당헌터",
  "묻고더블로",
  "스포츠불패",
  "찍신강림",
  "꾸준왕",
  "한방인생",
  "관전모드",
  "야구는역시",
  "축덕광",
  "초보픽쟁이",
];

type Sport = "soccer" | "baseball" | "basketball" | "hockey";

interface FakeCand {
  id: number;
  league: string;
  sport: Sport;
  startTime: Date;
  home: string;
  away: string;
  hcLine: number | null;
  ouLine: number | null;
}

interface ShortPick {
  market: string;
  pick: string;
  line: number | null;
  title: string;
  analysis: string;
}

/** 가짜 회원 계정 보장 (i = 닉네임 인덱스). */
async function ensureFakeMember(i: number): Promise<string> {
  const email = `fake${i}@scorebase.internal`;
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) return existing.id;
  const pw = await hashPassword(`fake-${i}-${Date.now()}-${Math.random()}`);
  const u = await prisma.user.create({
    data: { email, passwordHash: pw, nickname: FAKE_NICKNAMES[i] },
    select: { id: true },
  });
  return u.id;
}

/** 이 회원이 아직 안 쓴 예정 경기 중 랜덤 1개. */
async function randomMatch(userId: string): Promise<FakeCand | null> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 36 * 60 * 60 * 1000);
  const leagues = ARTICLE_LEAGUES.filter((l) => l !== "LOL") as string[];

  const matches = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      startTime: { gte: now, lte: horizon },
      league: { in: leagues },
      posts: { none: { authorId: userId } },
    },
    select: {
      id: true,
      league: true,
      startTime: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      oddsHcLine: true,
      oddsTotalLine: true,
    },
    take: 50,
  });

  const valid = matches
    .map((m) => ({ m, sport: sportForLeague(m.league) }))
    .filter((x): x is { m: (typeof matches)[number]; sport: Sport } => x.sport != null);
  if (valid.length === 0) return null;

  const { m, sport } = valid[Math.floor(Math.random() * valid.length)];
  return {
    id: m.id,
    league: m.league,
    sport,
    startTime: m.startTime,
    home: botTeamName(toKoreanTeamName(m.homeTeam.name, m.league), m.league),
    away: botTeamName(toKoreanTeamName(m.awayTeam.name, m.league), m.league),
    hcLine: m.oddsHcLine,
    ouLine: m.oddsTotalLine,
  };
}

const FAKE_SYSTEM = `당신은 스포츠 커뮤니티의 평범한 팬입니다. 경기에 대한 짧은 픽을 캐주얼하게 남깁니다.

[톤]
- 친구한테 말하듯 1~3문장. 구어체·반말 섞어도 OK.
- 전문 분석가 아님. 직감·느낌·응원 위주로 가볍게. 통계 나열 금지.
- 팀명은 별명만 단독으로 쓰지 말 것. 예: "파드리스"(X)→"샌디에이고", "내셔널스"(X)→"워싱턴".

[픽 규칙]
- market 은 제공된 "사용 가능 market" 중 하나만.
- pick 값: 1X2 → HOME/DRAW/AWAY(무승부 없는 종목은 HOME/AWAY), HANDICAP → HOME/AWAY, OU → OVER/UNDER.

[출력] 반드시 아래 JSON 객체 하나만. 앞뒤 설명·코드블록 금지:
{"market":"1X2","pick":"HOME","title":"제목","analysis":"본문"}
- title: 25자 이내, 캐주얼하게. 예: "토트넘 홈에서 무조건 이긴다"
- analysis: 1~3문장, 짧고 가볍게. 예: "요즘 폼 미쳤음. 홈이라 그냥 홈승 간다 ㄱㄱ"`;

/** 짧은 캐주얼 픽 생성. 검증 실패 시 null. */
async function generateShortPick(c: FakeCand): Promise<ShortPick | null> {
  const drawAllowed = c.sport === "soccer";
  const markets = ["1X2"];
  if (c.hcLine != null) markets.push("HANDICAP");
  if (c.ouLine != null) markets.push("OU");

  const data = [
    `경기: ${c.home}(홈) vs ${c.away}(원정)`,
    `리그: ${leagueLabel(c.league)} · ${kickoffLabel(c.startTime)}`,
    `사용 가능 market: ${markets.join(", ")}${drawAllowed ? "" : " · 무승부 없음"}`,
  ].join("\n");

  const raw = await generate(data, {
    system: FAKE_SYSTEM,
    maxTokens: 600,
    temperature: 0.95, // 캐주얼·다양성
  });

  const json = parsePickJson(raw);
  if (!json) return null;

  const market = String(json.market ?? "").trim();
  const pick = String(json.pick ?? "").trim().toUpperCase();
  const title = String(json.title ?? "").trim().slice(0, 120);
  const analysis = String(json.analysis ?? "").trim();
  if (!title || analysis.length < 4 || !markets.includes(market)) return null;

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

/** 랜덤 회원 1~2명이 각자 랜덤 경기에 짧은 픽 발행. cron 에서 호출. */
export async function runFakeMemberPicks(): Promise<{ created: number; skipped: number }> {
  // cron 이 하루 2회(KST 14·20시) 호출 → 각 호출 ~65% 확률로 1명만 발행(가끔 거름)
  // → 하루 0~2글, 진짜 회원처럼 불규칙. 한 호출에 몰아쓰지 않음.
  if (Math.random() < 0.35) return { created: 0, skipped: 0 };
  const order = FAKE_NICKNAMES.map((_, i) => i).sort(() => Math.random() - 0.5);
  const chosen = order.slice(0, 1);

  let created = 0;
  let skipped = 0;
  for (const i of chosen) {
    try {
      const userId = await ensureFakeMember(i);
      const c = await randomMatch(userId);
      if (!c) {
        skipped++;
        continue;
      }
      const pick = await generateShortPick(c);
      if (!pick) {
        skipped++;
        continue;
      }
      await prisma.post.create({
        data: {
          authorId: userId,
          title: pick.title,
          content: pick.analysis,
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
