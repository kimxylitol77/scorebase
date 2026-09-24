// LoL 통산·최근폼 사전 — TheSports player/stats·team/stats → data/lol-career.json.
// ts 는 선수·팀마다 6행(match_count 0=통산, 10·20·30·40·50=최근 N경기 폼)을 준다.
// 로컬 전용(ts IP whitelist). 사용: npx tsx --env-file=.env.local scripts/build-lol-career.ts
import "@/lib/env";
import { thesportsGet } from "@/lib/sports/thesports/client";
import { prisma } from "@/lib/db";
import fs from "node:fs";
import rawPlayers from "../data/lol-players.json";
import { LOL_LEAGUES } from "@/lib/sports/sport-leagues";

interface TsPlayerStat {
  player_id: string; match_count: number;
  k: number; d: number; a: number; part: number; win: number; lose: number;
  soilder_pm: number; attack_pm: number; money_pm: number;
  common_heros?: [string, number, number][];
}
interface TsTeamStat {
  team_id: string; match_count: number; win: number; lose: number;
  first_blood_rate: number; first_tower_rate: number;
  five_kills_rate: number; ten_kills_rate: number;
  first_small_dragon_rate: number; first_big_dragon_rate: number;
  kill_p_match: number; die_p_match: number; assist_p_match: number;
  time_p_match: number; money_pm: number; attack_pm: number; soilder_pm: number;
}

/** ts 프록시가 장시간 순회에서 간헐적으로 끊는다 — 페이지 단위 재시도(실측 26페이지쯤 ECONNRESET). */
async function fetchPage<T>(path: string, page: number): Promise<T[] | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await thesportsGet<{ code: number; results?: T[] }>(path, { page });
      return r.results ?? [];
    } catch {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  return null;
}

async function fetchAll<T>(path: string, maxPages: number): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const rows = await fetchPage<T>(path, page);
    if (rows === null) { console.warn(`  ${path} page=${page} 재시도 실패 — 누적 ${out.length}행에서 중단`); break; }
    out.push(...rows);
    if (rows.length < 1000) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  return out;
}

export interface LolCareerLine {
  k: number; d: number; a: number; kda: number; part: number;
  win: number; lose: number; winRate: number;
  csPerMin: number; dmgPerMin: number; goldPerMin: number;
}
export interface LolTeamLine {
  matches: number; win: number; lose: number; winRate: number;
  firstBlood: number; firstTower: number; firstDragon: number; firstBaron: number;
  killsPerMatch: number; deathsPerMatch: number; assistsPerMatch: number;
  avgSeconds: number; goldPerMin: number;
}

const line = (r: TsPlayerStat): LolCareerLine => ({
  k: r.k, d: r.d, a: r.a,
  kda: r.d > 0 ? Number(((r.k + r.a) / r.d).toFixed(2)) : r.k + r.a,
  part: r.part, win: r.win, lose: r.lose,
  winRate: r.win + r.lose > 0 ? Number((r.win / (r.win + r.lose)).toFixed(3)) : 0,
  csPerMin: r.soilder_pm, dmgPerMin: r.attack_pm, goldPerMin: r.money_pm,
});
const teamLine = (r: TsTeamStat): LolTeamLine => ({
  matches: r.match_count, win: r.win, lose: r.lose,
  winRate: r.win + r.lose > 0 ? Number((r.win / (r.win + r.lose)).toFixed(3)) : 0,
  firstBlood: r.first_blood_rate, firstTower: r.first_tower_rate,
  firstDragon: r.first_small_dragon_rate, firstBaron: r.first_big_dragon_rate,
  killsPerMatch: r.kill_p_match, deathsPerMatch: r.die_p_match, assistsPerMatch: r.assist_p_match,
  avgSeconds: r.time_p_match, goldPerMin: r.money_pm,
});

/**
 * 우리 Team.id → ts team id 다리.
 * LCK Team.externalId 는 ts id 가 아니라 자체 번호("1","8")라 그대로는 못 붙는다(실측 LCK 0/10).
 * Match.lolGames 의 세트마다 red/blue 가 {id: ts팀id, name} 을 들고 있어 이름으로 우리 팀과 맞춘다.
 */
async function buildTeamBridge(): Promise<Map<number, string>> {
  const teams = await prisma.team.findMany({
    where: { league: { in: [...LOL_LEAGUES] } },
    select: { id: true, name: true },
  });
  const byName = new Map(teams.map((t) => [t.name.trim().toLowerCase(), t.id]));
  const matches = await prisma.match.findMany({
    where: { league: { in: [...LOL_LEAGUES] }, lolGames: { not: null } },
    select: { lolGames: true },
  });
  const bridge = new Map<number, string>();
  for (const m of matches) {
    let sets: Array<{ red?: { id?: string; name?: string }; blue?: { id?: string; name?: string } }> = [];
    try { sets = (JSON.parse(m.lolGames!) as { sets?: typeof sets }).sets ?? []; } catch { continue; }
    for (const st of sets) {
      for (const side of [st.red, st.blue]) {
        if (!side?.id || !side.name) continue;
        const ourId = byName.get(side.name.trim().toLowerCase());
        if (ourId != null) bridge.set(ourId, side.id);
      }
    }
  }
  return bridge;
}

async function main() {
  const wantPlayers = new Set(Object.keys((rawPlayers as { players: Record<string, unknown> }).players));
  const bridge = await buildTeamBridge();
  const tsToOur = new Map([...bridge].map(([ourId, tsId]) => [tsId, ourId]));

  console.log(`대상: 선수 ${wantPlayers.size}명 · 팀 ${bridge.size}개(경기 기록으로 ts id 연결)`);
  console.log("player/stats 수집…");
  const ps = await fetchAll<TsPlayerStat>("/v1/lol/player/stats/list", 60);
  console.log(`  ${ps.length}행`);
  console.log("team/stats 수집…");
  const ts = await fetchAll<TsTeamStat>("/v1/lol/team/stats/list", 20);
  console.log(`  ${ts.length}행`);

  const players: Record<string, { career?: LolCareerLine & { champs: [string, number, number][] }; form: Record<string, LolCareerLine> }> = {};
  for (const r of ps) {
    if (!wantPlayers.has(r.player_id)) continue;
    const e = players[r.player_id] ?? { form: {} };
    if (r.match_count === 0) e.career = { ...line(r), champs: (r.common_heros ?? []).slice(0, 10) };
    else e.form[String(r.match_count)] = line(r);
    players[r.player_id] = e;
  }
  // 키는 우리 Team.id — 읽는 쪽이 ts id 를 몰라도 되게 한다.
  const teamsOut: Record<string, { career?: LolTeamLine; form: Record<string, LolTeamLine> }> = {};
  for (const r of ts) {
    const ourId = tsToOur.get(r.team_id);
    if (ourId == null) continue;
    const key = String(ourId);
    const e = teamsOut[key] ?? { form: {} };
    if (r.match_count === 0) e.career = teamLine(r);
    else e.form[String(r.match_count)] = teamLine(r);
    teamsOut[key] = e;
  }

  const withCareer = Object.values(players).filter((p) => p.career).length;
  fs.writeFileSync(
    "data/lol-career.json",
    JSON.stringify({ updatedAt: new Date().toISOString(), players, teams: teamsOut }, null, 2),
  );
  console.log(`저장 → data/lol-career.json (선수 ${Object.keys(players).length}명 중 통산 ${withCareer}명 · 팀 ${Object.keys(teamsOut).length}개)`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
