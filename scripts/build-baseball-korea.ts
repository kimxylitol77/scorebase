// 야구 해외파 한국 선수 명단 빌드 — MLB Stats API 출생국(Republic of Korea) 스캔(메이저+마이너) → data/baseball-korea.json
// 실행: npx tsx --env-file=.env.local scripts/build-baseball-korea.ts  (주간 weekly-static-refresh.sh 에서 호출)
// 성적은 여기 저장하지 않는다 — 페이지가 런타임 캐시로 가져온다(src/lib/sports/baseball-korea.ts).
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "data", "baseball-korea.json");
const SEASON = new Date().getUTCFullYear();
const BIRTH_COUNTRY = "Republic of Korea";
// 레벨 우선순위(높을수록 상위). sportId: 1 MLB · 11 AAA · 12 AA · 13 High-A · 14 Single-A · 16 Rookie
export const LEVELS: Record<number, { label: string; rank: number }> = {
  1: { label: "MLB", rank: 6 },
  11: { label: "AAA", rank: 5 },
  12: { label: "AA", rank: 4 },
  13: { label: "High-A", rank: 3 },
  14: { label: "Single-A", rank: 2 },
  16: { label: "Rookie", rank: 1 },
};
// 출생지 기준 스캔이라 한국 출생 외국 국적이 섞인다 — 이름으로 제외.
const EXCLUDE: Record<number, string> = { 608701: "Rob Refsnyder — 서울 출생, 미국 국적" };
// 한글명 — data/mlb-players.json 에 없는 선수. 표기는 KBO 등록명·언론 통용명.
const NAME_KO: Record<number, string> = {
  678225: "배지환", 808970: "고우석", 673490: "김하성", 808975: "김혜성", 808982: "이정후", 823550: "송성문",
  800231: "조원빈", 805870: "엄형찬", 815794: "장현석", 807149: "심준석", 836688: "문서준", 834605: "김성준",
  829748: "이현승", 806739: "제이든 김",
};

interface ApiPerson {
  id: number; fullName: string; birthCountry?: string; birthDate?: string; currentAge?: number;
  primaryPosition?: { abbreviation?: string; type?: string };
  currentTeam?: { id?: number; name?: string; parentOrgName?: string; parentOrgId?: number };
  batSide?: { code?: string }; pitchHand?: { code?: string }; mlbDebutDate?: string;
}
export interface BaseballKoreaPlayer {
  id: number; nameEn: string; nameKo: string; pos: string | null; posType: string | null; age: number | null; birthDate: string | null;
  bats: string | null; throws: string | null; mlbDebut: string | null;
  /** 현재 소속 팀의 레벨(40인 로스터라도 AAA 에 있으면 AAA) */
  sportId: number; level: string; team: { id: number | null; name: string; parentOrg: string | null; abbr: string | null };
  /** 메이저 40인 로스터 등록 여부 */
  onFortyMan: boolean;
  /** 이 시즌 등록된 모든 레벨(성적 조회용, 상위 레벨 먼저) */
  sportIds: number[];
}
interface ApiTeam { id: number; name: string; abbreviation?: string; parentOrgName?: string; parentOrgId?: number; sport?: { id?: number } }

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { "user-agent": "scorebase-baseball-korea" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return (await r.json()) as T;
}

