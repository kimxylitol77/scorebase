// TheSportsPlayer.name 에 한글이 박힌 축구 선수 행의 영문 풀네임을 되찾아 채운다.
//   원인: apply-thesports-official-korean / apply-transfers-star-names 의 createMany 가
//   { name: ko, nameKo: ko } 로 신규 행을 만들어 영문 원본이 애초에 없었다(2026-06-05·06 배치 3,349행).
//   표시는 nameKo 를 쓰므로 멀쩡하나, 영문을 키로 삼는 audit(위키 langlink 대조·어원별 오음역
//   스캔·ts↔af 매칭)이 이들을 통째로 못 훑는다. 상세는 docs/player-en-name-restore/context-notes.md.
//
//   소스 우선순위: team-squads.json(최신 풀네임) > 라인업 캐시 > TheSports player API(--fetch).
//   nameKo 는 건드리지 않는다 — 표기 교정은 별개 계층(locks > curation > 위키 > OV > DB).
//
//   dry-run: npx tsx --env-file=.env.local scripts/backfill-ts-player-en-name.ts
//   apply:   ... --apply
//   API 보강(whitelist IP = 집/워커 에서만): ... --fetch [--limit=N] --apply
import "../src/lib/env";
import { PrismaClient } from "@prisma/client";
import { enNamesFromSquads, enNamesFromLineups, usableEnName } from "../src/lib/players/en-name-source";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const FETCH = process.argv.includes("--fetch");
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 0);
const PACE_MS = 700; // ts whitelist IP 버스트 = 방화벽 10분 차단
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const hasHangul = (s: string) => /[가-힣]/.test(s);

/** TheSports player/with_stat/list — uuid 단건만 받는다(다중 uuid 는 code 100003 거부). */
async function fetchPlayerName(uuid: string): Promise<string | null> {
  const url = new URL("https://api.thesports.com/v1/football/player/with_stat/list");
  url.searchParams.set("user", process.env.THESPORTS_USER ?? "");
  url.searchParams.set("secret", process.env.THESPORTS_SECRET ?? "");
  url.searchParams.set("uuid", uuid);
  const d = (await (await fetch(url, { signal: AbortSignal.timeout(15000) })).json()) as {
    code: number;
    results?: Array<{ name?: string }>;
  };
  if (d.code !== 0) throw new Error(`code=${d.code}`);
  return usableEnName(d.results?.[0]?.name);
}

async function writeAll(fixes: Array<{ id: string; en: string }>) {
  let done = 0;
  for (let i = 0; i < fixes.length; i += 20) {
    const batch = fixes.slice(i, i + 20);
    await prisma.$transaction(
      batch.map((f) => prisma.theSportsPlayer.update({ where: { id: f.id }, data: { name: f.en } })),
    );
    done += batch.length;
    if (done % 200 === 0 || done === fixes.length) console.log(`  적용 ${done}/${fixes.length}`);
  }
}

async function main() {
  const targets = await prisma.theSportsPlayer.findMany({
    where: { sport: "FOOTBALL" },
    select: { id: true, name: true, nameKo: true },
  });
  const need = targets.filter((t) => hasHangul(t.name));
  console.log(`대상(FOOTBALL, name 에 한글): ${need.length} / 전체 ${targets.length}`);
  if (!need.length) {
    await prisma.$disconnect();
    return;
  }

  const squads = enNamesFromSquads();
  const lineups = await enNamesFromLineups(prisma);
  console.log(`소스: squads ${squads.size} · lineups ${lineups.size}`);

  const fixes: Array<{ id: string; en: string; ko: string | null; src: string }> = [];
  const rest: typeof need = [];
  for (const t of need) {
    const en = squads.get(t.id) ?? lineups.get(t.id) ?? null;
    if (en) fixes.push({ id: t.id, en, ko: t.nameKo, src: squads.has(t.id) ? "squad" : "lineup" });
    else rest.push(t);
  }
  console.log(`로컬 소스 복구 ${fixes.length} · 미해결 ${rest.length}`);

  if (FETCH) {
    const queue = LIMIT > 0 ? rest.slice(0, LIMIT) : rest;
    console.log(`API 조회 ${queue.length}건 (${PACE_MS}ms 페이스 ≈ ${Math.ceil((queue.length * PACE_MS) / 60000)}분)`);
    let ok = 0;
    const failReason = new Map<string, number>();
    for (const [i, t] of queue.entries()) {
      try {
        const en = await fetchPlayerName(t.id);
        if (en) {
          fixes.push({ id: t.id, en, ko: t.nameKo, src: "api" });
          ok++;
        } else {
          failReason.set("영문 없음/한글 응답", (failReason.get("영문 없음/한글 응답") ?? 0) + 1);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        failReason.set(msg, (failReason.get(msg) ?? 0) + 1);
      }
      if ((i + 1) % 100 === 0) console.log(`  조회 ${i + 1}/${queue.length} (성공 ${ok})`);
      await sleep(PACE_MS);
    }
    console.log(`API 복구 ${ok} · 실패 ${queue.length - ok}`, failReason.size ? Object.fromEntries(failReason) : "");
  }

  console.log("\n샘플 20건 (한글 → 영문):");
  for (const f of fixes.slice(0, 20)) console.log(`  ${(f.ko ?? "").padEnd(16)} → ${f.en.padEnd(30)} [${f.src}]`);

  if (!APPLY) {
    console.log(`\n[DRY-RUN] 복구 대상 ${fixes.length}건. --apply 로 적용`);
    await prisma.$disconnect();
    return;
  }
  await writeAll(fixes);
  const [{ left }] = await prisma.$queryRawUnsafe<Array<{ left: number }>>(
    `select count(*)::int left from "TheSportsPlayer" where sport='FOOTBALL' and name ~ '[가-힣]'`,
  );
  console.log(`DONE ${fixes.length}건 적용 · 남은 대상 ${left}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("ERR", e instanceof Error ? e.message : e);
  process.exit(1);
});
