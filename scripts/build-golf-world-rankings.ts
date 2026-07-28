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
  /** ESPN 골프 athlete id — 선수 사진용. 검색 미매칭이면 null. */
  espnId: string | null;
}

/** 이름 정규화 — 액센트 제거·소문자 (ESPN 검색 결과 대조용). ø 등 NFD 미분해 글자는 수동 치환. */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/ł/g, "l")
    .replace(/đ/g, "d")
    .replace(/ß/g, "ss")
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 두 이름이 같은 선수로 볼 만한가 — 완전 일치 / 포함 / (성 일치 + 이름 접두 관계: Sam↔Samuel) */
function nameMatches(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const [af, ...ar] = a.split(" ");
  const [bf, ...br] = b.split(" ");
  const al = ar.at(-1) ?? "";
  const bl = br.at(-1) ?? "";
  return al !== "" && al === bl && (af.startsWith(bf) || bf.startsWith(af));
}

/** ESPN PGA 상금 통계(top200)를 이름→id 벌크 맵으로 — 검색 API 가 누락하는 선수(저스틴 토마스 등) 보완. */
async function fetchEspnPgaIdMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const r = await fetch(
      "https://site.web.api.espn.com/apis/common/v3/sports/golf/pga/statistics/byathlete?region=us&lang=en&limit=200&sort=general.amount%3Adesc",
      { headers: { "User-Agent": "Mozilla/5.0" } },
    );
    if (!r.ok) return map;
    const j = (await r.json()) as {
      athletes?: { athlete?: { id?: number | string; displayName?: string } }[];
    };
    for (const a of j.athletes ?? []) {
      if (a.athlete?.id && a.athlete.displayName) map.set(norm(a.athlete.displayName), String(a.athlete.id));
    }
  } catch {
    /* 폴백(검색)으로 진행 */
  }
  return map;
}

/** ESPN 검색으로 골프 선수 id 조회 — uid "s:1100~a:{id}". 이름 불일치·실패는 null. */
async function searchEspnGolfId(name: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(name)}&limit=20`,
      { headers: { "User-Agent": "Mozilla/5.0" } },
    );
    if (!r.ok) return null;
    const j = (await r.json()) as {
      results?: { contents?: { type?: string; displayName?: string; uid?: string; defaultLeagueSlug?: string }[] }[];
    };
    const items = (j.results ?? []).flatMap((g) => g.contents ?? []);
    for (const it of items) {
      if (it.type !== "player") continue;
      const m = it.uid?.match(/^s:1100~a:(\d+)$/);
      if (!m) continue;
      if (nameMatches(norm(it.displayName ?? ""), norm(name))) return m[1];
    }
    return null;
  } catch {
    return null;
  }
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

  // espnId 증분 캐시 — 기존 JSON 에서 이름→id 재사용, 신규 진입자만 ESPN 검색.
  const prevIds: Record<string, string> = {};
  if (existsSync(resolve(OUT))) {
    try {
      const prev = JSON.parse(readFileSync(resolve(OUT), "utf8")) as { men?: WorldPlayer[] };
      for (const m of prev.men ?? []) if (m.espnId) prevIds[m.name] = m.espnId;
    } catch {
      /* 캐시 없이 진행 */
    }
  }

  const bulkIds = await fetchEspnPgaIdMap();
  const bulkFind = (name: string): string | null => {
    const n = norm(name);
    if (bulkIds.has(n)) return bulkIds.get(n)!;
    for (const [k, v] of bulkIds) if (nameMatches(k, n)) return v;
    return null;
  };

  const men: WorldPlayer[] = [];
  let searched = 0;
  for (const x of list) {
    const p = x.player ?? {};
    const c = p.country ?? {};
    const name = p.fullName ?? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim();
    let espnId: string | null = prevIds[name] ?? bulkFind(name);
    if (!espnId) {
      espnId = await searchEspnGolfId(name);
      searched++;
      await new Promise((r) => setTimeout(r, 150));
    }
    men.push({
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
      espnId,
    });
  }
  console.log(`ESPN id 매칭 ${men.filter((m) => m.espnId).length}/${men.length} (신규 검색 ${searched}건)`);

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
