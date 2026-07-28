// 밸류 헌터 픽 봇 — "라인사냥꾼". 자체 모델 확률과 시장 implied 확률의 갭(밸류)이
// 벌어진 경기만 골라 픽. 유일한 GPT 기반 봇 (기존 봇은 전부 Claude Haiku — 모델 다양성).
//
// 픽은 코드가 결정하고 GPT 는 글만 쓴다. 페르소나가 "숫자로 말하는 밸류 헌터"인데
// 픽까지 LLM 감에 맡기면 콘셉 자체가 거짓이 된다. 갭이 임계 미만이면 그날은 발행 0건 —
// "가치가 없으면 안 들어간다"는 페르소나 그대로다.

import "server-only";
import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/openai";
import { hashPassword } from "@/lib/user-auth";
import { toKoreanTeamName } from "@/lib/team-names";
import { kickoffLabel } from "@/lib/analysis/format";
import { leagueLabel } from "@/lib/analysis/matches";
import { parsePickJson, botTeamName, sportForLeague } from "@/lib/analysis/manager-bot";

const VALUE_BOT_EMAIL = "value-bot@scorebase.internal";
export const VALUE_BOT_NICKNAME = "라인사냥꾼";

// 모델 확률 - 시장 implied 확률이 이 이상 벌어져야 픽 (Match.isValueBet 의 5%p 와 동일 기준).
const MIN_EDGE = 0.05;

export async function ensureValueBot(): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { email: VALUE_BOT_EMAIL },
    select: { id: true },
  });
  if (existing) return existing.id;
  const pw = await hashPassword(`value-bot-${Date.now()}-${Math.random()}`);
  const u = await prisma.user.create({
    data: { email: VALUE_BOT_EMAIL, passwordHash: pw, nickname: VALUE_BOT_NICKNAME },
    select: { id: true },
  });
  return u.id;
}

const VALUE_SYSTEM = `당신은 "라인사냥꾼" — 시장 배당과 자체 계산 확률의 갭(밸류)만 노리는 냉정한 베팅 분석가입니다.

[페르소나]
- 건조하고 단호한 단문. 감탄사·이모지·과장 금지.
- 근거는 항상 숫자다: 시장이 보는 확률, 내 계산, 갭이 몇 %p 인지.
- 팬심·서사·"명문의 자존심" 류의 말 금지. 이 경기에 들어가는 이유는 오직 갭.
- 인기 경기라도 갭이 없으면 안 들어간다는 태도가 문장에 배어 있어야 한다.

[본문 구성] 마크다운 없이 3~5문장.
1) 시장 라인이 어떻게 형성돼 있는지 (배당·implied 확률)
2) 내 계산과 어디서 갈리는지 — 갭을 %p 로 명시
3) 결론 한 문장. 픽과 근거를 다시 못박는다.

[출력] 반드시 아래 JSON 하나만. 앞뒤 설명·코드블록 금지:
{"analysis":"본문"}
- 픽은 이미 확정돼 데이터로 제공된다 — 다른 픽을 제안하지 말 것.`;

interface Edge {
  market: "1X2" | "OU" | "HANDICAP";
  pick: string; // HOME|DRAW|AWAY|OVER|UNDER
  line: number | null;
  modelProb: number; // 0~1
  marketProb: number; // 0~1 (vig 제거 implied)
  edge: number; // modelProb - marketProb
  odds: number | null; // 해당 side 의 decimal 배당 (표시용)
  label: string; // "첼시 승" / "오버 2.5" 등 사람이 읽는 라벨
}

type MatchRow = {
  id: number;
  league: string;
  startTime: Date;
  predHome: number | null;
  predDraw: number | null;
  predAway: number | null;
  marketHome: number | null;
  marketDraw: number | null;
  marketAway: number | null;
  predOverProb: number | null;
  oddsTotalLine: number | null;
  oddsOver: number | null;
  oddsUnder: number | null;
  oddsHome: number | null;
  oddsDraw: number | null;
  oddsAway: number | null;
  homeTeam: { name: string };
  awayTeam: { name: string };
};

