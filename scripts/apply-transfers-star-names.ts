// /transfers 잔존 현역 unnamed 선수 큐레이션 사전 → TheSportsPlayer 보강.
//
// 배경: 몸값(PlayerMarketValue)엔 있으나 TheSports 가 한국어명(language type=5)·라인업 cache 어디에도
//   이름을 안 주는 현역 선수가 18개월 최신성 필터 후 ~140명 잔존(벨링엄 등). player/list 권한 없음 →
//   자동 명명 불가. 팀+나이+몸값으로 "확실히 식별되는" 선수만 수동 큐레이션해 여기 등록.
//
// ⚠️ 데이터 사이트 원칙: 불확실하면 넣지 말 것(틀린 이름 < "선수" placeholder). 값/나이가 소스마다
//   달라 fuzzy 매칭은 위험 — 프로필이 유일하게 특정되는 선수(예: Real Madrid 22세 €180M peak=벨링엄)만.
//
//   dry-run: npx tsx --env-file=.env.local scripts/apply-transfers-star-names.ts
//   apply:   ... --apply
//
// 확장법: STARS 에 { "ts player id": "한국어명" } 추가 후 재실행. createMany(skipDuplicates) 라 멱등.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

// ts player id → 한국어 표시명 (확실 식별만).
const STARS: Record<string, string> = {
  // Real Madrid · 22세 · €140M(peak €180M, 2026-03 갱신). 비니시우스(€150M)·발베르데(€120M)·
  // 호드리구(€50M)·카마빙가(€50M) 는 이미 별도 named. €180M peak 22세 = 벨링엄 외 후보 없음(유일 확실).
  "3glrw7hj71ldqdy": "주드 벨링엄",
  // FootballTransfer "Cruzeiro - MG → Borussia Dortmund 2026-08-11 €12M" — 분데스리가 공식 발표
  // (bundesliga.com 35600): Kauã Prates 17세 LB, €12M(€7M+€5M 옵션), 2026 여름 합류. 이적료·클럽·시점 유일 일치.
  "zp5rzghxde5jq82": "카우앙 프라치스",
  // FootballTransfer "Disqualification → Hamburger SV 2026-11-14" — CAS 도핑(EPO) 4년 징계
  // 2026-11-15 만료(hsv.de 공식) 후 HSV 복귀 계약. 징계만료일+클럽 유일 일치. MV €0(징계 중) 정합.
  "3glrw7hov7eqdyj": "마리오 부슈코비치",
  // FootballTransfer "Red Bull Salzburg → Borussia Dortmund 2026-07-01 €19.5M" — 잘츠부르크 공식 발표
  // (redbullsalzburg.at) + 분데스리가 공식 이적센터(bundesliga.com 37051): 2026 여름 Salzburg→BVB 이적은
  // Joane Gadou(19세 CB, PSG 유스, €19.5M+보너스 €4.5M) 단 1건. 이적료·클럽·시점 유일 일치.
  "l7oqdeh057w0r51": "조안 가두",
  // FootballTransfer "AIK → Brighton Hove Albion 2026-07-01 €28M" — 브라이튼 공식 발표
  // (brightonandhovealbion.com "Albion agree deal to sign Zadok Yohanna"): 18세 나이지리아 RW, AIK 출신
  // 5년 계약. €28M(+보너스 €2M) Allsvenskan 역대 최고액(Wikipedia). 이적료·클럽·시점 유일 일치.
  "n54qllhj691jqvy": "자독 요한나",
  // FootballTransfer "Stade DE Reims → Paris FC 2026-06-30 €25M" — 파리 FC 공식 발표(parisfc.fr) +
  // 랭스 공식(stade-de-reims.com) + Ligue1.com "Zabi la magie": Patrick Zabi 19세 코트디부아르 MF,
  // €25M, 2026-07-01 합류(2026-02-05 발표). 이적료·클럽·시점 유일 일치.
  "4jwq2gh7g2zgm0v": "파트리크 자비",
  // FootballTransfer "Crvena Zvezda → Bayer 04 Leverkusen €5M" — TheSports SERBIA_SL 시즌 player/stat
  // 에서 동일 id 직접 확인(Aleksa Damjanovic) + 분데스리가 공식(bundesliga.com 36020): 17세 ST,
  // €5M+보너스 €3M, 2026-06 발효. 데이터 소스 id 일치 + 공식 발표 이중 확정.
  "1l4rjnhk382em7v": "알렉사 담야노비치",
};

async function main() {
  const ids = Object.keys(STARS);
  // 1) 몸값 데이터에 실재하는 id 인지 + 팀/나이/값 출력(검수용)
  const mvs = await prisma.playerMarketValue.findMany({
    where: { id: { in: ids } },
    select: { id: true, league: true, currentValue: true, age: true },
  });
  const mvMap = new Map(mvs.map((m) => [m.id, m]));
  // 1b) 몸값 없는 id 는 이적 피드(FootballTransfer)로 실재 검증 — 최신 이적 view 의 unnamed 선수
  //   (예: 카우앙 프라치스 — 빅5 합류 전이라 MV 미수집, 이적 레코드만 존재)
  const trs = await prisma.footballTransfer.findMany({
    where: { playerId: { in: ids } },
    orderBy: { transferTime: "desc" },
    select: { playerId: true, fromTeamName: true, toTeamName: true, transferTime: true },
  });
  const trMap = new Map<string, (typeof trs)[number]>();
  for (const t of trs) if (!trMap.has(t.playerId)) trMap.set(t.playerId, t); // 최신 1건
  // 2) 이미 TheSportsPlayer 에 있으면(=이미 named) 건너뜀 — createMany skipDuplicates 가 처리하나 리포트
  const existing = await prisma.theSportsPlayer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const existSet = new Set(existing.map((e) => e.id));

  console.log("=== 큐레이션 검수 ===");
  const toAdd: Array<{ id: string; ko: string }> = [];
  for (const [id, ko] of Object.entries(STARS)) {
    const mv = mvMap.get(id);
    const tr = trMap.get(id);
    const dup = existSet.has(id);
    const info = mv
      ? `€${Math.round((mv.currentValue || 0) / 1e6)}M/${mv.league}/${mv.age}세`
      : tr
        ? `${tr.fromTeamName || "?"}→${tr.toTeamName || "?"} ${tr.transferTime ? new Date(tr.transferTime * 1000).toISOString().slice(0, 10) : ""}`
        : "-";
    const mark = !mv && !tr ? "❌ market·transfer 모두 없음(오타?)" : dup ? "⏭ 이미 TheSportsPlayer 존재" : mv ? "✅ 추가대상" : "✅ 추가대상(transfer 검증)";
    console.log(`  ${ko.padEnd(14)} ${id}  ${info}  ${mark}`);
    if ((mv || tr) && !dup) toAdd.push({ id, ko });
  }
  console.log(`\n추가 대상 ${toAdd.length} / 사전 ${ids.length}`);

  if (!APPLY) { console.log("[DRY-RUN] --apply 로 적용"); await prisma.$disconnect(); return; }

  if (toAdd.length) {
    // createMany(skipDuplicates) 단일 쿼리 — 개별 upsert 루프는 Neon 연결 소진 유발(메모리 참조).
    const res = await prisma.theSportsPlayer.createMany({
      data: toAdd.map((t) => ({ id: t.id, name: t.ko, nameKo: t.ko, sport: "FOOTBALL" })),
      skipDuplicates: true,
    });
    console.log("createMany 추가:", res.count);
  } else {
    console.log("추가할 신규 없음");
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
