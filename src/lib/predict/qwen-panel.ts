// 로컬 Qwen 패널 — 맥미니 워커용 태스크 제공/저장.
// Vercel 은 맥미니 Ollama 에 못 닿으므로, 워커가 프롬프트를 대신 Ollama 에 전달하고
// 원문 응답을 되돌려 준다. 앵커 계산·프롬프트 빌드·파싱·저장은 전부 서버(TS)에서 —
// GPT 와 동일 파이프라인을 재사용해 프롬프트/채점 드리프트를 막는다.
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { isPanelEnabledByKey } from "@/lib/predict/panelists";
import type { PredictMatch } from "@/lib/predict/types";
import {
  scorebasePick,
  scorebaseHcOu,
  storeAnchor,
  storePanel,
  buildMarketsPrompt,
  buildPanelFacts,
  parseMarketsResponse,
  starterFacts,
  MAJOR_LEAGUES,
  LOOKAHEAD_HOURS,
  type MarketLines,
} from "@/jobs/fetch-gpt-predictions";
import { BASEBALL_LEAGUES } from "@/lib/sports/sport-leagues";

// AiPrediction.model 키 — panelists.ts 의 ollama 패널 key 와 반드시 일치.
export const QWEN_MODEL = "qwen2.5-32b";

export interface QwenTask {
  matchId: number;
  league: string;
  system: string;
  user: string;
  lines: MarketLines;
}

/**
 * qwen 미픽 예정 경기의 프롬프트+라인을 반환. scorebase 앵커를 스스로 계산·저장하므로
 * 유료 gpt 잡과 무관하게 동작한다(Qwen 독립 = 무료로 단독 운용 가능).
 */
export async function getQwenTasks(cap = 40): Promise<QwenTask[]> {
  if (!isPanelEnabledByKey(QWEN_MODEL)) return []; // Vercel env PANEL_QWEN 킬스위치
  const now = new Date();
  const until = new Date(now.getTime() + LOOKAHEAD_HOURS * 3600 * 1000);

  const doneQwen = await prisma.aiPrediction.findMany({
    where: { model: QWEN_MODEL, market: "1X2" },
    select: { matchId: true },
  });
  const done = new Set(doneQwen.map((d) => d.matchId));

  const candidates = await prisma.match.findMany({
    where: {
      league: { in: MAJOR_LEAGUES },
      status: "SCHEDULED",
      startTime: { gte: now, lte: until },
    },
    orderBy: { startTime: "asc" },
    select: {
      id: true, league: true, homeTeamId: true, awayTeamId: true, startTime: true,
      marketHome: true, marketDraw: true, marketAway: true, marketBookmakers: true,
      homeStarter: true, awayStarter: true, homeGoalie: true, awayGoalie: true,
      predHome: true, predAway: true, // 배구 앵커
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });

  const leagues = [...new Set(candidates.map((c) => c.league))];
  const poolByLeague = new Map<string, PredictMatch[]>();
  for (const lg of leagues) {
    const pool = await prisma.match.findMany({
      where: { league: lg },
      select: {
        id: true, league: true, status: true, homeTeamId: true, awayTeamId: true,
        homeScore: true, awayScore: true, startTime: true,
      },
    });
    poolByLeague.set(lg, pool as PredictMatch[]);
  }

  const tasks: QwenTask[] = [];
  for (const m of candidates) {
    if (done.has(m.id)) continue;
    // 야구 선발 대기 — Vercel 패널(fetch-gpt-predictions)과 같은 규칙이어야
    // 모델 간 경기 집합이 어긋나지 않는다.
    if (BASEBALL_LEAGUES.has(m.league)) {
      const f = starterFacts(m.homeStarter, m.awayStarter);
      if (!f?.home || !f?.away) continue;
    }
    const pool = poolByLeague.get(m.league)!;
    const ours = scorebasePick(m, pool);
    if (!ours) continue; // 학습 부족 — 앵커 없음 → 스킵
    const oursHcOu = scorebaseHcOu(m, pool);
    await storeAnchor(m.id, ours, oursHcOu); // 앵커 자체 저장(gpt 무관 = Qwen 독립)

    const homeKo = toKoreanTeamName(m.homeTeam?.name, m.league) || m.homeTeam?.name || "홈";
    const awayKo = toKoreanTeamName(m.awayTeam?.name, m.league) || m.awayTeam?.name || "원정";
    const facts = await buildPanelFacts(m, pool, homeKo, awayKo);
    const lines: MarketLines = { hc: oursHcOu.hc?.line ?? null, ou: oursHcOu.ou?.line ?? null };
    const { system, user } = buildMarketsPrompt(m.league, homeKo, awayKo, m.startTime, lines, facts);
    tasks.push({ matchId: m.id, league: m.league, system, user, lines });
    if (tasks.length >= cap) break;
  }
  return tasks;
}

/**
 * 워커가 Ollama 로 받은 raw JSON 텍스트를 파싱·저장. league·line 은 워커 입력이 아니라
 * 저장된 scorebase 앵커에서 재확인(신뢰 경계 = DB 기준, 같은 라인으로 채점 보장).
 */
export async function saveQwenPicks(
  items: { matchId: number; text: string }[],
): Promise<{ saved: number; failed: number }> {
  if (!isPanelEnabledByKey(QWEN_MODEL)) return { saved: 0, failed: 0 }; // 게이트 OFF 면 저장 안 함
  let saved = 0;
  let failed = 0;
  for (const it of items) {
    const anchor = await prisma.aiPrediction.findMany({
      where: { matchId: it.matchId, model: "scorebase", market: { in: ["1X2", "HANDICAP", "OU"] } },
      select: { market: true, line: true, match: { select: { league: true, startTime: true } } },
    });
    if (anchor.length === 0) { failed++; continue; } // 앵커 없음 = 부적격
    // 킥오프 가드 — 워커가 Ollama 를 순차 실행하는 동안(경기당 ~1분) 시작된 경기의 픽은
    // 사후 픽이므로 거부. "경기 시작 전 예측" 원칙의 서버측 방어선.
    if (anchor[0].match.startTime.getTime() <= Date.now()) { failed++; continue; }
    const league = anchor[0].match.league;
    const lines: MarketLines = {
      hc: anchor.find((a) => a.market === "HANDICAP")?.line ?? null,
      ou: anchor.find((a) => a.market === "OU")?.line ?? null,
    };
    const res = parseMarketsResponse(it.text, league, lines);
    if (!res) { failed++; continue; }
    await storePanel(it.matchId, QWEN_MODEL, lines, res);
    saved++;
  }
  return { saved, failed };
}
