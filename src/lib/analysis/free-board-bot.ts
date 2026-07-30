// 자유게시판(FREE) 커뮤니티 포맷 봇 — 2026-07-05 커뮤니티 리서치에서 검증된 "잘 터지는"
// 글 유형을 우리 DB 데이터로 재현. 유형: 이변 반응·대승 반응·순위 접전 정리·AI 성적표·빅매치
// 잡담 + (2026-07-15 fmkorea/mlbpark 리서치 반영) 선수 리더 소재·이적 루머 반응.
// 원칙: 날조 금지 — DB 에서 검증 가능한 숫자(스코어·확률·게임차·적중률·리더 기록·보도 단계)만
// 재료로 쓰고, 짤은 자체 스탯카드(/api/og/match-card)를 쓴다. fake-picks cron(30분)에 편승.

import "server-only";
import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/claude";
import { toKoreanTeamName } from "@/lib/team-names";
import { toKoreanPlayerName } from "@/lib/player-names";
import { afPlayerToTs } from "@/lib/players/ts-af-map";
import { ARTICLE_LEAGUES } from "@/lib/sports/types";
import { kstDayWindow } from "@/lib/threads/kst";
import { leagueLabel } from "@/lib/analysis/matches";
import { fetchBaseballTable } from "@/lib/sports/thesports/baseball-table";
import { sportForLeague, botTeamName } from "@/lib/analysis/manager-bot";
import { FAKE_NICKNAMES, PERSONAS, ensureFakeMember } from "@/lib/analysis/fake-members";

const DAILY_CAP = 6; // 자유게시판 봇 글 하루 상한 — 규모 대비 도배 방지

interface Topic {
  kind: "upset" | "blowout" | "kbo-race" | "ai-report" | "big-match" | "leader" | "rumor" | "vs";
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

/** 지금 진행 중인 리그 집합 — 최근 14일 내 종료 or 향후 14일 내 예정 경기가 있으면 in-season.
 *  리더/vs 프레이밍을 시즌 상태에 맞추는 데 사용(예: 축구 여름 비시즌 = 최종 기록, 야구 = 레이스). */
async function activeLeagueSet(): Promise<Set<string>> {
  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000);
  const until = new Date(Date.now() + 14 * 24 * 3600 * 1000);
  const rows = await prisma.match.findMany({
    where: { startTime: { gte: since, lte: until }, status: { in: ["FINISHED", "LIVE", "SCHEDULED"] } },
    select: { league: true },
    distinct: ["league"],
  });
  return new Set(rows.map((r) => r.league));
}

// ── 선수 리더 소재 (커뮤니티 최대 소재: "이 선수 이 기록 실화") ──────────────
// 인기 리그 + 간판 스탯만. 카드·경고 카테고리(YELLOW/RED)나 군소 리그는 제외.
const POPULAR_LEADER_LEAGUES = new Set([
  "EPL", "LALIGA", "SERIE_A", "BUNDESLIGA", "LIGUE_1", "UCL", "UEL", "UECL", "WORLD_CUP",
  "MLB", "KBO", "NPB", "NBA", "NHL", "LOL",
]);
// 간판 카테고리만 — SAVE 는 KBO/NPB 에서 선발이 0으로 1위 잡히는 유령행이 있어 제외.
const MARQUEE_CATEGORIES = ["GOAL", "ASSIST", "HR", "BA", "ERA", "K", "RBI", "PTS", "AST", "REB", "POINTS", "GOAL_NHL", "KDA", "KILL"];
const LEADER_DEC1 = new Set(["PTS", "AST", "REB"]); // NBA 경기당 스탯 — 소수 1자리로 반올림
const LEADER_DEC2 = new Set(["ERA", "KDA"]);
const LEADER_DEC3 = new Set(["BA"]);

