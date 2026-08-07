// data/nba-players.json 에 TheSports basketball 프로필 병합 — 생일·출생지·경력연수·연봉·드래프트·학교.
// ESPN 로스터 기반 현역 NBA 선수에 TheSports player/list(전세계)를 이름 매칭으로 보강.
// TheSports 는 통계·매치 endpoint 가 권한 없음(player/list·team/list 만 인가) → 프로필만.
// 실행: npx tsx --env-file=.env.local scripts/enrich-nba-players-thesports.ts

import { readFileSync, writeFileSync } from "fs";

const OUT = "data/nba-players.json";
const USER = process.env.THESPORTS_USER ?? "";
const SECRET = process.env.THESPORTS_SECRET ?? "";
const BASE = "https://api.thesports.com/v1/basketball/player/list";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 이름 정규화 — nba-players.ts·build-nba-players.ts 와 동일 정책.
function normKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'']/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface TsPlayer {
  id: string;
  name: string;
  birthday?: number;
  city?: string;
  school?: string;
  drafted?: string;
  league_career_age?: number;
  salary?: number;
  height?: number; // cm
  weight?: number; // kg
  position?: string; // 세부 포지션 (SG/PF 등 — ESPN pos 는 G/F 코스)
  shirt_number?: number;
}

/** player/list 전체 page 순회 → normKey(name) → ts 선수. results < 1000 이면 마지막 page. */
async function collectTsPlayers(): Promise<Map<string, TsPlayer>> {
  const map = new Map<string, TsPlayer>();
  for (let page = 1; page <= 300; page++) {
    let res: TsPlayer[] = [];
    try {
      const r = await fetch(`${BASE}?user=${USER}&secret=${SECRET}&page=${page}`);
      const d = (await r.json()) as { results?: TsPlayer[] };
      res = d.results ?? [];
    } catch (e) {
      console.warn(`  page ${page} 실패:`, (e as Error).message);
      await sleep(1000);
      continue;
    }
    if (!res.length) break;
    for (const p of res) if (p.name) map.set(normKey(p.name), p);
    if (page % 10 === 0) console.log(`  page ${page}: 누적 ${map.size}명`);
    if (res.length < 1000) {
      console.log(`  마지막 page ${page} (results ${res.length})`);
      break;
    }
    await sleep(250);
  }
  return map;
}

(async () => {
  const index = JSON.parse(readFileSync(OUT, "utf8")) as Record<string, Record<string, unknown>>;
  const total = Object.keys(index).length;
  console.log(`nba-players.json: ${total}명`);

  const ts = await collectTsPlayers();
  console.log(`TheSports basketball: ${ts.size}명 수집`);

  let matched = 0, withSalary = 0, withBirth = 0, withCity = 0;
  for (const key of Object.keys(index)) {
    const p = ts.get(key);
    if (!p) continue;
    index[key].tsId = p.id;
    if (p.birthday) { index[key].birthday = p.birthday; withBirth++; }
    if (p.city) { index[key].city = p.city; withCity++; }
    if (p.league_career_age) index[key].careerAge = p.league_career_age;
    if (p.salary) { index[key].salary = p.salary; withSalary++; }
    if (p.drafted) index[key].drafted = p.drafted;
    if (p.school) index[key].school = p.school;
    if (p.height) index[key].heightCm = p.height;
    if (p.weight) index[key].weightKg = p.weight;
    if (p.position) index[key].tsPos = p.position; // SG/PF 등 세부 — ESPN pos(G/F) 보다 구체적
    if (index[key].number == null && p.shirt_number) index[key].number = p.shirt_number;
    matched++;
  }
  writeFileSync(OUT, JSON.stringify(index));
  console.log(`\n매칭 ${matched}/${total} | 생일 ${withBirth} · 출생지 ${withCity} · 연봉 ${withSalary}`);
})().catch((e) => { console.error("ERR", e); process.exit(1); });
