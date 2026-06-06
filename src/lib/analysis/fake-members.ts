// 가짜 일반 회원 픽 봇 — 평범한 회원 40명이 짧은 픽을 분단위 cron 에서 낮은 확률로 발행.
// 한 번에 몰아쓰지 않고 하루 5~10글이 시간에 분산. 야구 시즌 가중(야구 7 : 축구 3).
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

// 가짜 회원 닉네임 풀 — 기존 15명(인덱스 0~14, 그대로 유지) + 신규 25명(평범·한/영 혼합, 배팅 용어 배제).
export const FAKE_NICKNAMES = [
  // 기존 15 (건드리지 않음 — fake0~14@ 계정 닉네임 보존)
  "오늘은간다", "느낌충만", "직관러", "역배장인", "안전제일",
  "고배당헌터", "묻고더블로", "스포츠불패", "찍신강림", "꾸준왕",
  "한방인생", "관전모드", "야구는역시", "축덕광", "초보픽쟁이",
  // 신규 25 (평범한 스포츠팬 톤)
  "슬로우커브", "HomeRun_K", "9회말", "외야석직관", "불펜대기",
  "끝내기", "ParkJS", "mike_b", "동네야구단", "풀카운트",
  "치맥과야구", "야구는진리", "베이스볼킴", "7번타자", "leadoff",
  "새벽직관", "코너킥러", "midfielder", "손케이팬", "축구보는밤",
  "GoalKeeper", "잔디사랑", "striker9", "soccer_kim", "응원단장",
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
  if (existing) return existing.id; // 기존 봇은 그대로(닉네임 변경 X)
  const pw = await hashPassword(`fake-${i}-${Date.now()}-${Math.random()}`);
  const u = await prisma.user.create({
    data: { email, passwordHash: pw, nickname: FAKE_NICKNAMES[i] },
    select: { id: true },
  });
  return u.id;
}

/** 이 회원이 아직 안 쓴 예정 경기 중 랜덤 1개. preferSport 종목 우선(없으면 전체). */
async function randomMatch(userId: string, preferSport?: Sport): Promise<FakeCand | null> {
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

  let valid = matches
    .map((m) => ({ m, sport: sportForLeague(m.league) }))
    .filter((x): x is { m: (typeof matches)[number]; sport: Sport } => x.sport != null);
  if (valid.length === 0) return null;

  // 종목 가중 — preferSport 경기가 있으면 그쪽만(없으면 전체 fallback)
  if (preferSport) {
    const pref = valid.filter((x) => x.sport === preferSport);
    if (pref.length > 0) valid = pref;
  }

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
- ⚠️ 홈팀이라고 습관적으로 HOME 고르지 마라. 실제론 원정팀이 이기는 경기도 거의 절반이다.
  원정 폼이 더 좋거나 홈팀이 약체면 망설임 없이 AWAY(원정)를 골라라 — 픽은 홈/원정이 고루 섞여야 진짜 팬답다.

[출력] 반드시 아래 JSON 객체 하나만. 앞뒤 설명·코드블록 금지:
{"market":"1X2","pick":"AWAY","title":"제목","analysis":"본문"}
- 위 예시의 pick 값(AWAY)을 따라하지 말고 경기마다 홈/원정을 직접 판단할 것.
- title: 25자 이내, 캐주얼하게. 예: "원정 가는 팀이 더 세 보임" / "오늘은 홈 믿어본다"
- analysis: 1~3문장, 짧고 가볍게. 예: "원정이지만 폼이 위라 그냥 원정 ㄱㄱ" / "홈 이점 확실하지"`;

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

// 분단위 cron(30분 간격) 호출 → 매번 ~15% 확률로 1글만 발행. 하루 5~10글이 시간에 분산(몰아쓰기 X).
// 야구 시즌이라 종목 가중 야구 70% / 축구 30%.
export async function runFakeMemberPicks(): Promise<{ created: number; skipped: number }> {
  // 호출당 ~15% 만 발행 → 30분 간격(하루 48회) × 0.15 ≈ 7글/일. 한 호출에 1글만.
  if (Math.random() < 0.85) return { created: 0, skipped: 0 };

  const i = Math.floor(Math.random() * FAKE_NICKNAMES.length);
  const preferSport: Sport = Math.random() < 0.7 ? "baseball" : "soccer";

  try {
    const userId = await ensureFakeMember(i);
    const c = await randomMatch(userId, preferSport);
    if (!c) return { created: 0, skipped: 1 };
    const pick = await generateShortPick(c);
    if (!pick) return { created: 0, skipped: 1 };
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
    return { created: 1, skipped: 0 };
  } catch {
    return { created: 0, skipped: 1 };
  }
}
