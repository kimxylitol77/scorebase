// NHL 선수 연봉(cap hit) 스크래퍼 — CapFriendly 후속 CapWages(capwages.com).
//
// ⚠️ Spotrac(구 소스)는 서버 요청을 JS 브라우저 챌린지로 하드 차단("Update Your Browser") → 폐기.
//    CapWages 는 Next.js SSG — 홈에서 buildId 추출 후 팀별 `_next/data/{buildId}/teams/{slug}.json`
//    를 받으면 로스터·시즌별 capHit 을 깔끔한 JSON 으로 준다(차단 없음).
// ⚠️ 팀·사진은 CapWages 미제공분 보강: 팀명 = tricode→ABBR_TO_FULL(DB Team(NHL) 풀네임),
//    사진 = data/nhl-players.json(이름 매칭, nhle 머그샷 URL 에 player id 포함 → 선수 링크).
// ⚠️ 구조 변경 시 깨질 수 있음. job 단 "파싱 0건이면 seed fallback" 가드 필수.

import nhlPlayers from "../../../data/nhl-players.json";

export interface NormalizedSalary {
  rank: number;
  playerName: string;
  teamName: string; // DB Team(NHL) 풀네임 — 표시 시 toKoreanTeamName
  salary: number; // USD (cap hit)
  photoUrl?: string; // nhle.com 머그샷 (URL 에 NHL player id 포함 → 페이지가 선수 링크로 사용)
}

// NHL 시즌 라벨 — 8월 경계(10월 개막). "2026-27" 형식(fetch-league-leaders runNhl 과 통일).
export function nhlSeasonLabel(now: Date): string {
  const y = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

// CapWages tricode → DB Team(NHL) 풀네임. LAK/NJD/SJS/TBL 만 로고 약어와 다름.
const ABBR_TO_FULL: Record<string, string> = {
  ANA: "Anaheim Ducks", BOS: "Boston Bruins", BUF: "Buffalo Sabres", CAR: "Carolina Hurricanes",
  CBJ: "Columbus Blue Jackets", CGY: "Calgary Flames", CHI: "Chicago Blackhawks", COL: "Colorado Avalanche",
  DAL: "Dallas Stars", DET: "Detroit Red Wings", EDM: "Edmonton Oilers", FLA: "Florida Panthers",
  LAK: "Los Angeles Kings", MIN: "Minnesota Wild", MTL: "Montreal Canadiens", NJD: "New Jersey Devils",
  NSH: "Nashville Predators", NYI: "New York Islanders", NYR: "New York Rangers", OTT: "Ottawa Senators",
  PHI: "Philadelphia Flyers", PIT: "Pittsburgh Penguins", SEA: "Seattle Kraken", SJS: "San Jose Sharks",
  STL: "St. Louis Blues", TBL: "Tampa Bay Lightning", TOR: "Toronto Maple Leafs", UTA: "Utah Mammoth",
  VAN: "Vancouver Canucks", VGK: "Vegas Golden Knights", WPG: "Winnipeg Jets", WSH: "Washington Capitals",
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// 이름 정규화 — 액센트 제거 + 소문자. CapWages↔nhl-players.json 표기차 흡수.
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// "Last, First" → "First Last" (CapWages 표기 → nhl-players.json·표시 통일).
function flipName(n: string): string {
  const i = n.indexOf(",");
  return i < 0 ? n.trim() : `${n.slice(i + 1).trim()} ${n.slice(0, i).trim()}`;
}

function moneyToInt(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const n = parseInt(s.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// data/nhl-players.json(id→{name,photo,team abbr}) → 이름→사진 맵.
const photoByName: Map<string, string> = (() => {
  const m = new Map<string, string>();
  const dict = nhlPlayers as Record<string, { name: string; photo: string }>;
  for (const id in dict) {
    const p = dict[id];
    if (p?.name && p.photo) m.set(norm(p.name), p.photo);
  }
  return m;
})();

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json,text/html" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// CapWages 팀 JSON 타입(필요 부분만).
interface CapDetail { season?: string; capHit?: string }
interface CapContract { details?: CapDetail[] }
interface CapPlayer { name?: string; contracts?: CapContract[] }
interface CapTeamJson {
  pageProps?: {
    teamMetadata?: { tricode?: string };
    data?: { roster?: { forwards?: CapPlayer[]; defense?: CapPlayer[]; goalies?: CapPlayer[] } };
  };
}

export async function fetchNhlSalaries(): Promise<NormalizedSalary[]> {
  // 1) 홈 HTML → buildId + 팀 슬러그 32개.
  let html: string;
  try {
    const res = await fetch("https://capwages.com/", {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    html = await res.text();
  } catch {
    return [];
  }
  const buildId = html.match(/"buildId":"([^"]+)"/)?.[1];
  const slugs = [...new Set([...html.matchAll(/\/teams\/([a-z_]+)/g)].map((m) => m[1]))];
  if (!buildId || slugs.length < 20) return []; // 구조 변경 방어

  // 2) 팀별 JSON 병렬 수집(동시 8) → 선수별 {name, tricode, seasonMap}.
  interface Collected { name: string; tricode: string; seasonMap: Record<string, number> }
  const collected: Collected[] = [];
  const seasonCount = new Map<string, number>();
  const CONCURRENCY = 8;
  for (let i = 0; i < slugs.length; i += CONCURRENCY) {
    const batch = slugs.slice(i, i + CONCURRENCY);
    const jsons = await Promise.all(
      batch.map((s) => getJson(`https://capwages.com/_next/data/${buildId}/teams/${s}.json`) as Promise<CapTeamJson | null>),
    );
    for (const j of jsons) {
      const tricode = j?.pageProps?.teamMetadata?.tricode ?? "";
      const roster = j?.pageProps?.data?.roster ?? {};
      for (const grp of [roster.forwards, roster.defense, roster.goalies]) {
        for (const p of grp ?? []) {
          if (!p?.name) continue;
          const seasonMap: Record<string, number> = {};
          for (const c of p.contracts ?? []) {
            for (const d of c.details ?? []) {
              const v = moneyToInt(d.capHit);
              if (d.season && v) {
                seasonMap[d.season] = v;
                seasonCount.set(d.season, (seasonCount.get(d.season) ?? 0) + 1);
              }
            }
          }
          if (Object.keys(seasonMap).length) collected.push({ name: flipName(p.name), tricode, seasonMap });
        }
      }
    }
  }
  if (!collected.length) return [];

  // 3) 현재 시즌 = 로스터 전체에서 최빈 season(오프시즌엔 CapWages 가 아직 직전 시즌을 current 로 노출).
  const currentSeason = [...seasonCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const out: NormalizedSalary[] = [];
  const seen = new Set<string>();
  for (const p of collected) {
    if (seen.has(p.name)) continue; // 중복 로스터(트레이드 등) 방지
    const salary = (currentSeason ? p.seasonMap[currentSeason] : undefined) ?? Object.values(p.seasonMap)[0];
    if (!salary) continue;
    seen.add(p.name);
    out.push({
      rank: 0,
      playerName: p.name,
      teamName: ABBR_TO_FULL[p.tricode] ?? "",
      salary,
      photoUrl: photoByName.get(norm(p.name)),
    });
  }

  out.sort((a, b) => b.salary - a.salary);
  out.forEach((r, i) => (r.rank = i + 1));
  return out;
}
