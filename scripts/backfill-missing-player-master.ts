// PlayerMarketValue 엔 있으나 TheSportsPlayer 에 없는 축구 선수의 영문 마스터를 생성한다.
//   player/with_stat/list(인가) 로 name·logo·position 조회 → create. nameKo 는 후속 음역 cron 이 채움.
//   sync-thesports-players(있는 선수 update)의 보완 — 이쪽은 "없는 선수" create 로 "선수" placeholder 해소.
//   --apply 없으면 dry-run(미명명 수만). 페이스 700ms/콜. 멱등(이미 있으면 대상 제외).
import "../src/lib/env";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const USER = process.env.THESPORTS_USER!;
const SECRET = process.env.THESPORTS_SECRET!;
const APPLY = process.argv.includes("--apply");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPlayer(uuid: string): Promise<{ name?: string; logo?: string; position?: string } | null> {
  const url = new URL("https://api.thesports.com/v1/football/player/with_stat/list");
  url.searchParams.set("user", USER);
  url.searchParams.set("secret", SECRET);
  url.searchParams.set("uuid", uuid);
  const d: { code: number; results?: { name?: string; logo?: string; position?: string }[] } =
    await (await fetch(url, { signal: AbortSignal.timeout(15000) })).json();
  if (d.code !== 0) throw new Error(`code=${d.code}`);
  return d.results?.[0] ?? null;
}

async function main() {
  const pmv = await prisma.playerMarketValue.findMany({ select: { id: true, teamId: true } });
  const existing = new Set(
    (await prisma.theSportsPlayer.findMany({ where: { id: { in: pmv.map((p) => p.id) } }, select: { id: true } })).map((p) => p.id),
  );
  const missing = pmv.filter((p) => !existing.has(p.id));
  console.log(`PlayerMarketValue ${pmv.length} · TheSportsPlayer 보유 ${existing.size} · 미명명(생성 대상) ${missing.length}`);
  if (!APPLY) {
    console.log(`\nDRY-RUN — 생성하려면 --apply. 예상 소요 ~${Math.ceil((missing.length * 0.7) / 60)}분 (700ms/콜)`);
    console.log("샘플 id:", missing.slice(0, 8).map((p) => p.id).join(", "));
    return;
  }

  let created = 0, noName = 0, fail = 0;
  for (let i = 0; i < missing.length; i++) {
    const p = missing[i];
    try {
      const r = await fetchPlayer(p.id);
      if (r?.name) {
        await prisma.theSportsPlayer.create({
          data: { id: p.id, name: r.name, sport: "FOOTBALL", position: r.position || null, photoUrl: r.logo || null, teamId: p.teamId || null },
        });
        created++;
      } else noName++;
    } catch (e) {
      fail++;
      if (fail <= 5) console.log(`  ${p.id} ERR ${(e as Error).message}`);
    }
    if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${missing.length} — 생성 ${created} · 이름없음 ${noName} · 실패 ${fail}`);
    await sleep(700);
  }
  console.log(`\n완료: 생성 ${created} · 이름없음 ${noName} · 실패 ${fail}`);
}
main().catch((e) => console.log("ERR", e.message)).finally(() => prisma.$disconnect());