/** 리더 값 표시 — 카테고리별 자릿수 고정. 긴 float(경기당 스탯)을 왜곡 없이 다듬기만. */
function fmtLeaderValue(cat: string, v: number): string {
  if (LEADER_DEC3.has(cat)) return v.toFixed(3);
  if (LEADER_DEC2.has(cat)) return v.toFixed(2);
  if (LEADER_DEC1.has(cat)) return v.toFixed(1);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** 인기 리그 간판 스탯의 최신 시즌 선두(+근접 2위) 반응 토픽. 상한 3, 오늘 언급된 선수 제외. */
async function leaderTopics(todayPosts: { content: string }[], active: Set<string>): Promise<Topic[]> {
  const rows = await prisma.leagueLeader.findMany({
    where: {
      league: { in: [...POPULAR_LEADER_LEAGUES] },
      category: { in: MARQUEE_CATEGORIES },
      rank: { lte: 2 },
      value: { gt: 0 }, // 유령 0 기록(세이브 등) 배제
    },
    orderBy: [{ league: "asc" }, { category: "asc" }, { season: "desc" }, { rank: "asc" }],
    select: { league: true, category: true, rank: true, playerName: true, teamName: true, value: true, unit: true, season: true },
    take: 600,
  });

  // 리그+카테고리별 최신 시즌만 (season desc 정렬이라 그룹 첫 행이 최신 시즌).
  type Row = (typeof rows)[number];
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = `${r.league}|${r.category}`;
    const g = groups.get(key);
    if (!g) groups.set(key, [r]);
    else if (g[0].season === r.season) g.push(r);
  }

  const cands: Topic[] = [];
  for (const g of groups.values()) {
    const r1 = g.find((x) => x.rank === 1);
    if (!r1) continue;
    const player = toKoreanPlayerName(r1.playerName).trim();
    if (!player) continue;
    if (todayPosts.some((p) => p.content.includes(player))) continue; // 하루 중복 방지
    const label = r1.unit ?? r1.category;
    const team = toKoreanTeamName(r1.teamName, r1.league).trim();
    const val = fmtLeaderValue(r1.category, r1.value);
    const inSeason = active.has(r1.league);
    const lines = [`${leagueLabel(r1.league)} ${label} 1위: ${player}(${team}) ${val}`];
    const r2 = g.find((x) => x.rank === 2);
    if (r2) {
      const p2 = toKoreanPlayerName(r2.playerName).trim();
      const t2 = toKoreanTeamName(r2.teamName, r2.league).trim();
      if (p2) lines.push(`2위: ${p2}(${t2}) ${fmtLeaderValue(r2.category, r2.value)}`);
    }
    lines.push(`기록 상태: ${inSeason ? "진행 중인 시즌 (레이스 계속)" : `${r1.season} 시즌 최종 기록 (종료)`}`);
    cands.push({
      kind: "leader",
      data: lines.join("\n"),
      guide: inSeason
        ? "리그 선두 선수의 기록을 보고 감탄하거나 가볍게 던지는 반응 글. 1~2문장. 2위와 격차가 촘촘하면 순위 경쟁으로 엮어도 좋음."
        : "이미 끝난 시즌의 최종 기록 회고 글. 1~2문장. ⚠️ 종료된 시즌이니 '아직 남았다·누가 될까·확정 짓겠다'처럼 진행 중인 척 금지. 지난 시즌 그 기록이 대단했다는 회고나 다음 시즌 전망으로.",
      appendix: `\n\n[${leagueLabel(r1.league)} 리더 보기](/standings/${r1.league})`,
    });
  }
  return cands.sort(() => Math.random() - 0.5).slice(0, 3);
}

// ── 이적 루머 반응 (fmkorea "[소식통] 선수 이적설" 문법) ──────────────────────
const RUMOR_STAGE_KO: Record<string, string> = {
  OFFICIAL: "공식 발표", HERE_WE_GO: "오피셜 임박", MEDICAL: "메디컬 진행", TALKS: "협상 진행",
};