/** 한 경기의 마켓별 갭을 전부 계산해 가장 큰 것 하나를 돌려준다. 임계 미만이면 null. */
function bestEdge(m: MatchRow, home: string, away: string): Edge | null {
  const edges: Edge[] = [];

  // 1X2 — marketHome/Draw/Away 는 이미 vig 제거된 implied 확률.
  const sides: Array<[string, number | null, number | null, number | null, string]> = [
    ["HOME", m.predHome, m.marketHome, m.oddsHome, `${home} 승`],
    ["DRAW", m.predDraw, m.marketDraw, m.oddsDraw, "무승부"],
    ["AWAY", m.predAway, m.marketAway, m.oddsAway, `${away} 승`],
  ];
  for (const [pick, model, market, odds, label] of sides) {
    if (model == null || market == null || market <= 0) continue;
    edges.push({ market: "1X2", pick, line: null, modelProb: model, marketProb: market, edge: model - market, odds, label });
  }

  // OU — oddsOver/Under 에서 vig 제거해 implied 계산.
  if (m.predOverProb != null && m.oddsTotalLine != null && m.oddsOver != null && m.oddsUnder != null && m.oddsOver > 1 && m.oddsUnder > 1) {
    const iOver = 1 / m.oddsOver;
    const iUnder = 1 / m.oddsUnder;
    const pOver = iOver / (iOver + iUnder);
    edges.push({
      market: "OU", pick: "OVER", line: m.oddsTotalLine,
      modelProb: m.predOverProb, marketProb: pOver, edge: m.predOverProb - pOver,
      odds: m.oddsOver, label: `오버 ${m.oddsTotalLine}`,
    });
    edges.push({
      market: "OU", pick: "UNDER", line: m.oddsTotalLine,
      modelProb: 1 - m.predOverProb, marketProb: 1 - pOver, edge: (1 - m.predOverProb) - (1 - pOver),
      odds: m.oddsUnder, label: `언더 ${m.oddsTotalLine}`,
    });
  }

  const best = edges.filter((e) => e.edge >= MIN_EDGE).sort((a, b) => b.edge - a.edge)[0];
  return best ?? null;
}

async function writePick(
  m: MatchRow, e: Edge, home: string, away: string,
): Promise<{ title: string; analysis: string } | null> {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const data = [
    `경기: ${home}(홈) vs ${away}(원정)`,
    `리그: ${leagueLabel(m.league)} · 경기 시각(KST): ${kickoffLabel(m.startTime)}`,
    `확정 픽: ${e.label} (마켓 ${e.market}${e.line != null ? ` / 기준선 ${e.line}` : ""})`,
    e.odds != null ? `해당 픽 배당: ${e.odds.toFixed(2)}` : null,
    `시장 implied 확률: ${pct(e.marketProb)}`,
    `내 모델 확률: ${pct(e.modelProb)}`,
    `갭: +${(e.edge * 100).toFixed(1)}%p (모델이 시장보다 높게 봄)`,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await generate(data, { system: VALUE_SYSTEM, maxTokens: 700, temperature: 0.8 });
  const json = parsePickJson(raw);
  if (!json) return null;
  const analysis = String(json.analysis ?? "").trim();
  if (analysis.length < 10) return null;
  // 제목은 코드가 확정 — GPT 가 형식을 벗어나 픽과 다른 라벨을 쓰면 오해를 만든다
  // (실측: "[신시내티 vs 클리블랜드 승]" 처럼 픽 반대로 읽히는 제목 발생).
  const title = `[${home} vs ${away}] ${e.label}, 갭 +${(e.edge * 100).toFixed(1)}%p`;
  return { title, analysis };
}

/** 밸류 픽 발행. cron 에서 호출. 갭 임계를 넘는 경기가 없으면 0건 — 정상. */
export async function runValuePicks(limit = 2): Promise<{ created: number; skipped: number; scanned: number }> {
  const botId = await ensureValueBot();
  const now = new Date();
  const horizon = new Date(now.getTime() + 36 * 60 * 60 * 1000);

  const matches = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      startTime: { gte: now, lte: horizon },
      // 모델과 시장 둘 다 있어야 갭 계산이 성립한다.
      predHome: { not: null },
      marketHome: { not: null },
      posts: { none: { authorId: botId } },
    },
    select: {
      id: true, league: true, startTime: true,
      predHome: true, predDraw: true, predAway: true,
      marketHome: true, marketDraw: true, marketAway: true,
      predOverProb: true, oddsTotalLine: true, oddsOver: true, oddsUnder: true,
      oddsHome: true, oddsDraw: true, oddsAway: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
    orderBy: { startTime: "asc" },
  });

  // 갭 큰 순으로 상위 limit 경기만 — 밸류 헌터는 다작하지 않는다.
  const cands = matches
    .map((m) => {
      const home = botTeamName(toKoreanTeamName(m.homeTeam.name, m.league), m.league);
      const away = botTeamName(toKoreanTeamName(m.awayTeam.name, m.league), m.league);
      const edge = bestEdge(m, home, away);
      return edge ? { m, edge, home, away } : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => b.edge.edge - a.edge.edge)
    .slice(0, limit);

  let created = 0;
  let skipped = 0;
  for (const { m, edge, home, away } of cands) {
    try {
      const sport = sportForLeague(m.league);
      if (!sport) {
        skipped++;
        continue;
      }
      const text = await writePick(m, edge, home, away);
      if (!text) {
        skipped++;
        continue;
      }
      await prisma.post.create({
        data: {
          authorId: botId,
          title: text.title,
          content: text.analysis,
          sport,
          matchId: m.id,
          market: edge.market,
          line: edge.line,
          pick: edge.pick,
          // 발행 시각 0~25분 과거 지터 — 정각 발행 = 봇 티 회피 (ou-bot 과 동일).
          createdAt: new Date(Date.now() - Math.floor(Math.random() * 26) * 60_000),
        },
      });
      created++;
    } catch {
      skipped++;
    }
  }
  return { created, skipped, scanned: matches.length };
}
