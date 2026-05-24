// 데모/개발용 시드 데이터.
// 실행: npx tsx scripts/seed-demo.ts
//
// API 키 없이도 화면을 확인할 수 있도록 가짜 경기/기사 1건씩 넣어둠.

import "../src/lib/env";
import { prisma } from "../src/lib/db";

async function main() {
  console.log("[seed] 데모 데이터 입력 시작");

  const home = await prisma.team.upsert({
    where: { league_externalId: { league: "EPL", externalId: "demo-liverpool" } },
    update: {},
    create: {
      league: "EPL",
      externalId: "demo-liverpool",
      name: "리버풀",
      shortName: "LIV",
    },
  });
  const away = await prisma.team.upsert({
    where: { league_externalId: { league: "EPL", externalId: "demo-mancity" } },
    update: {},
    create: {
      league: "EPL",
      externalId: "demo-mancity",
      name: "맨체스터 시티",
      shortName: "MCI",
    },
  });

  const match = await prisma.match.upsert({
    where: {
      league_externalId: { league: "EPL", externalId: "demo-match-001" },
    },
    update: {},
    create: {
      league: "EPL",
      externalId: "demo-match-001",
      homeTeamId: home.id,
      awayTeamId: away.id,
      homeScore: 2,
      awayScore: 1,
      status: "FINISHED",
      startTime: new Date(Date.now() - 12 * 60 * 60 * 1000),
    },
  });

  await prisma.article.upsert({
    where: { slug: "demo-liverpool-mancity-recap" },
    update: {},
    create: {
      matchId: match.id,
      type: "RECAP",
      league: "EPL",
      title: "리버풀, 맨시티에 2-1 역전승... 살라 결승골",
      slug: "demo-liverpool-mancity-recap",
      content: `# 리버풀, 맨시티에 2-1 역전승... 살라 결승골

**리버풀이 안필드에서 맨체스터 시티를 2-1로 꺾으며 빅매치 승리를 챙겼다.**

## 전반전

전반 23분, 맨시티가 빠른 역습 끝에 선제골을 뽑아냈다. 리버풀은 압박을 받으며 흐름을 내줬고, 전반 종료까지 0-1 리드를 허용한 채 라커룸으로 향했다.

## 후반전

후반 10분 디아스의 동점골이 터지며 분위기가 반전됐다. 안필드의 함성을 타고 리버풀은 공격 강도를 끌어올렸고, 후반 32분 살라가 페널티 박스 안에서 침착한 마무리로 역전골을 만들어냈다.

## 정리

이번 승리로 리버풀은 선두 추격에 다시 불을 지폈다. 다음 라운드 원정 일정에서의 흐름이 시즌 후반 우승 경쟁의 분기점이 될 전망이다.`,
      status: "PENDING_REVIEW",
    },
  });

  await prisma.article.upsert({
    where: { slug: "demo-published-sample" },
    update: {},
    create: {
      type: "ANALYSIS",
      league: "NBA",
      title: "NBA 2025-26 시즌 동부 컨퍼런스 중반 점검",
      slug: "demo-published-sample",
      content: `# NBA 2025-26 시즌 동부 컨퍼런스 중반 점검

**시즌 절반을 지난 시점, 동부 컨퍼런스 판도는 예상보다 빠르게 굳어지고 있다.**

## 상위권의 안정세

상위 4개 팀의 격차가 점차 벌어지며 플레이오프 시드 경쟁이 마무리 국면에 접어들었다. 부상자 복귀 여부가 남은 변수로 꼽힌다.

## 다크호스의 등장

중하위권에서는 신예들의 활약이 두드러지면서, 매년 반복되던 4~6위권의 풍경이 달라지고 있다.

## 정리

남은 일정에서 강팀들 간 직접 대결이 잇따라 예정돼 있어, 시드 결정의 결정타가 될 가능성이 크다.`,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });

  const counts = await prisma.article.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  console.log("[seed] 완료. 현재 글 상태별 개수:");
  for (const c of counts) console.log(`  ${c.status}: ${c._count._all}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
