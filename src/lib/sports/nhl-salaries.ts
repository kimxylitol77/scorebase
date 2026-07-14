// NHL 선수 연봉(cap hit) 스크래퍼 — spotrac.com/nhl/rankings. MLB(mlb-salaries.ts)와 동일 구조.
//
// ⚠️ spotrac 메인 랭킹은 .list-group-item div, 선수 링크는 a[href*='/redirect/player/'].
//    NFL 추천 위젯(.widget-list)이 사이드바에 섞이므로 .list-group-item 조상 없는 링크는 제외.
// ⚠️ NHL 행엔 팀 링크가 없고 텍스트("ANA, C")로만 있어 팀·사진은 data/nhl-players.json(이름 매칭)로 보강.
// ⚠️ HTML 스크래핑 → 구조 변경 시 깨질 수 있음. job 단 "파싱 0건이면 기존 유지" 가드 필수.

import * as cheerio from "cheerio";
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

// nhl-players.json 팀 약어 → DB Team(NHL) 풀네임. LAK/NJD/SJS/TBL 만 DB 로고 약어와 다름.
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

// 이름 정규화 — 액센트 제거 + 소문자. spotrac↔nhl-players.json 표기차 흡수.
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// data/nhl-players.json(id→{name,photo,team abbr}) → 이름 매칭용 맵 (사진·팀 보강).
const playerByName: Map<string, { photo: string; team: string }> = (() => {
  const m = new Map<string, { photo: string; team: string }>();
  const dict = nhlPlayers as Record<string, { name: string; photo: string; team: string }>;
  for (const id in dict) {
    const p = dict[id];
    if (p?.name) m.set(norm(p.name), { photo: p.photo, team: p.team });
  }
  return m;
})();

export async function fetchNhlSalaries(): Promise<NormalizedSalary[]> {
  let html: string;
  try {
    const res = await fetch("https://www.spotrac.com/nhl/rankings/player/_/sort/cap_total", {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return [];
    html = await res.text();
  } catch {
    return [];
  }

  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const out: NormalizedSalary[] = [];

  $("a[href*='/redirect/player/']").each((_, a) => {
    const $a = $(a);
    const name = $a.text().trim();
    if (!name || name.length < 3 || /sign in|premium/i.test(name)) return;
    const $row = $a.closest(".list-group-item");
    if (!$row.length || $row.closest(".widget-list").length) return; // NFL 사이드바 위젯 제외
    if (seen.has(name)) return;

    // 금액 — 행 내 첫 $숫자 (cap hit)
    let salaryText = "";
    $row.find("*").each((_, e) => {
      if (salaryText) return;
      const t = $(e).clone().children().remove().end().text().trim();
      if (/^\$[0-9][0-9,]{4,}$/.test(t)) salaryText = t;
    });
    if (!salaryText) return;
    const salary = parseInt(salaryText.replace(/[$,]/g, ""), 10);
    if (!Number.isFinite(salary) || salary < 1) return;

    seen.add(name);
    out.push({ rank: 0, playerName: name, teamName: "", salary });
  });

  out.sort((a, b) => b.salary - a.salary);
  out.forEach((r, i) => (r.rank = i + 1));

  // nhl-players.json 매칭 — 사진(nhle 머그샷) + 팀(약어→풀네임) 보강. 미매칭은 연봉만 유지.
  for (const r of out) {
    const m = playerByName.get(norm(r.playerName));
    if (!m) continue;
    if (m.photo) r.photoUrl = m.photo;
    if (m.team && ABBR_TO_FULL[m.team]) r.teamName = ABBR_TO_FULL[m.team];
  }

  return out;
}
