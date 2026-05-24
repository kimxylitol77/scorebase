import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const bots = await p.botHeartbeat.findMany({ orderBy: { lastAt: "desc" } });
const now = Date.now();
console.log("=== 등록된 봇 이름 (DB) ===");
for (const b of bots) {
  const ageMin = Math.round((now - b.lastAt.getTime()) / 60000);
  console.log(`  ${b.name.padEnd(40)} ${ageMin}분 전  notified=${b.notifiedAt ? "Y" : "N"}`);
}
console.log("\n=== 채팅 UI 가 사용하는 BOT_META keys ===");
console.log([
  "mac-mini-match-narrator",
  "mac-mini-endpoint-monitor",
  "mac-mini-live-scores-watcher",
  "mac-mini-data-quality",
  "mac-mini-api-quota",
  "mac-mini-preview-coverage",
  "mac-mini-weekly-player-names",
].join("\n  "));

console.log("\n=== 불일치 ===");
const meta = new Set([
  "mac-mini-match-narrator",
  "mac-mini-endpoint-monitor",
  "mac-mini-live-scores-watcher",
  "mac-mini-data-quality",
  "mac-mini-api-quota",
  "mac-mini-preview-coverage",
  "mac-mini-weekly-player-names",
]);
for (const b of bots) {
  if (!meta.has(b.name)) console.log(`  ⚠️ DB 봇 "${b.name}" 가 BOT_META 에 없음 (채팅 skip)`);
}
await p.$disconnect();
