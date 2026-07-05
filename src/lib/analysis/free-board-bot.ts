// 자유게시판(FREE) 커뮤니티 포맷 봇 — 2026-07-05 커뮤니티 리서치에서 검증된 "잘 터지는"
// 글 유형(이변 반응·대승 반응·순위 접전 정리·AI 성적표·빅매치 잡담)을 우리 DB 데이터로 재현.
// 원칙: 날조 금지 — DB 에서 검증 가능한 숫자(스코어·확률·게임차·적중률)만 재료로 쓰고,
// 짤은 자체 스탯카드(/api/og/match-card)를 쓴다. fake-picks cron(30분)에 편승해 하루 3~6글.

import "server-only";
import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/claude";
import { toKoreanTeamName } from "@/lib/team-names";
import { ARTICLE_LEAGUES } from "@/lib/sports/types";
import { kstDayWindow } from "@/lib/threads/kst";
import { leagueLabel } from "@/lib/analysis/matches";
import { fetchBaseballTable } from "@/lib/sports/thesports/baseball-table";
import { sportForLeague, botTeamName } from "@/lib/analysis/manager-bot";
import { FAKE_NICKNAMES, PERSONAS, ensureFakeMember } from "@/lib/analysis/fake-members";

const DAILY_CAP = 6; // 자유게시판 봇 글 하루 상한 — 규모 대비 도배 방지

interface Topic {
  kind: "upset" | "blowout" | "kbo-race" | "ai-report" | "big-match";
  data: string; // 프롬프트에 주입할 검증된 재료
  guide: string; // 글 형식 지시
  matchId?: number; // 매치 기반 토픽 — dedupe + 카드 첨부
  sport?: string;
  appendix?: string; // 본문 뒤에 붙일 카드/링크 마크다운
}

const ko = (name: string, league: string) => botTeamName(toKoreanTeamName(name, league), league);

