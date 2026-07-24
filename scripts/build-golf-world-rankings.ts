// 골프 세계랭킹(남자 OWGR) → data/golf-world-rankings.json
// 공식 OWGR API(apiweb.owgr.com) top100 을 정적 JSON 으로 서빙. 여자(Rolex)는 소스 미확보로 보류.
// 선수 한글명은 기존 사전(data/golf-player-names.json) 재사용 — 없으면 로마자 그대로.
//
// 실행: tsx scripts/build-golf-world-rankings.ts

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const OUT = "data/golf-world-rankings.json";
const NAME_DICT = "data/golf-player-names.json";
const OWGR_URL =
  "https://apiweb.owgr.com/api/owgr/rankings/getRankings?pageSize=100&pageNumber=1&sortString=&countryId=0&regionId=0&format=json";

interface WorldPlayer {
  rank: number;
  isTied: boolean;
  name: string;
  nameKo: string | null;
  country: string;
  code2: string;
  lastWeekRank: number | null;
  pointsAverage: number | null;
}

interface OwgrRow {
  rank?: number;
  isTied?: boolean;
  lastWeekRank?: number;
  pointsAverage?: number;
  player?: {
    firstName?: string;
    lastName?: string;
    fullName?: string;
    country?: { name?: string; code2?: string };
  };
}

async function main() {
  console.log("골프 세계랭킹(남자 OWGR) 수집");
  let json: { rankingsList?: OwgrRow[] } | null = null;
  try {
    const r = await fetch(OWGR_URL, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (r.ok) json = (await r.json()) as { rankingsList?: OwgrRow[] };
    else console.error(`OWGR HTTP ${r.status}`);
  } catch (e) {
    console.error("OWGR fetch 실패:", (e as Error).message);
  }

  const list = json?.rankingsList ?? [];
  if (list.length < 50) {
    console.error(`❌ OWGR 응답 ${list.length}건(<50) — 기존 파일 유지하고 종료.`);
    process.exit(1);
  }

  const names: Record<string, string> = existsSync(resolve(NAME_DICT))
    ? JSON.parse(readFileSync(resolve(NAME_DICT), "utf8"))
    : {};

  const men: WorldPlayer[] = list.map((x) => {
    const p = x.player ?? {};
    const c = p.country ?? {};
    const name = p.fullName ?? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim();
    return {
      rank: x.rank ?? 0,
      isTied: !!x.isTied,
      name,
      nameKo: names[name] ?? null,
      country: c.name ?? "",
      code2: c.code2 ?? "",
      lastWeekRank:
        typeof x.lastWeekRank === "number" && x.lastWeekRank > 0 ? x.lastWeekRank : null,
      pointsAverage:
        typeof x.pointsAverage === "number" ? Math.round(x.pointsAverage * 100) / 100 : null,
    };
  });

  const out = {
    updatedAt: new Date().toISOString(),
    source: "OWGR",
    men,
  };
  writeFileSync(resolve(OUT), JSON.stringify(out, null, 2) + "\n");

  const kr = men.filter((m) => m.code2 === "KR");
  console.log(
    `✅ ${OUT} — 남자 ${men.length}명 (한국 ${kr.length}: ${kr
      .map((m) => `${m.nameKo ?? m.name}(${m.rank})`)
      .join(", ")})`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
