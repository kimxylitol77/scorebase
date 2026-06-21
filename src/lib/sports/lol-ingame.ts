// LoL 인게임(세트별 스코어보드·골드추이) 조립 — TheSports raw → DB 저장용 JSON. 백필·워커 공용 순수 변환.
// ⚠️ ts 인게임 endpoint 는 IP whitelist(thesportsGet)이라 raw fetch 는 로컬/워커에서만. 이 모듈은 변환만(네트워크 X).

export interface LolItem {
  n: string; // 아이템명
  l: string; // 아이콘 URL
}

export interface LolTeamRef {
  id: string; // ts team id
  name: string; // 한글명
  short: string; // 약자
}

export interface LolGamePlayer {
  playerId: string; // ts player id — 선수 페이지/랭킹 연결 키
  teamId: string; // 세트 red/blue 판별용 (set.red.id / set.blue.id 와 비교)
  name: string; // 선수 닉네임
  champ: string; // 챔피언명
  cimg: string; // 챔피언 아이콘 URL
  k: number;
  d: number;
  a: number;
  cs: number;
  gold: number;
  lvl: number;
  items: LolItem[];
}

export interface LolGameSet {
  box: number; // 세트 번호 (1부터)
  durationSec: number;
  red: LolTeamRef;
  blue: LolTeamRef;
  redKills: number;
  blueKills: number;
  redTower: number;
  blueTower: number;
  redDragon: number;
  blueDragon: number;
  econ: { t: number; v: number }[]; // t=경과 초, v=blue팀 기준 골드차(음수=blue 열세)
  players: LolGamePlayer[];
}

export interface LolGamesData {
  sets: LolGameSet[];
}

type TeamInfo = { name: string; short: string };

function teamRef(id: string, teamMap: Map<string, TeamInfo>): LolTeamRef {
  const t = teamMap.get(id);
  return { id, name: t?.name ?? id, short: t?.short ?? "?" };
}

// TheSports raw(세트·선수보드 + 사전 Map) → match_id 별 LolGamesData. 순수 변환.
export function buildLolGames(
  rawSets: Array<Record<string, unknown>>,
  rawPlayers: Array<Record<string, unknown>>,
  heroMap: Map<string, { name: string; logo: string }>,
  eqMap: Map<string, { name: string; logo: string }>,
  nameMap: Map<string, string>,
  teamMap: Map<string, TeamInfo>,
): Map<string, LolGamesData> {
  const playersBySet = new Map<string, Array<Record<string, unknown>>>();
  for (const p of rawPlayers) {
    const sid = String(p.match_single_id);
    const arr = playersBySet.get(sid) ?? [];
    arr.push(p);
    playersBySet.set(sid, arr);
  }

  const setsByMatch = new Map<string, LolGameSet[]>();
  for (const s of rawSets) {
    const sid = String(s.id);
    const sp = (playersBySet.get(sid) ?? []).map((p): LolGamePlayer => {
      const h = heroMap.get(String(p.hero_id));
      const items = ((p.hero_equipment as string[]) ?? [])
        .map((i) => eqMap.get(i))
        .filter((e): e is { name: string; logo: string } => !!e)
        .map((e) => ({ n: e.name, l: e.logo }));
      return {
        playerId: String(p.player_id),
        teamId: String(p.team_id),
        name: nameMap.get(String(p.player_id)) ?? "?",
        champ: h?.name ?? "?",
        cimg: h?.logo ?? "",
        k: Number(p.kill) || 0,
        d: Number(p.die) || 0,
        a: Number(p.assists) || 0,
        cs: Number(p.soldiers) || 0,
        gold: Number(p.money) || 0,
        lvl: Number(p.hero_level) || 0,
        items,
      };
    });
    const set: LolGameSet = {
      box: Number(s.box_num) || 0,
      durationSec: Number(s.time_length) || 0,
      red: teamRef(String(s.red_team_id), teamMap),
      blue: teamRef(String(s.blue_team_id), teamMap),
      redKills: Number(s.red_kills) || 0,
      blueKills: Number(s.blue_kills) || 0,
      redTower: Number(s.red_tower) || 0,
      blueTower: Number(s.blue_tower) || 0,
      redDragon: (Number(s.red_small_dragons) || 0) + (Number(s.red_big_dragons) || 0),
      blueDragon: (Number(s.blue_small_dragons) || 0) + (Number(s.blue_big_dragons) || 0),
      econ: ((s.economy_lines as string[]) ?? []).map((x) => {
        const [t, v] = String(x).split(":");
        return { t: Number(t) || 0, v: Number(v) || 0 };
      }),
      players: sp,
    };
    const mid = String(s.match_id);
    const arr = setsByMatch.get(mid) ?? [];
    arr.push(set);
    setsByMatch.set(mid, arr);
  }

  const out = new Map<string, LolGamesData>();
  for (const [mid, arr] of setsByMatch) {
    arr.sort((a, b) => a.box - b.box);
    out.set(mid, { sets: arr });
  }
  return out;
}