/** 최근 24h 종료 경기 — 이변(승자 사전 확률 <= 35%)·대승 후보. */
async function finishedCandidates() {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  return prisma.match.findMany({
    where: {
      status: "FINISHED",
      startTime: { gte: since },
      league: { in: ARTICLE_LEAGUES as readonly string[] as string[] },
      homeScore: { not: null },
      awayScore: { not: null },
    },
    select: {
      id: true,
      league: true,
      homeScore: true,
      awayScore: true,
      predHome: true,
      predAway: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
    take: 120,
  });
}

/** 매치 기반 토픽 dedupe — 그 경기로 이미 FREE 글이 있으면 재사용 금지. */
async function usedMatchIds(ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const rows = await prisma.post.findMany({
    where: { category: "FREE", matchId: { in: ids } },
    select: { matchId: true },
  });
  return new Set(rows.map((r) => r.matchId!).filter(Boolean));
}

/** 오늘 봇 FREE 글 — 하루 상한 + 비매치 토픽(순위·AI 성적표) 중복 판단. */
async function todayBotFreePosts() {
  const { start, end } = kstDayWindow();
  return prisma.post.findMany({
    where: {
      category: "FREE",
      createdAt: { gte: start, lt: end },
      author: { email: { startsWith: "fake", endsWith: "@scorebase.internal" } },
    },
    select: { content: true },
  });
}

async function buildTopics(): Promise<Topic[]> {
  const topics: Topic[] = [];
  const todayPosts = await todayBotFreePosts();

  // 1·2. 이변 / 대승 — 종료 경기 기반
  const finished = await finishedCandidates();
  const used = await usedMatchIds(finished.map((m) => m.id));
  for (const m of finished) {
    if (used.has(m.id)) continue;
    const home = ko(m.homeTeam.name, m.league);
    const away = ko(m.awayTeam.name, m.league);
    const hs = m.homeScore!;
    const as = m.awayScore!;
    const sport = sportForLeague(m.league) ?? undefined;
    const base = `경기: ${home} ${hs} : ${as} ${away} (${leagueLabel(m.league)}, 종료)`;
    const card = `\n\n![${home} vs ${away}](/api/og/match-card?m=${m.id})`;

    // 이변 — 승자의 사전 승률이 35% 이하
    const winnerPred = hs > as ? m.predHome : as > hs ? m.predAway : null;
    if (winnerPred != null && winnerPred <= 0.35) {
      topics.push({
        kind: "upset",
        data: `${base}\n승리팀의 경기 전 AI 예측 승률: ${Math.round(winnerPred * 100)}% (이변)`,
        guide: "이변에 놀라는 반응 글. 한두 문장, 커뮤니티 반응 톤.",
        matchId: m.id,
        sport,
        appendix: card,
      });
      continue;
    }
    // 대승 — 종목별 점수차
    const diff = Math.abs(hs - as);
    const big =
      sport === "baseball" ? diff >= 6 : sport === "soccer" ? diff >= 3 : sport === "basketball" ? diff >= 20 : sport === "hockey" ? diff >= 4 : false;
    if (big) {
      topics.push({
        kind: "blowout",
        data: base,
        guide: "일방적인 스코어를 보고 한 마디 던지는 반응 글. 한두 문장.",
        matchId: m.id,
        sport,
        appendix: card,
      });
    }
  }

  // 3. KBO 순위 접전 — 1·2위 게임차 1.5 이하일 때만, 하루 1회
  if (!todayPosts.some((p) => p.content.includes("/standings/KBO"))) {
    try {
      const table = await fetchBaseballTable("KBO");
      if (table.length >= 2) {
        const [t1, t2] = table;
        const gb = (t1.wins - t2.wins + (t2.losses - t1.losses)) / 2;
        if (gb <= 1.5) {
          const [n1, n2] = await Promise.all(
            [t1.ourTeamId, t2.ourTeamId].map((id) =>
              prisma.team.findUnique({ where: { id }, select: { name: true } }),
            ),
          );
          if (n1 && n2) {
            topics.push({
              kind: "kbo-race",
              data: [
                `KBO 순위 경쟁 (공식 순위):`,
                `1위 ${ko(n1.name, "KBO")} ${t1.wins}승 ${t1.draws}무 ${t1.losses}패`,
                `2위 ${ko(n2.name, "KBO")} ${t2.wins}승 ${t2.draws}무 ${t2.losses}패 — 게임차 ${gb.toFixed(1)}`,
              ].join("\n"),
              guide: "순위 경쟁이 뜨겁다는 짧은 정리+자기 한 마디. 2~3문장.",
              appendix: `\n\n[전체 순위 보기](/standings/KBO)`,
            });
          }
        }
      }
    } catch {
      // 순위 캐시 miss 는 토픽 생략
    }
  }

  // 4. 어제 AI 성적표 — 채점(predCorrect) 5경기 이상일 때, 하루 1회
  if (!todayPosts.some((p) => p.content.includes("/predictions/accuracy"))) {
    const y = new Date(Date.now() + 9 * 3600 * 1000 - 24 * 3600 * 1000);
    const yKey = `${y.getUTCFullYear()}-${String(y.getUTCMonth() + 1).padStart(2, "0")}-${String(y.getUTCDate()).padStart(2, "0")}`;
    const { start, end } = kstDayWindow(yKey);
    const graded = await prisma.match.findMany({
      where: { startTime: { gte: start, lt: end }, predCorrect: { not: null } },
      select: { predCorrect: true },
    });
    if (graded.length >= 5) {
      const correct = graded.filter((g) => g.predCorrect).length;
      topics.push({
        kind: "ai-report",
        data: `어제 이 사이트 AI 모델 1X2 예측 성적: ${graded.length}경기 중 ${correct}적중 (${Math.round((correct / graded.length) * 100)}%)`,
        guide: "AI 성적을 보고 감탄하거나 가볍게 놀리는 반응 글. 한두 문장.",
        appendix: `\n\n[리그별 적중률 보기](/predictions/accuracy)`,
      });
    }
  }

  // 5. 오늘 빅매치 잡담 — Elo 합 최상위 예정 경기 1개 (dedupe 는 matchId 로)
  const { start: ts, end: te } = kstDayWindow();
  const today = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      startTime: { gte: ts, lt: te },
      league: { in: ARTICLE_LEAGUES as readonly string[] as string[] },
    },
    select: {
      id: true,
      league: true,
      homeTeam: { select: { name: true, eloRating: true } },
      awayTeam: { select: { name: true, eloRating: true } },
    },
    take: 100,
  });
  if (today.length > 0) {
    const top = [...today].sort(
      (a, b) => b.homeTeam.eloRating + b.awayTeam.eloRating - (a.homeTeam.eloRating + a.awayTeam.eloRating),
    )[0];
    const usedToday = await usedMatchIds([top.id]);
    if (!usedToday.has(top.id)) {
      const home = ko(top.homeTeam.name, top.league);
      const away = ko(top.awayTeam.name, top.league);
      topics.push({
        kind: "big-match",
        data: `오늘의 빅매치: ${home} vs ${away} (${leagueLabel(top.league)}, 예정)`,
        guide: "이 경기 얘기를 꺼내며 다른 회원 의견을 묻는 가벼운 잡담. 한두 문장, 질문으로 끝나도 좋음.",
        matchId: top.id,
        sport: sportForLeague(top.league) ?? undefined,
        appendix: `\n\n![${home} vs ${away}](/api/og/match-card?m=${top.id})`,
      });
    }
  }

  return topics;
}

