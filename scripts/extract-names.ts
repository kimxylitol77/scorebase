// 사전 미등록 선수명 진단 스크립트.
// 최근 14일 Match 의 homeStarter/awayStarter/lineupHome/lineupAway 에서 영문 선수명을 모아
// toKoreanPlayerName 통과해도 영문 그대로 반환되는(=사전 미등록) 항목을 카운트한다.
//
// 사용:
//   DATABASE_URL=... npx tsx scripts/extract-names.ts
//
// DATABASE_URL 미설정 시 메시지 출력 후 exit 0 (CI/로컬 양쪽 안전).

import { config } from "dotenv";
config({ path: ".env.local" });
config(); // .env fallback

import { toKoreanPlayerName } from "../src/lib/player-names";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("[extract-names] DATABASE_URL 미설정 — skip");
    process.exit(0);
  }

  // 동적 import — DATABASE_URL 없을 때 prisma 클라이언트 초기화 회피
  const { prisma } = await import("../src/lib/db");

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const matches = await prisma.match.findMany({
    where: { startTime: { gte: since } },
    select: {
      league: true,
      homeStarter: true,
      awayStarter: true,
      lineupHome: true,
      lineupAway: true,
    },
  });

  console.log(`[extract-names] 최근 14일 매치 ${matches.length}건 스캔`);

  const counter = new Map<string, { count: number; leagues: Set<string> }>();
  const seen = new Set<string>();

  function extractFromStarter(json: unknown, league: string) {
    if (typeof json !== "string") return;
    try {
      const obj = JSON.parse(json) as { name?: string };
      const name = obj.name?.trim();
      if (name) collect(name, league);
    } catch {
      /* ignore */
    }
  }

  function extractFromLineup(json: unknown, league: string) {
    if (typeof json !== "string") return;
    try {
      const data = JSON.parse(json) as unknown;
      walkForNames(data, league);
    } catch {
      /* ignore */
    }
  }

  function walkForNames(node: unknown, league: string) {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const item of node) walkForNames(item, league);
      return;
    }
    if (typeof node === "object") {
      const obj = node as Record<string, unknown>;
      if (typeof obj.name === "string") collect(obj.name, league);
      if (typeof obj.player === "string") collect(obj.player, league);
      for (const v of Object.values(obj)) {
        if (v && (typeof v === "object" || Array.isArray(v))) walkForNames(v, league);
      }
    }
  }

  function collect(rawName: string, league: string) {
    const trimmed = rawName.trim();
    if (!trimmed) return;
    if (/[가-힣]/.test(trimmed)) return; // 이미 한글 — skip
    if (/[぀-ゟ゠-ヿ]/.test(trimmed)) return; // 카나 — NPB 전용 음역 path
    const ko = toKoreanPlayerName(trimmed);
    if (ko && ko !== trimmed) return; // 매핑 성공
    // 매핑 실패 — 영문 그대로 반환
    const key = trimmed;
    if (!counter.has(key)) counter.set(key, { count: 0, leagues: new Set() });
    const entry = counter.get(key)!;
    entry.count += 1;
    entry.leagues.add(league);
    seen.add(key);
  }

  for (const m of matches) {
    extractFromStarter(m.homeStarter, m.league);
    extractFromStarter(m.awayStarter, m.league);
    extractFromLineup(m.lineupHome, m.league);
    extractFromLineup(m.lineupAway, m.league);
  }

  const sorted = [...counter.entries()].sort((a, b) => b[1].count - a[1].count);
  console.log(`\n[extract-names] 사전 미등록 영문 선수명 ${sorted.length}개 (총 ${seen.size})`);
  console.log("─".repeat(60));
  for (const [name, info] of sorted.slice(0, 100)) {
    const leagues = [...info.leagues].join(",");
    console.log(`  ${info.count.toString().padStart(4)} × ${name}  [${leagues}]`);
  }
  if (sorted.length > 100) {
    console.log(`  ... 그 외 ${sorted.length - 100}개 (상위 100만 표시)`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
