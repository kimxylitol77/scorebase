// EPL 감독 전술 연구 — 시즌 결산 아티클 생성 잡. 집계(manager-aggregate) + 웹 리서치(sonnet)로
// 감독 단위 심층 전술 글을 Article(type=TACTICAL, DRAFT) 로 저장. 전술판 위젯 데이터는 tacticalContext.
// 대상 = 최종 순위 상위 N팀(--top, 기본 4) 또는 --team=이름. 멱등 — 같은 팀 시즌 글 있으면 skip.
//   npm run job:manager-review -- --top=4 [--team=Arsenal] [--dry-run]
// --promoted: 승격팀 모드 — 팀은 현재 EPL 소속이지만 25/26 데이터는 챔피언십에서 집계한다.
// 글은 EPL 게시(같은 slug 체계)·챔피언십 시즌 결산 + EPL 전망 프레임. --team 과 함께 쓴다.
//   npx tsx src/jobs/generate-manager-review.ts --promoted --team=Coventry
import "@/lib/env";
import { prisma } from "@/lib/db";
import { generateWithWebSearch } from "@/lib/ai/claude";
import { generateWithMinLength } from "@/lib/ai/generate-with-min-length";
import {
  aggregateTeamSeason,
  computeLeagueTable,
  type TacticalManagerContext,
} from "@/lib/tactical/manager-aggregate";
import { dataBrief, enrichForRender, teamSlug } from "@/lib/tactical/manager-article";

// --league=LALIGA 로 리그 선택 (기본 EPL). 라벨은 프롬프트·리서치 문구용.
const LEAGUE = process.argv.find((a) => a.startsWith("--league="))?.split("=")[1]?.toUpperCase() ?? "EPL";
const LEAGUE_LABEL: Record<string, { short: string; research: string }> = {
  EPL: { short: "EPL", research: "잉글랜드 프리미어리그" },
  LALIGA: { short: "라리가", research: "스페인 라리가" },
  BUNDESLIGA: { short: "분데스리가", research: "독일 분데스리가" },
  SERIE_A: { short: "세리에 A", research: "이탈리아 세리에 A" },
  LIGUE_1: { short: "리그 앙", research: "프랑스 리그 1" },
};
if (!LEAGUE_LABEL[LEAGUE]) throw new Error(`미지원 리그: ${LEAGUE} (${Object.keys(LEAGUE_LABEL).join(", ")})`);
const SEASON_FROM = new Date("2025-08-01");
const SEASON_TO = new Date("2026-06-15");
const SEASON_LABEL = "2025-26";
const MODEL = process.env.MANAGER_REVIEW_MODEL || "claude-sonnet-5"; // haiku 는 웹서치 후 품질 붕괴(transfer-xi 실증)
const MIN_LENGTH = 2500;

const SYSTEM_PROMPT = `너는 축구 전술 분석 전문 필자다. 데이터 근거 위주의 전문적인 시즌 결산 전술 연구 글을 한국어로 쓴다.

원칙.
- 제공된 데이터와 웹 리서치 노트에 있는 사실만 쓴다. 스코어·장면·발언을 지어내지 않는다.
- 숫자는 제공된 값을 그대로 인용한다. 재계산·유추 금지.
- 이모지 금지. 문장은 마침표로 끝낸다.
- 출력은 마크다운. "# " 제목 한 줄로 시작하고, 이후 "## " 섹션들로 구성한다.
- 글 상단에 포메이션 분포·평균 포지션 피치·득점 지도·월별 xG 차트가 렌더된다. 필요하면 "위 전술 대시보드"로 자연스럽게 참조하되 차트를 말로 중복 설명하지 않는다.
- 전술 용어(빌드업, 하프스페이스, 압박 트리거 등)는 근거 데이터와 연결될 때만 사용한다.
- "웹 리서치 노트", "제공된 데이터" 같은 내부 자료 명칭을 본문에 노출하지 않는다. 필요하면 "시즌 중 보도에 따르면" 정도로 자연스럽게 녹인다.`;

