// 중국 리그투(CHINA_3) 24팀의 api-football team id 를 TeamSourceId 에 backfill.
//
// 배경: /scores 축구 탭은 DB 매치(TheSports) + af 날짜조회 orphan 카드를 합쳐 그리는데,
//       판정(lib/sports/orphan-dedup)이 팀 이름 대조에 기대는 축이 있다. CHINA_3 는 af 가
//       **구 팀명**을 유지해(af "Langfang Glory City" = 실제 Hangzhou Linping Wuyue) 이름이
//       양쪽 다 어긋나는 경기가 나오고, af 팀 매핑이 0건이라 ID 축 판정도 불발 → 같은 경기가
//       카드 두 장으로 떴다(2026-08-16 실측 2건). 중국 하위리그는 연고 이전·개명이 잦아
//       이름 규칙으로는 영구히 해결되지 않으므로 ID 로 못박는다.
//
// 대응 근거: af 팀명은 구명칭이어도 venue.city 는 최신이라, 도시로 우리 Team 과 1:1 대조된다
//       (af 19320 "Shangyu Pterosaur" city=Ganzhou → 우리 "Ganzhou Ruishi"). 24:24 완전 대응.
//
// 사용:
//   npx tsx --env-file=.env.local scripts/backfill-china3-af-teamids.ts          # dry-run
//   npx tsx --env-file=.env.local scripts/backfill-china3-af-teamids.ts --apply  # 실제 upsert
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

// af team id → 우리 Team.id. 주석은 판정 근거(af 표기 → 우리 표기, 근거).
const PAIRS: { af: string; ourId: number; note: string }[] = [
  { af: "5647", ourId: 611775, note: "BIT → Beijing IT (베이징 이공대, city=Beijing)" },
  { af: "5660", ourId: 611778, note: "Hubei Chufeng Heli → Hubei Istar (개명, city=Wuhan)" },
  { af: "5665", ourId: 611780, note: "Jiangxi Liansheng → Jiangxi Lushan (개명, city=Jiujiang)" },
  { af: "5679", ourId: 611769, note: "Qingdao Red Lions (이름 일치)" },
  { af: "17272", ourId: 611785, note: "Yichun Grand Tiger → Wenzhou Professional FC (연고이전, city=Wenzhou)" },
  { af: "19319", ourId: 611771, note: "Nantong Haimen Codion → Haimen Codion" },
  { af: "19320", ourId: 611779, note: "Shangyu Pterosaur → Ganzhou Ruishi (연고이전, city=Ganzhou)" },
  { af: "19321", ourId: 611768, note: "Tai'an Tiankuang (이름 일치)" },
  { af: "20674", ourId: 611766, note: "Xi'an Ronghai → Shanxi Chongde Ronghai (연고이전, city=Taiyuan)" },
  { af: "21328", ourId: 611772, note: "Rizhao Yuqi → Lanzhou Longyuan Athletic (연고이전, city=Lanzhou)" },
  { af: "23132", ourId: 611773, note: "Changchun Xidu (이름 일치)" },
  { af: "23270", ourId: 611781, note: "Langfang Glory City → Hangzhou Linping Wuyue (연고이전, venue=Linping)" },
  { af: "23288", ourId: 611765, note: "Shandong Taishan II → Shandong Taishan B (2군 표기차)" },
  { af: "23289", ourId: 611764, note: "Shanghai Port II → Shanghai Port B (2군 표기차)" },
  { af: "25773", ourId: 611783, note: "Guangdong Mingtu (이름 일치)" },
  { af: "25774", ourId: 611784, note: "Guangzhou Dandelion → Guangzhou Dandelion Alpha" },
  { af: "25775", ourId: 611776, note: "Guizhou Zhucheng → Guizhou Guiyang Athletic (city=Guiyang)" },
  { af: "25779", ourId: 611777, note: "Shenzhen 2028 (이름 일치)" },
  { af: "25839", ourId: 611786, note: "Chengdu Rongcheng II → Chengdu Rongcheng B (2군 표기차)" },
  { af: "25840", ourId: 611787, note: "Wuhan Three Towns II → Wuhan Three Towns B (2군 표기차)" },
  { af: "27619", ourId: 611774, note: "Shanghai Second (이름 일치)" },
  { af: "27620", ourId: 611767, note: "Dalian Kewei (이름 일치)" },
  { af: "27621", ourId: 611770, note: "Dalian Yingbo B (이름 일치)" },
  { af: "27622", ourId: 611782, note: "Xiamen Feilu (이름 일치)" },
];

async function main() {
  const teams = await prisma.team.findMany({
    where: { league: "CHINA_3" },
    select: { id: true, name: true },
  });
  const nameOf = new Map(teams.map((t) => [t.id, t.name]));

  // 우리 Team 이 CHINA_3 에 실재하는지 + 짝이 겹치지 않는지 먼저 확인 — 잘못 넣으면 영구 오염.
  const seenOur = new Set<number>();
  const seenAf = new Set<string>();
  for (const p of PAIRS) {
    if (!nameOf.has(p.ourId)) throw new Error(`ourId ${p.ourId} 가 CHINA_3 Team 에 없음 — ${p.note}`);
    if (seenOur.has(p.ourId)) throw new Error(`ourId ${p.ourId} 중복 지정`);
    if (seenAf.has(p.af)) throw new Error(`af ${p.af} 중복 지정`);
    seenOur.add(p.ourId);
    seenAf.add(p.af);
  }

  let inserted = 0;
  let skipped = 0;
  for (const p of PAIRS) {
    const existing = await prisma.teamSourceId.findUnique({
      where: {
        league_source_externalId: {
          league: "CHINA_3",
          source: "api-football",
          externalId: p.af,
        },
      },
      select: { teamId: true },
    });
    if (existing) {
      // 이미 다른 팀에 물려 있으면 덮어쓰지 않는다 — 영구 저장이라 추정으로 갱신하지 않는다.
      const mark = existing.teamId === p.ourId ? "이미 동일" : `⚠ 다른 팀(${existing.teamId})에 물림`;
      console.log(` skip  af=${p.af} → ${nameOf.get(p.ourId)} | ${mark}`);
      skipped++;
      continue;
    }
    console.log(`${APPLY ? " insert" : " (dry)"} af=${p.af} → ${nameOf.get(p.ourId)} | ${p.note}`);
    if (APPLY) {
      await prisma.teamSourceId.create({
        data: { league: "CHINA_3", source: "api-football", externalId: p.af, teamId: p.ourId },
      });
    }
    inserted++;
  }
  console.log(`\n${APPLY ? "적용" : "dry-run"} — 신규 ${inserted}건 · 건너뜀 ${skipped}건 / 총 ${PAIRS.length}`);
}

main().finally(() => prisma.$disconnect());