/** 최근 3일 이적 보도 반응 토픽. 상한 2, 선수 중복·오늘 언급 제외. 금액은 프롬프트에 안 넣음. */
async function rumorTopics(todayPosts: { content: string }[]): Promise<Topic[]> {
  const since = new Date(Date.now() - 3 * 24 * 3600 * 1000);
  const rows = await prisma.transferRumor.findMany({
    where: { hidden: false, publishedAt: { gte: since }, toTeamKo: { not: null } },
    orderBy: { publishedAt: "desc" },
    take: 25,
    select: { playerKo: true, fromTeamKo: true, toTeamKo: true, stage: true, summaryKo: true, sourceName: true },
  });

  const cands: Topic[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const player = r.playerKo.trim();
    if (!player || seen.has(player)) continue;
    seen.add(player);
    if (todayPosts.some((p) => p.content.includes(player))) continue;
    const from = r.fromTeamKo ?? "현 소속팀";
    const stage = RUMOR_STAGE_KO[r.stage] ?? r.stage;
    // summaryKo 는 보도 팩트지만 이적료 문구가 섞일 수 있어, 프롬프트엔 요약을 넣되 금액 언급을 금지한다.
    cands.push({
      kind: "rumor",
      data: [
        `이적 소식(보도): ${player} ${from} → ${r.toTeamKo}`,
        `보도 단계: ${stage}`,
        `한 줄 요약: ${r.summaryKo}`,
        `보도 출처: ${r.sourceName}`,
      ].join("\n"),
      guide: "이 이적 소식을 접한 팬의 반응 글. 놀람·환영·의심·아쉬움 중 하나의 결. 1~2문장. 보도된 사실만 쓰고, 이적료·금액·구체적 계약 조건은 언급 금지. '협상 진행' 등 확정 아닌 단계는 단정하지 말 것.",
      appendix: `\n\n[이적시장 보기](/transfers)`,
    });
  }
  return cands.sort(() => Math.random() - 0.5).slice(0, 2);
}

// ── vs놀이 (A vs B 누가 낫냐 / 라이벌 매치, mlbpark 간판 문화) ────────────────
// 같은 리그 득점왕·도움왕 직접 경쟁자(rank1 vs rank2)를 라이벌로 세우고, 우리 선수 비교
// 페이지(/compare/{ts_a}/{ts_b})로 링크해 댓글·탐색을 유도. 둘 다 af→ts 변환되는 축구만.
const VS_SOCCER_LEAGUES = new Set(["EPL", "LALIGA", "SERIE_A", "BUNDESLIGA", "LIGUE_1"]);
const VS_CATEGORIES = ["GOAL", "ASSIST"];