async function main() {
  const mlbPlayers = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "mlb-players.json"), "utf8")) as Record<string, { ko?: string }>;
  const found = new Map<number, { person: ApiPerson; sportId: number; sportIds: Set<number> }>();
  // 팀 → 레벨·모구단. people 응답의 currentTeam 엔 sport·parentOrg 가 없어 팀 목록으로 푼다.
  const teamMap = new Map<number, { sportId: number; parentOrg: string | null; abbr: string | null }>();
  for (const sportId of Object.keys(LEVELS).map(Number)) {
    const t = await fetchJson<{ teams: ApiTeam[] }>(`https://statsapi.mlb.com/api/v1/teams?sportId=${sportId}&season=${SEASON}`);
    for (const x of t.teams) teamMap.set(x.id, { sportId, parentOrg: x.parentOrgName ?? null, abbr: x.abbreviation ?? null });
  }
  for (const sportId of Object.keys(LEVELS).map(Number)) {
    const d = await fetchJson<{ people: ApiPerson[] }>(`https://statsapi.mlb.com/api/v1/sports/${sportId}/players?season=${SEASON}`);
    const ko = d.people.filter((p) => p.birthCountry === BIRTH_COUNTRY);
    console.log(`sport ${sportId} (${LEVELS[sportId].label}): ${d.people.length}명 중 한국 출생 ${ko.length}`);
    for (const p of ko) {
      const cur = found.get(p.id);
      if (!cur) found.set(p.id, { person: p, sportId, sportIds: new Set([sportId]) });
      else {
        cur.sportIds.add(sportId);
        if (LEVELS[sportId].rank > LEVELS[cur.sportId].rank) { cur.person = p; cur.sportId = sportId; }
      }
    }
  }
  const players: BaseballKoreaPlayer[] = [];
  for (const [id, f] of found) {
    if (EXCLUDE[id]) { console.log(`제외 ${f.person.fullName}: ${EXCLUDE[id]}`); continue; }
    // currentTeam 상세(parentOrg) 는 목록 응답에 없어 개별 조회
    const det = await fetchJson<{ people: ApiPerson[] }>(`https://statsapi.mlb.com/api/v1/people/${id}?hydrate=currentTeam`);
    const p = det.people[0] ?? f.person;
    const nameKo = NAME_KO[id] ?? mlbPlayers[String(id)]?.ko ?? p.fullName;
    if (!NAME_KO[id] && !mlbPlayers[String(id)]?.ko) console.log(`한글명 없음 → 영문 유지: ${p.fullName} (${id})`);
    const tm = p.currentTeam?.id != null ? teamMap.get(p.currentTeam.id) : undefined;
    const curSport = tm?.sportId ?? f.sportId;
    players.push({
      id, nameEn: p.fullName, nameKo,
      pos: p.primaryPosition?.abbreviation ?? null, posType: p.primaryPosition?.type ?? null,
      age: p.currentAge ?? null, birthDate: p.birthDate ?? null,
      bats: p.batSide?.code ?? null, throws: p.pitchHand?.code ?? null, mlbDebut: p.mlbDebutDate ?? null,
      sportId: curSport, level: LEVELS[curSport]?.label ?? String(curSport),
      team: { id: p.currentTeam?.id ?? null, name: p.currentTeam?.name ?? "", parentOrg: tm?.parentOrg ?? null, abbr: tm?.abbr ?? null },
      onFortyMan: f.sportIds.has(1),
      sportIds: [...new Set([...f.sportIds, curSport])].sort((a, b) => (LEVELS[b]?.rank ?? 0) - (LEVELS[a]?.rank ?? 0)),
    });
  }
  players.sort((a, b) => (LEVELS[b.sportId]?.rank ?? 0) - (LEVELS[a.sportId]?.rank ?? 0) || Number(b.onFortyMan) - Number(a.onFortyMan) || a.nameKo.localeCompare(b.nameKo, "ko"));
  if (players.length < 5) throw new Error(`전멸 가드: ${players.length}명 — API 이상 의심, 파일 유지`);
  fs.writeFileSync(OUT, JSON.stringify({ meta: { updatedAt: new Date().toISOString(), season: SEASON, source: "statsapi.mlb.com birthCountry" }, players }, null, 1) + "\n");
  console.log(`저장 ${players.length}명 → ${OUT}`);
  for (const p of players) console.log(`  ${p.level.padEnd(8)}${p.onFortyMan ? "*" : " "} ${p.nameKo} (${p.nameEn}) ${p.pos} ${p.team.name}${p.team.parentOrg ? ` / ${p.team.parentOrg}` : ""}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
