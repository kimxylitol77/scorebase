// 화이트리스트 밖 매체로 발행된 과거 브리핑을 /news 목록에서만 숨긴다.
// category 를 BRIEFING → BRIEFING_LEGACY 로 바꿀 뿐이라 글 URL(/analysis/{id})과 색인은 그대로 살아 있고,
// 되돌리려면 반대로 UPDATE 한 번이면 된다 (REVERT=1).
// 실행: node --env-file=.env.local scripts/hide-nonwhitelist-briefings.mjs [DRY=1|REVERT=1]
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DRY = process.env.DRY === "1";
const REVERT = process.env.REVERT === "1";

// src/jobs/fetch-news-briefing.ts 의 ALLOWED_PUBLISHERS 와 동일해야 한다.
const ALLOWED =
  /^(bbc|sky ?sports?|the ?athletic|the ?new york times|nytimes|the ?guardian|reuters|associated press|espn|mlb\.com|major league baseball|nba\.com|nhl\.com|premier ?league|uefa|fifa|sportsnet|tsn\b|the ?times\b|l'?[eé]quipe|marca|kicker|gazzetta)/i;
// 구단 공식 피드는 promote 를 안 해서 소스명이 고정 라벨이다 — 화이트리스트 검사 대상이 아니다.
const FIXED_LABELS = new Set(["구단 공식", "Premier League", "MLB.com", "NBA.com", "NHL.com"]);

if (REVERT) {
  const r = await prisma.post.updateMany({
    where: { category: "BRIEFING_LEGACY" },
    data: { category: "BRIEFING" },
  });
  console.log(`되돌림: ${r.count}건 → BRIEFING`);
  await prisma.$disconnect();
  process.exit(0);
}

const rows = await prisma.newsBriefing.findMany({
  where: { status: "PUBLISHED", postId: { not: null } },
  select: { postId: true, sourceName: true },
});
const bad = rows.filter((r) => !FIXED_LABELS.has(r.sourceName) && !ALLOWED.test(r.sourceName));
const ids = bad.map((r) => r.postId);

const byName = {};
for (const b of bad) byName[b.sourceName] = (byName[b.sourceName] ?? 0) + 1;
console.log(`발행 ${rows.length}건 중 화이트리스트 밖 ${bad.length}건`);
console.log(
  Object.entries(byName)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([k, v]) => `${k}:${v}`)
    .join(" · "),
);

if (DRY) {
  console.log("DRY — 변경 없음");
} else {
  const r = await prisma.post.updateMany({
    where: { id: { in: ids }, category: "BRIEFING" },
    data: { category: "BRIEFING_LEGACY" },
  });
  console.log(`숨김 적용: ${r.count}건 → BRIEFING_LEGACY`);
  const left = await prisma.post.count({ where: { category: "BRIEFING" } });
  console.log(`/news 목록에 남는 글: ${left}건`);
}
await prisma.$disconnect();
