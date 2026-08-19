// 빅5 "이달의 감독" — 월간 자동 아티클 잡(리그별 1편). 직전 달 승점/경기 1위 팀(동률 시 xG 득실차)을 뽑아
// af 런타임 라인업 수집 + 월간 집계 + 웹 리서치(sonnet)로 TACTICAL DRAFT 저장.
// cron /api/cron/manager-month (기본 OFF — MANAGER_MONTH_ENABLED=1). 시즌 개막(2026-08) 후 가동.
//   npm run job:manager-month -- [--month=2026-09] [--league=LALIGA] [--dry-run]
import "@/lib/env";
import { prisma } from "@/lib/db";
import { generateWithWebSearch } from "@/lib/ai/claude";
import { generateWithMinLength } from "@/lib/ai/generate-with-min-length";
import { aggregateTeamSeason, type TacticalManagerContext, type BackfilledLineup } from "@/lib/tactical/manager-aggregate";
import { fetchAfLineupsForRange } from "@/lib/tactical/af-lineup-fetch";
import { dataBrief, enrichForRender, teamSlug } from "@/lib/tactical/manager-article";

/** 대상 리그 — 빅5. runManagerMonth 는 리그별로 1편씩 낸다. */
const MONTH_LEAGUES = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"] as const;
const LEAGUE_LABEL: Record<string, string> = {
  EPL: "EPL", LALIGA: "라리가", BUNDESLIGA: "분데스리가", SERIE_A: "세리에 A", LIGUE_1: "리그 앙",
};
// 웹 리서치 질의용 정식 명칭 — 짧은 라벨로 검색하면 엉뚱한 리그가 섞인다.
const LEAGUE_RESEARCH: Record<string, string> = {
  EPL: "잉글랜드 프리미어리그", LALIGA: "스페인 라리가", BUNDESLIGA: "독일 분데스리가",
  SERIE_A: "이탈리아 세리에 A", LIGUE_1: "프랑스 리그 1",
};
const MODEL = process.env.MANAGER_MONTH_MODEL || "claude-sonnet-5";
const MIN_LENGTH = 1800;
const MIN_PLAYED = 3; // 월 3경기 미만 팀은 후보 제외

const SYSTEM_PROMPT = `너는 축구 전술 분석 전문 필자다. "이달의 감독" 월간 전술 리뷰를 한국어로 쓴다.

원칙.
- 제공된 데이터와 웹 리서치 노트의 사실만 쓴다. 스코어·장면·발언을 지어내지 않는다.
- 숫자는 제공된 값을 그대로 인용한다. 재계산·유추 금지.
- 이모지 금지. 문장은 마침표로 끝낸다.
- 출력은 마크다운. "# " 제목 한 줄로 시작하고, 이후 "## " 섹션들로 구성한다.
- 글 상단에 포메이션 분포·평균 포지션 피치·월간 지표가 렌더된다. 필요하면 "위 전술 대시보드"로 참조한다.
- "웹 리서치 노트", "제공된 데이터" 같은 내부 자료 명칭을 본문에 노출하지 않는다. 필요하면 "이달의 보도에 따르면" 정도로 자연스럽게 녹인다.`;

function monthBounds(month: string): { from: Date; to: Date } {
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 0, 23, 59, 59)) };
}

function prevMonth(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
}

/** 리그 전체 순회 — 한 리그 실패가 나머지를 막지 않는다. */
export async function runManagerMonth(opts: { dryRun?: boolean; month?: string; league?: string } = {}): Promise<void> {
  const leagues = opts.league ? [opts.league.toUpperCase()] : [...MONTH_LEAGUES];
  for (const lg of leagues) {
    try {
      await runManagerMonthForLeague(lg, opts);
    } catch (e) {
      console.error(`[manager-month] ${lg} 실패:`, (e as Error).message?.slice(0, 200));
    }
  }
}

