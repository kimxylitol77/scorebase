// NPB 선수 사진 URL 매핑 — npb.jp eng roster + 영문 이름 매칭.
// 흐름:
//   1) DB TheSportsPlayer (sport=NPB, photoUrl null) 추출 — name 영문 ("Atsuki Yuasa")
//   2) npb.jp /bis/eng/teams/rst_{team}.html × 12팀 → npbId + name list ("Yuasa, Atsuki")
//   3) 영문 이름 normalize (정렬 ASCII) 매칭 → ts.name ↔ npbId
//   4) npb.jp /bis/players/{npbId}.html 의 <img players_photo> → photoUrl
//   5) DB upsert
//
// 실행: tsx scripts/build-npb-player-photos.ts

import { PrismaClient } from "@prisma/client";

const TEAMS = ["g", "db", "c", "d", "s", "t", "h", "f", "e", "l", "b", "m"] as const;
const NPB_BASE = "https://npb.jp";
const UA = "Mozilla/5.0";

interface NpbRosterPlayer {
  npbId: string;
  name: string;
  team: string;
}

function normalize(name: string): string {
  return name
    .replace(/[,.]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

async function fetchTeamRoster(team: string): Promise<NpbRosterPlayer[]> {
  try {
    const r = await fetch(`${NPB_BASE}/bis/eng/teams/rst_${team}.html`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return [];
    const html = await r.text();
    const out: NpbRosterPlayer[] = [];
    // <a href="/bis/eng/players/01105138.html">Izumi, Keisuke</a>
    const rx = /<a\s+href="\/bis\/eng\/players\/(\d+)\.html"[^>]*>([^<]+)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(html)) !== null) {
      out.push({ npbId: m[1], name: m[2].trim(), team });
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchPhotoUrl(npbId: string): Promise<string | undefined> {
  try {
    const r = await fetch(`${NPB_BASE}/bis/players/${npbId}.html`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return undefined;
    const html = await r.text();
    const m = html.match(/<img[^>]*src="(https?:\/\/p\.npb\.jp\/players_photo\/[^"]+)"/i);
    return m?.[1];
  } catch {
    return undefined;
  }
}

async function main() {
  // 1) NPB roster 12팀 수집
  console.log(`▶ npb.jp 12팀 roster fetch`);
  const rosterByName = new Map<string, NpbRosterPlayer>();
  for (const team of TEAMS) {
    const players = await fetchTeamRoster(team);
    process.stdout.write(`  ${team}: ${players.length}명  `);
    for (const p of players) {
      rosterByName.set(normalize(p.name), p);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log(`\n총 unique normalize 이름: ${rosterByName.size}`);

  // 2) DB NPB 매핑 대상
  const prisma = new PrismaClient();
  const todo = await prisma.theSportsPlayer.findMany({
    where: { sport: "NPB", photoUrl: null },
    select: { id: true, name: true, nameKo: true },
  });
  console.log(`▶ 처리 대상: ${todo.length}명`);

  let matched = 0;
  let upserted = 0;
  for (let i = 0; i < todo.length; i++) {
    const p = todo[i];
    const key = normalize(p.name);
    const hit = rosterByName.get(key);
    if (!hit) continue;
    matched++;
    const photoUrl = await fetchPhotoUrl(hit.npbId);
    if (!photoUrl) {
      await new Promise((r) => setTimeout(r, 100));
      continue;
    }
    try {
      await prisma.theSportsPlayer.update({
        where: { id: p.id },
        data: { photoUrl },
      });
      upserted++;
      if ((i + 1) % 20 === 0)
        console.log(`  ${i + 1}/${todo.length} matched=${matched} upserted=${upserted} latest: ${p.nameKo}→${hit.npbId}`);
    } catch (e) {
      console.warn(`! upsert fail ${p.id}: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log(`\n✓ 결과: 이름 매칭 ${matched}/${todo.length}, photo upserted ${upserted}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
