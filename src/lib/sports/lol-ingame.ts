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
  winnerId: string; // 승팀 teamId (red_score > blue_score)
  bans: string[]; // 밴 챔프명 (red+blue)
  players: LolGamePlayer[];
}

export interface LolGamesData {
  sets: LolGameSet[];
}

// 골드차 + 게임 진행도 → red 팀 승리확률. 종료 LoL 세트 187개(econ 15,219포인트, LCK/LEC/LCS/EWC/LPL)로
// 캘리브레이션: P(red) = 1/(1+exp(-0.30·골드리드(k)·(0.5+진행도))). 마지막 포인트 승자 예측 정확도 98%.
// econ.v 는 blue 기준 골드차(음수=blue 열세)라 red 리드는 부호 반전.
export function lolRedWinProb(goldDiffBlue: number, timeSec: number, durationSec: number): number {
  const tf = durationSec > 0 ? Math.min(1, timeSec / durationSec) : Math.min(1, timeSec / 1800);
  const goldLeadK = -goldDiffBlue / 1000;
  return 1 / (1 + Math.exp(-0.3 * goldLeadK * (0.5 + tf)));
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
      winnerId:
        (Number(s.red_score) || 0) > (Number(s.blue_score) || 0)
          ? String(s.red_team_id)
          : String(s.blue_team_id),
      bans: [...((s.red_ban as string[]) ?? []), ...((s.blue_ban as string[]) ?? [])]
        .map((id) => heroMap.get(id)?.name)
        .filter((n): n is string => !!n),
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

// ── 경기 MVP 선정 ──────────────────────────────────────────────
// 시리즈 전체(전 세트) 집계로 단 한 명. KDA + 킬관여율 중심, 승리팀 가중.

export interface LolMvp {
  playerId: string;
  name: string;
  teamId: string;
  teamName: string;
  teamShort: string;
  onWinner: boolean; // 시리즈 승리팀 소속
  games: number; // 출전 세트 수
  k: number;
  d: number;
  a: number;
  cs: number;
  gold: number;
  kda: number; // (K+A)/max(1,D)
  kp: number; // 킬 관여율 0..1
  champ: string; // 대표(최다 출전) 챔피언
  cimg: string;
}

export function computeLolMvp(games: LolGamesData): LolMvp | null {
  const sets = games?.sets ?? [];
  if (!sets.length) return null;

  // 1. 시리즈 승리팀 — 세트 승 최다.
  const setWins = new Map<string, number>();
  for (const s of sets) setWins.set(s.winnerId, (setWins.get(s.winnerId) ?? 0) + 1);
  let seriesWinnerId = "";
  let bestWins = -1;
  for (const [tid, w] of setWins) if (w > bestWins) ((bestWins = w), (seriesWinnerId = tid));

  // 팀 id → 이름/약자
  const teamInfo = new Map<string, { name: string; short: string }>();
  for (const s of sets) {
    teamInfo.set(s.red.id, { name: s.red.name, short: s.red.short });
    teamInfo.set(s.blue.id, { name: s.blue.name, short: s.blue.short });
  }

  // 2. 선수 누적 (출전 세트의 팀 총킬도 합산 → 킬관여율).
  type Agg = {
    name: string;
    teamId: string;
    games: number;
    k: number;
    d: number;
    a: number;
    cs: number;
    gold: number;
    teamKills: number;
    champ: Map<string, { n: number; cimg: string }>;
  };
  const agg = new Map<string, Agg>();
  for (const s of sets) {
    for (const p of s.players) {
      const teamKills = p.teamId === s.red.id ? s.redKills : s.blueKills;
      const cur =
        agg.get(p.playerId) ??
        {
          name: p.name,
          teamId: p.teamId,
          games: 0,
          k: 0,
          d: 0,
          a: 0,
          cs: 0,
          gold: 0,
          teamKills: 0,
          champ: new Map<string, { n: number; cimg: string }>(),
        };
      cur.games += 1;
      cur.k += p.k;
      cur.d += p.d;
      cur.a += p.a;
      cur.cs += p.cs;
      cur.gold += p.gold;
      cur.teamKills += teamKills;
      cur.teamId = p.teamId;
      cur.name = p.name;
      const c = cur.champ.get(p.champ) ?? { n: 0, cimg: p.cimg };
      c.n += 1;
      if (p.cimg) c.cimg = p.cimg;
      cur.champ.set(p.champ, c);
      agg.set(p.playerId, cur);
    }
  }

  // 3. 점수 — KDA + 킬관여율×5 + 골드/CS 보정, 승리팀 ×1.6.
  let best: LolMvp | null = null;
  let bestScore = -Infinity;
  for (const [playerId, a] of agg) {
    const ka = a.k + a.a;
    const kda = ka / Math.max(1, a.d);
    const kp = ka / Math.max(1, a.teamKills);
    const onWinner = a.teamId === seriesWinnerId;
    const score = (kda + kp * 5 + a.gold / 100000 + a.cs / 3000) * (onWinner ? 1.6 : 1);
    if (score <= bestScore) continue;
    bestScore = score;
    // 대표 챔프 = 최다 출전.
    let champ = "";
    let cimg = "";
    let cn = -1;
    for (const [name, v] of a.champ) if (v.n > cn) ((cn = v.n), (champ = name), (cimg = v.cimg));
    const ti = teamInfo.get(a.teamId);
    best = {
      playerId,
      name: a.name,
      teamId: a.teamId,
      teamName: ti?.name ?? a.teamId,
      teamShort: ti?.short ?? "?",
      onWinner,
      games: a.games,
      k: a.k,
      d: a.d,
      a: a.a,
      cs: a.cs,
      gold: a.gold,
      kda: Math.round(kda * 100) / 100,
      kp: Math.round(kp * 100) / 100,
      champ,
      cimg,
    };
  }
  return best;
}