async function runManagerMonthForLeague(
  LEAGUE: string,
  opts: { dryRun?: boolean; month?: string },
): Promise<void> {
  const month = opts.month ?? prevMonth();
  const { from, to } = monthBounds(month);
  const label = `${Number(month.slice(0, 4))}년 ${Number(month.slice(5))}월`;
  // 리그를 slug 키에 넣어야 리그별로 각각 1편이 난다(넣지 않으면 첫 리그 발행 후 나머지가 전부 skip).
  const slugKey = `${LEAGUE.toLowerCase()}-manager-month-${month}`;

  // 멱등 가드
  const dup = await prisma.article.findFirst({ where: { type: "TACTICAL", slug: { contains: slugKey } }, select: { slug: true } });
  if (dup) {
    console.log(`[manager-month] ${LEAGUE} 이미 존재 — skip: ${dup.slug}`);
    return;
  }

  // 1) 그 달 라인업 런타임 수집 (af — 파일 의존 없음, Vercel 호환)
  const lineups: BackfilledLineup[] = await fetchAfLineupsForRange(LEAGUE, from, to);
  console.log(`[manager-month] ${month} 라인업 ${lineups.length}경기 수집`);
  if (!lineups.length) {
    console.log(`[manager-month] ${LEAGUE} 대상 경기 없음(비시즌?) — skip`);
    return;
  }

  // 2) 팀별 월간 집계 → 이달의 감독 선정 (승점/경기 → xG 득실차)
  const teamIds = [...new Set((await prisma.match.findMany({
    where: { league: LEAGUE, status: "FINISHED", startTime: { gte: from, lte: to } },
    select: { homeTeamId: true, awayTeamId: true },
  })).flatMap((m) => [m.homeTeamId, m.awayTeamId]))];

  const candidates: TacticalManagerContext[] = [];
  for (const teamId of teamIds) {
    try {
      const ctx = await aggregateTeamSeason({ league: LEAGUE, teamId, from, to, seasonLabel: label, lineups });
      // ⚠️ af coach 는 "현재 감독을 과거 라인업 전체에 도장" 하는 결함이 있어(25/26 첼시·번리 실측)
      // stints 가드가 월중 교체를 못 잡을 수 있다 — 검수 시 감독명 확인 필요.
      if (ctx.record.played >= MIN_PLAYED && ctx.coachStints.length === 1) candidates.push(ctx); // 월중 교체 팀 제외(제한적)
    } catch {
      // 라인업 매칭 0 등 — 후보 제외
    }
  }
  if (!candidates.length) {
    console.log(`[manager-month] ${LEAGUE} 후보 없음 — skip`);
    return;
  }
  const score = (c: TacticalManagerContext) => {
    const r = c.record;
    const xgDiff = c.matches.reduce((s, m) => s + (m.xgFor ?? 0) - (m.xgAgainst ?? 0), 0);
    return r.points / r.played + xgDiff / r.played / 100; // 승점/경기 우선, xG 차는 동률 분리용 미세 가중
  };
  const winner = candidates.sort((a, b) => score(b) - score(a))[0];
  await enrichForRender(winner);
  const r = winner.record;
  console.log(`[manager-month] 선정: ${winner.coach.nameKo}(${winner.team.nameKo}) — ${r.played}경기 ${r.w}승 ${r.d}무 ${r.l}패`);

  if (opts.dryRun) {
    console.log(dataBrief(winner));
    return;
  }

  // 3) 웹 리서치 + 본문
  const researchNotes = await generateWithWebSearch(
    `${winner.coach.name} 감독의 ${winner.team.name}이 ${label}(${LEAGUE_RESEARCH[LEAGUE] ?? LEAGUE})에 보인 전술과 경기력을 조사하라. ` +
    `그 달의 전술 변화·키 경기·핵심 선수 활약·감독 발언 요지를 한국어 불릿 5~8개로 정리하라. 확인 안 되는 내용은 쓰지 말 것.`,
    { model: MODEL, maxUses: 3, maxTokens: 1200, temperature: 0.3 },
  );
  const matchList = winner.matches
    .map((m) => `${m.date} ${m.homeAway === "H" ? "홈" : "원정"} vs ${m.opponentKo} ${m.gf}-${m.ga} ${m.result}${m.formation ? ` (${m.formation})` : ""}`)
    .join("\n");
  const content = await generateWithMinLength(
    `${label} ${LEAGUE_LABEL[LEAGUE] ?? LEAGUE} "이달의 감독" 글을 작성하라. 선정: ${winner.coach.nameKo} 감독(${winner.team.nameKo}).

## 월간 데이터 (실측 — 그대로 인용)
${dataBrief(winner)}

## 경기 목록
${matchList}

## 웹 리서치 노트 (사실 확인됨)
${researchNotes}

## 글 구조 (H2 섹션)
1. 선정 이유 — 월간 성적과 내용(xG) 요약.
2. 이번 달의 전술 — 포메이션 운용·평균 포지션에서 보이는 특징.
3. 결정적 경기 — 경기 목록에서 2~3경기를 골라 흐름을 짚는다.
4. 키 플레이어 — 최다 선발·리서치 노트 기반 1~2명.
5. 다음 달 관전 포인트.

분량은 한국어 2000자 이상.`,
    // timeoutMs 240s — Vercel cron maxDuration 300s 안에서 af 수집 후 생성까지 맞추는 상한
    { system: SYSTEM_PROMPT, model: MODEL, maxTokens: 3500, temperature: 0.6, minLength: MIN_LENGTH, timeoutMs: 240_000, label: `manager-month:${month}` },
  );
  if (!content) {
    console.warn("[manager-month] 본문 길이 미달 — skip");
    return;
  }

  const h1 = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const title = h1 ?? `${label} ${LEAGUE_LABEL[LEAGUE] ?? LEAGUE} 이달의 감독 — ${winner.coach.nameKo} (${winner.team.nameKo})`;
  const article = await prisma.article.create({
    data: {
      type: "TACTICAL",
      league: LEAGUE,
      title,
      slug: `tmp-${slugKey}-${Date.now()}`,
      content,
      status: "DRAFT",
      tacticalContext: JSON.stringify(winner),
    },
  });
  const slug = `${slugKey}-${teamSlug(winner.team.name)}-${article.id}`;
  await prisma.article.update({ where: { id: article.id }, data: { slug } });
  console.log(`[manager-month] DRAFT 저장: ${slug} (${content.length}자)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  runManagerMonth({
    dryRun: args.includes("--dry-run"),
    month: args.find((a) => a.startsWith("--month="))?.split("=")[1],
    league: args.find((a) => a.startsWith("--league="))?.split("=")[1],
  })
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