function buildPrompt(ctx: TacticalManagerContext, researchNotes: string, promoted: boolean): string {
  const leagueLabel = promoted ? "EFL 챔피언십" : LEAGUE_LABEL[LEAGUE].short;
  const promotedNote = promoted
    ? `\n이 팀은 이 시즌을 마치고 프리미어리그로 승격했다. 글의 관점은 "승격을 만든 전술"이고, 마지막 섹션은 이 전술이 EPL 에서 통할 지점과 리스크를 다룬다.\n`
    : "";
  return `${ctx.coach.nameKo} 감독의 ${ctx.team.nameKo} ${SEASON_LABEL} 시즌(${leagueLabel}) 전술 연구 글을 작성하라.
${promotedNote}

## 시즌 데이터 (실측 — 그대로 인용)
${dataBrief(ctx)}

## 웹 리서치 노트 (사실 확인됨 — 맥락 보강용)
${researchNotes}

## 글 구조 (H2 섹션)
1. 시즌 개요 — 순위·승점과 시즌의 큰 그림. 2~3문단.
2. 기본 형태 — 포메이션 분포 데이터 해석. 주 포메이션이 왜 그 팀에 맞았는지, 변형은 언제 나왔는지.
3. 공격 작동법 — 슈팅 프로필(박스 안 비중, 주 득점원, xG)로 본 득점 루트. 평균 포지션과 명목 포메이션의 차이가 있으면 짚는다.
4. 수비 조직 — 실점·피슈팅·실점xG 데이터로 본 수비 구조의 강점과 약점.
5. 키 플레이어 — 최다 선발·전 경기 선발 데이터와 리서치 노트의 역할 정보를 연결. 2~3명 심층.
6. 시즌의 변곡점 — 월별 흐름 데이터에서 상승/하락 구간을 짚고 리서치 노트로 원인 보강.${ctx.coachStints.length > 1 ? " 감독 교체 전후 비교 필수." : ""}
7. ${promoted ? "총평과 프리미어리그 전망 — 이 전술이 EPL 에서 통할 지점과 리스크, 보강 포인트." : "총평과 다음 시즌 — 이 전술의 지속 가능성, 보강 포인트."}

분량은 한국어 3000자 이상. 소제목은 위 구조를 따르되 표현은 자연스럽게 바꿔도 된다.`;
}

