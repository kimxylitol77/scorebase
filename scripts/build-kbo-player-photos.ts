// KBO 선수 사진 URL 매핑 — koreabaseball.com 공식 API.
// 흐름:
//   1) DB TheSportsPlayer (sport=KBO, nameKo not null, photoUrl null) 추출
//   2) KBO /ws/Controls.asmx/GetSearchPlayer 로 nameKo 검색 → P_ID
//   3) 동명이인 — 현역 (now) 중 첫 hit 사용
//   4) photo URL: https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/person/middle/{year}/{P_ID}.jpg
//   5) HEAD 200 OK 확인 후 DB upsert
//
// 실행: tsx scripts/build-kbo-player-photos.ts

import { PrismaClient } from "@prisma/client";

const YEAR = 2026;
const PHOTO_BASE = "https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/person/middle";
const SEARCH_URL = "https://www.koreabaseball.com/ws/Controls.asmx/GetSearchPlayer";

interface KboPlayer {
  P_ID: number;
  P_NM: string;
  BACK_NO: string;
  POS_NO: string;
  T_ID: string;
  T_NM: string;
  P_TYPE: string;
  P_LINK: string;
}

interface KboSearchResp {
  now?: KboPlayer[];
  retire?: KboPlayer[];
  code?: string;
}

async function searchKbo(name: string): Promise<KboPlayer | null> {
  try {
    const body = new URLSearchParams();
    body.append("name", name);
    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": "Mozilla/5.0",
        Referer: "https://www.koreabaseball.com/Player/Search.aspx",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: body.toString(),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as KboSearchResp;
    if (data.code !== "100") return null;
    const now = data.now ?? [];
    // 정확 일치 우선
    const exact = now.find((p) => p.P_NM === name);
    if (exact) return exact;
    // contains 또는 첫 hit
    return now[0] ?? null;
  } catch {
    return null;
  }
}

async function verifyPhotoUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  const prisma = new PrismaClient();
  const todo = await prisma.theSportsPlayer.findMany({
    where: { sport: "KBO", nameKo: { not: null }, photoUrl: null },
    select: { id: true, name: true, nameKo: true },
  });
  console.log(`▶ 처리 대상: ${todo.length}명`);

  let hitCount = 0;
  let upserted = 0;
  for (let i = 0; i < todo.length; i++) {
    const p = todo[i];
    const ko = p.nameKo!;
    const hit = await searchKbo(ko);
    if (!hit) {
      console.log(`  ${i + 1}/${todo.length} ${ko}: search miss`);
      await new Promise((r) => setTimeout(r, 100));
      continue;
    }
    hitCount++;
    const url = `${PHOTO_BASE}/${YEAR}/${hit.P_ID}.jpg`;
    const ok = await verifyPhotoUrl(url);
    if (!ok) {
      console.log(`  ${i + 1}/${todo.length} ${ko} P_ID=${hit.P_ID}: photo HEAD 실패`);
      await new Promise((r) => setTimeout(r, 100));
      continue;
    }
    try {
      await prisma.theSportsPlayer.update({
        where: { id: p.id },
        data: { photoUrl: url },
      });
      upserted++;
      if ((i + 1) % 10 === 0)
        console.log(`  ${i + 1}/${todo.length} hit=${hitCount} upserted=${upserted} latest: ${ko}→${hit.P_NM} (${hit.T_NM})`);
    } catch (e) {
      console.warn(`! upsert fail ${p.id}: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`\n✓ 결과: 검색 hit ${hitCount}/${todo.length}, photo upserted ${upserted}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
