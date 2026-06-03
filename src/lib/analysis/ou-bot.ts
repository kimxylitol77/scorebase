// 축구 오버언더(OU) 전문 봇 — "사관학교". 예정 축구 경기 중 OU 배당 있는 것에만
// 오버/언더 픽. Claude(Haiku)가 총득점 관점으로 분석. cron(/api/cron/ou-picks).

import "server-only";
import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/claude";
import { hashPassword } from "@/lib/user-auth";
import { toKoreanTeamName } from "@/lib/team-names";
import { kickoffLabel } from "@/lib/analysis/format";
import { leagueLabel } from "@/lib/analysis/matches";
import { parsePickJson, botTeamName } from "@/lib/analysis/manager-bot";
import { leaguesForSport } from "@/lib/sports/sport-leagues";

const OU_BOT_EMAIL = "ou-bot@scorebase.internal";
const OU_BOT_NICKNAME = "사관학교";

export async function ensureOuBot(): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { email: OU_BOT_EMAIL },
    select: { id: true },
  });
  if (existing) return existing.id;
  const pw = await hashPassword(`ou-bot-${Date.now()}-${Math.random()}`);
  const u = await prisma.user.create({
    data: { email: OU_BOT_EMAIL, passwordHash: pw, nickname: OU_BOT_NICKNAME },
    select: { id: true },
  });
  return u.id;
}

const OU_SYSTEM = `당신은 축구 오버언더(총득점) 전문 분석가입니다. 한 경기의 양팀 합산 득점이 기준선을 넘을지(오버) 못 넘을지(언더)만 분석합니다.

[톤]
- 간결한 전문가 문어체. 양팀 득점력·실점·최근 골 추세를 근거로 2~3문장.
- 승패는 언급하지 않음. 오직 총득점(오버/언더) 관점.

[팀명] 제공된 이름 그대로. 별명만 단독으로 쓰지 말 것.

[출력] 반드시 아래 JSON 하나만. 앞뒤 설명·코드블록 금지:
{"pick":"OVER","title":"제목","analysis":"본문"}
- pick: OVER 또는 UNDER 중 하나.
- title: "[홈 vs 원정] 오버 X.X" 형태, 30자 이내.
- analysis: 마크다운 없이 2~3문장.`;

interface OuCand {
  league: string;
  startTime: Date;
  home: string;
  away: string;
  ouLine: number;
  predOverProb: number | null;
}

async function generateOuPick(c: OuCand): Promise<{ pick: string; title: string; analysis: string } | null> {
  const data = [
    `경기: ${c.home} vs ${c.away}`,
    `리그: ${leagueLabel(c.league)} · ${kickoffLabel(c.startTime)}`,
    `오버언더 기준선: ${c.ouLine}`,
    c.predOverProb != null ? `자체 모델 오버 확률: ${Math.round(c.predOverProb * 100)}%` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await generate(data, { system: OU_SYSTEM, maxTokens: 600, temperature: 0.7 });
  const json = parsePickJson(raw);
  if (!json) return null;
  const pick = String(json.pick ?? "").trim().toUpperCase();
  const title = String(json.title ?? "").trim().slice(0, 120);
  const analysis = String(json.analysis ?? "").trim();
  if (!["OVER", "UNDER"].includes(pick) || !title || analysis.length < 4) return null;
  return { pick, title, analysis };
}

/** 축구 OU 전문 봇 픽 발행. cron 에서 호출. 기본 1개 (같은 시각 다발행 = 봇 티 회피). */
export async function runOuPicks(limit = 1): Promise<{ created: number; skipped: number }> {
  const botId = await ensureOuBot();
  const soccerLeagues = leaguesForSport("soccer");
  const now = new Date();
  const horizon = new Date(now.getTime() + 36 * 60 * 60 * 1000);

  const matches = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      startTime: { gte: now, lte: horizon },
      league: { in: soccerLeagues },
      posts: { none: { authorId: botId } },
    },
    select: {
      id: true,
      league: true,
      startTime: true,
      oddsTotalLine: true,
      predOverProb: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
    orderBy: { startTime: "asc" },
    take: limit,
  });

  let created = 0;
  let skipped = 0;
  for (const m of matches) {
    try {
      // 메이저 오프시즌엔 OU 배당이 없음 → 축구 표준 기준선 2.5 사용
      const line = m.oddsTotalLine ?? 2.5;
      const pick = await generateOuPick({
        league: m.league,
        startTime: m.startTime,
        ouLine: line,
        predOverProb: m.predOverProb,
        home: botTeamName(toKoreanTeamName(m.homeTeam.name, m.league), m.league),
        away: botTeamName(toKoreanTeamName(m.awayTeam.name, m.league), m.league),
      });
      if (!pick) {
        skipped++;
        continue;
      }
      await prisma.post.create({
        data: {
          authorId: botId,
          title: pick.title,
          content: pick.analysis,
          sport: "soccer",
          matchId: m.id,
          market: "OU",
          line,
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