// ============================================================
// 메인
// ============================================================
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const top = Number(args.find((a) => a.startsWith("--top="))?.split("=")[1] ?? 4);
  const teamArg = args.find((a) => a.startsWith("--team="))?.split("=")[1];
  // 승격팀 모드 — 팀 소속은 EPL(롤오버 완료)이지만 25/26 경기·라인업은 챔피언십에 있다.
  const promoted = args.includes("--promoted");
  if (promoted && !teamArg) throw new Error("--promoted 는 --team 과 함께 쓴다 (팀별 1회 실행)");
  const dataLeague = promoted ? "CHAMPIONSHIP" : LEAGUE;
  // 승격팀은 정규시즌 창으로 자른다(정규 최종전 5/2, 플레이오프 5/8~). 플레이오프를 섞으면
  // 승점이 리그 최종표와 다른 허구값이 된다(헐 실측: 3전 전승 +9 로 "승점 82" — 실제 73).
  // 플레이오프 경유 승격 서사는 웹 리서치 노트가 채운다.
  const seasonTo = promoted ? new Date("2026-05-04") : SEASON_TO;

  // 대상 팀 — --team 지정 또는 최종 순위 상위 N
  const table = await computeLeagueTable(dataLeague, SEASON_FROM, seasonTo);
  let targetIds: number[];
  if (teamArg) {
    const t = await prisma.team.findFirst({ where: { league: LEAGUE, name: { contains: teamArg, mode: "insensitive" } }, select: { id: true } });
    if (!t) throw new Error(`팀 못 찾음: ${teamArg}`);
    targetIds = [t.id];
  } else {
    targetIds = table.slice(0, top).map((r) => r.teamId);
  }

  let created = 0;
  for (const teamId of targetIds) {
    try {
    const ctx: TacticalManagerContext = await aggregateTeamSeason({
      league: dataLeague, teamId, from: SEASON_FROM, to: seasonTo, seasonLabel: SEASON_LABEL,
    });
    const slugKey = `manager-${teamSlug(ctx.team.name)}-2526`;

    // 멱등 가드 — 같은 팀 시즌 글 존재 시 skip
    const dup = await prisma.article.findFirst({ where: { type: "TACTICAL", slug: { contains: slugKey } }, select: { id: true, slug: true } });
    if (dup) {
      console.log(`[manager-review] 이미 존재 — skip: ${dup.slug}`);
      continue;
    }

    // 렌더 부가 데이터 — 사진·감독 사진·전술판 코드
    await enrichForRender(ctx);

    const pidMatched = ctx.mostUsedXi.players.filter((p) => p.tsPid).length;
    console.log(`[manager-review] ${ctx.team.nameKo} (${ctx.coach.nameKo}) — ${ctx.record.rank}위, XI ts 매칭 ${pidMatched}/11`);
    if (dryRun) {
      console.log(dataBrief(ctx));
      console.log(`  전술판: /lineup?d=${ctx.lineupCode?.slice(0, 40)}... (${ctx.lineupCode?.length}자)`);
      continue;
    }

    // 1) 웹 리서치 (sonnet + web search)
    const researchNotes = await generateWithWebSearch(
      `${ctx.coach.name} 감독의 ${ctx.team.name} 2025-26 시즌(${promoted ? "잉글랜드 챔피언십, 프리미어리그 승격" : LEAGUE_LABEL[LEAGUE].research}) 전술을 조사하라. ` +
      `시즌 중 전술 변화, 빌드업 구조 특징, 핵심 선수의 역할, 감독의 전술 관련 발언 요지, 부상·영입이 전술에 준 영향을 ` +
      `한국어 불릿 6~10개로 정리하라. 시즌 종료 후 2026 여름 이적시장의 확정 영입·방출이 있으면 다음 시즌 전술 관점 1~2불릿을 더하라. ` +
      `각 불릿은 사실 위주 1~2문장. 웹에서 확인 안 되는 내용은 쓰지 말 것.`,
      { model: MODEL, maxUses: 3, maxTokens: 1500, temperature: 0.3 },
    );

    // 2) 본문 생성
    const content = await generateWithMinLength(buildPrompt(ctx, researchNotes, promoted), {
      system: SYSTEM_PROMPT,
      model: MODEL,
      maxTokens: 4500,
      temperature: 0.6,
      minLength: MIN_LENGTH,
      timeoutMs: 480_000, // sonnet 장문(3000자+)은 기본 180s 초과 — 실측으로 절단·타임아웃 반복
      label: `manager-review:${ctx.team.name}`,
    });
    if (!content) {
      console.warn(`[manager-review] 본문 길이 미달 — skip: ${ctx.team.name}`);
      continue;
    }

    // 3) 저장 — 제목은 본문 H1, slug 는 id 확정 후 갱신 (generate-analysis 패턴)
    const h1 = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
    const title = h1 ?? `${ctx.coach.nameKo}의 ${ctx.team.nameKo} ${SEASON_LABEL} 전술 총정리`;
    const tmpSlug = `tmp-${slugKey}-${Date.now()}`;
    const article = await prisma.article.create({
      data: {
        type: "TACTICAL",
        league: LEAGUE,
        title,
        slug: tmpSlug,
        content,
        status: "DRAFT",
        tacticalContext: JSON.stringify(ctx),
      },
    });
    const slug = `${LEAGUE.toLowerCase()}-${slugKey}-${article.id}`;
    await prisma.article.update({ where: { id: article.id }, data: { slug } });
    console.log(`[manager-review] DRAFT 저장: ${slug} (${content.length}자)`);
    created++;
    } catch (e) {
      // 팀별 격리 — 한 팀 실패가 나머지 생성을 막지 않는다 (1차 실행 실측: 아스널 실패로 전체 중단)
      console.error(`[manager-review] 팀 ${teamId} 실패:`, (e as Error).message?.slice(0, 200));
    }
  }
  console.log(`[manager-review] 완료 — 신규 DRAFT ${created}편`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