const FREE_SYSTEM = (nickname: string, tone: string, guide: string, recent: string[]) => `당신은 스포츠 커뮤니티 회원 "${nickname}"입니다. 자유게시판에 짧은 글을 하나 올립니다.

[캐릭터]
- 말투: ${tone}
- 전문 분석가 아님. 팬의 시선. 픽·베팅 얘기는 이 글에선 안 함.

[이번 글]
- ${guide}
- 제목: 25자 이내 단문. 커뮤니티식 — 감탄·혼잣말·질문 다 가능. 팀명이나 숫자가 들어가면 좋음. 기사 헤드라인 톤 금지.
- 본문: 1~3문장. 길면 안 됨.

[사실 규칙 — 절대]
- 제공된 데이터에 있는 사실·숫자만 사용. 없는 것(선수 발언·부상·심판 판정·현장 직관 경험·뒷이야기) 지어내기 금지.
- 숫자를 바꾸거나 과장하지 말 것.

[중복 금지]
최근 자유게시판 글: ${recent.length ? recent.join(" / ") : "(없음)"}
- 위와 제목·문장 구조가 겹치면 안 됨.

[출력] 반드시 JSON 객체 하나만: {"title":"...","body":"..."}`;

/** 자유게시판 봇 글 1개 발행. force=true 면 확률 게이트 생략(검증용). */
export async function runFreeBoardPost(force = false): Promise<{ created: number; skipped: number; kind?: string }> {
  // 시간대별 확률(KST) — 3파도. 30분 주기 기준 하루 ~4글.
  const kstHour = (new Date().getUTCHours() + 9) % 24;
  const rate = kstHour >= 18 ? 0.15 : kstHour >= 9 ? 0.07 : kstHour >= 7 ? 0.12 : 0.02;
  if (!force && Math.random() > rate) return { created: 0, skipped: 0 };

  try {
    const todayCount = (await todayBotFreePosts()).length;
    if (todayCount >= DAILY_CAP) return { created: 0, skipped: 1 };

    const topics = await buildTopics();
    if (topics.length === 0) return { created: 0, skipped: 1 };
    const topic = topics[Math.floor(Math.random() * topics.length)];

    const i = Math.floor(Math.random() * FAKE_NICKNAMES.length);
    const nickname = FAKE_NICKNAMES[i];
    const persona = PERSONAS[i];

    const recent = await prisma.post.findMany({
      where: { category: "FREE" },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { title: true },
    });

    const raw = await generate(topic.data, {
      system: FREE_SYSTEM(nickname, persona.tone, topic.guide, recent.map((r) => r.title)),
      maxTokens: 400,
      temperature: 0.95,
    });
    let json: { title?: unknown; body?: unknown } | null = null;
    try {
      const s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
      json = JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1));
    } catch {
      json = null;
    }
    const title = String(json?.title ?? "").trim().slice(0, 120);
    const body = String(json?.body ?? "").trim();
    if (!title || body.length < 4) return { created: 0, skipped: 1 };

    const userId = await ensureFakeMember(i);
    // createdAt 과거 지터 — cron 정각 티 제거 (다른 봇과 동일 장치)
    const createdAt = new Date(Date.now() - (1 + Math.floor(Math.random() * 29)) * 60_000 - Math.floor(Math.random() * 60) * 1000);
    await prisma.post.create({
      data: {
        authorId: userId,
        category: "FREE",
        title,
        content: body + (topic.appendix ?? ""),
        sport: topic.sport,
        matchId: topic.matchId,
        createdAt,
      },
    });
    return { created: 1, skipped: 0, kind: topic.kind };
  } catch {
    return { created: 0, skipped: 1 };
  }
}