/** 같은 리그 간판 스탯 1위 vs 2위 라이벌 vs놀이 토픽. 상한 2, 둘 다 비교 링크 가능해야 함. */
async function vsTopics(todayPosts: { content: string }[], active: Set<string>): Promise<Topic[]> {
  const rows = await prisma.leagueLeader.findMany({
    where: {
      league: { in: [...VS_SOCCER_LEAGUES] },
      category: { in: VS_CATEGORIES },
      rank: { lte: 2 },
      value: { gt: 0 },
      externalId: { not: null },
    },
    orderBy: [{ league: "asc" }, { category: "asc" }, { season: "desc" }, { rank: "asc" }],
    select: { league: true, category: true, rank: true, playerName: true, teamName: true, value: true, unit: true, season: true, externalId: true },
    take: 200,
  });

  type Row = (typeof rows)[number];
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = `${r.league}|${r.category}`;
    const g = groups.get(key);
    if (!g) groups.set(key, [r]);
    else if (g[0].season === r.season) g.push(r);
  }

  const cands: Topic[] = [];
  for (const g of groups.values()) {
    const r1 = g.find((x) => x.rank === 1);
    const r2 = g.find((x) => x.rank === 2);
    if (!r1 || !r2) continue;
    // 비교 링크가 살아있으려면 둘 다 ts 매핑 필요 (없으면 라이벌 매치 자체를 생략).
    const ts1 = r1.externalId ? afPlayerToTs(r1.externalId) : null;
    const ts2 = r2.externalId ? afPlayerToTs(r2.externalId) : null;
    if (!ts1 || !ts2 || ts1 === ts2) continue;
    const p1 = toKoreanPlayerName(r1.playerName).trim();
    const p2 = toKoreanPlayerName(r2.playerName).trim();
    if (!p1 || !p2) continue;
    if (todayPosts.some((p) => p.content.includes(p1) && p.content.includes(p2))) continue;
    const cat = r1.unit ?? r1.category;
    const t1 = toKoreanTeamName(r1.teamName, r1.league).trim();
    const t2 = toKoreanTeamName(r2.teamName, r2.league).trim();
    const [x, y] = [ts1, ts2].sort();
    const inSeason = active.has(r1.league);
    cands.push({
      kind: "vs",
      data: [
        `${leagueLabel(r1.league)} ${cat} 라이벌 맞대결`,
        `A: ${p1}(${t1}) ${cat} ${fmtLeaderValue(r1.category, r1.value)}`,
        `B: ${p2}(${t2}) ${cat} ${fmtLeaderValue(r2.category, r2.value)}`,
        `기록 상태: ${inSeason ? "진행 중인 시즌 (레이스 계속)" : `${r1.season} 시즌 최종 기록 (종료)`}`,
      ].join("\n"),
      guide: `두 선수 중 누가 더 낫냐를 묻는 vs놀이 글. 자기 생각을 한쪽에 살짝 얹되 다른 회원 의견을 묻는 질문으로 끝내기. 1~2문장. 한쪽을 사실로 단정하지 말 것 — 어디까지나 취향·의견. ${inSeason ? "" : "⚠️ 이미 끝난 시즌이니 '누가 될까·아직 남았다'로 쓰지 말 것 — 지난 시즌 최종 기록 기준으로 누가 더 나은 선수였는지 묻기. 확인 안 되는 개인사(적응·이적·나이·부상)는 지어내지 말 것."}`,
      appendix: `\n\n스탯 맞대결 → [${p1} vs ${p2}](/compare/${x}/${y})`,
    });
  }
  return cands.sort(() => Math.random() - 0.5).slice(0, 2);
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

  // 6·7·8. 선수 리더 소재 + 이적 루머 반응 + vs놀이 — 커뮤니티 밥줄 소재.
  // 리더·vs 는 시즌 종료 여부(active)에 따라 프레이밍이 달라 활성 리그 집합을 한 번 조회해 공유.
  const active = await activeLeagueSet().catch(() => new Set<string>());
  try {
    topics.push(...(await leaderTopics(todayPosts, active)));
  } catch {
    // 리더 캐시 miss 는 토픽 생략
  }
  try {
    topics.push(...(await rumorTopics(todayPosts)));
  } catch {
    // 루머 없음 → 토픽 생략
  }
  try {
    topics.push(...(await vsTopics(todayPosts, active)));
  } catch {
    // 비교 가능한 라이벌 쌍 없음 → 토픽 생략
  }

  return topics;
}

const FREE_SYSTEM = (nickname: string, tone: string, guide: string, recent: string[]) => `당신은 스포츠 커뮤니티 회원 "${nickname}"입니다. 자유게시판에 짧은 글을 하나 올립니다.

[캐릭터]
- 말투: ${tone}
- 전문 분석가 아님. 팬의 시선. 픽·베팅 얘기는 이 글에선 안 함.

[커뮤니티 말투 — 중간 강도]
- 진짜 스포츠 커뮤니티 회원처럼. 반응형 짧은 감탄·혼잣말·질문을 환영.
- ㅋㅋ·ㄷㄷ·ㄹㅇ·실화냐·甲 같은 표현을 가끔 써도 됨(글 하나에 한두 번까지, 도배 금지). 이모지·해시태그 금지.
- 매번 같은 결로 쓰지 말 것 — 어떤 글은 반말로 툭 던지고, 어떤 글은 존댓말로 의견을 묻는 식으로. 페르소나 말투를 우선.

[이번 글]
- ${guide}
- 제목: 25자 이내 단문. 커뮤니티식 — 감탄·혼잣말·질문·반토막 문장 다 가능. 팀명·선수 실명이나 숫자가 들어가면 좋음. 기사 헤드라인 톤 금지.
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
