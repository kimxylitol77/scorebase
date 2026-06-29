// LoL 리그순위 백필 — TheSports table/list → data/lol-standings*.json. 로컬 전용(ts IP whitelist).
//   인자 없음        → LCK(="LOL"). data/lol-standings.json (lolGames 통계 탭과 연동, dbId 조인).
//   --league=LEC|LCS → 해외 리그. data/lol-standings-{LEAGUE}.json (순위 + 팀별 로스터 nested).
//                       해외는 매치 미수집이라 로스터(사진·포지션·본명)를 player/list 로 직접 채운다.
// 사용: npx tsx scripts/build-lol-standings.ts [--league=LEC]
import "@/lib/env";
import { thesportsGet } from "@/lib/sports/thesports/client";
import { TS_LOL_TEAMS } from "@/lib/sports/lol-thesports";
import { prisma } from "@/lib/db";
import fs from "fs";

const LCK = "l7oqd9kb6y6m510"; // LCK 2026 본선 tournament

// 해외 리그 → 가장 최근 정규 split tournament uuid (2026 시즌). 시즌 갱신 시 _explore 재발굴.
const FOREIGN_TOURNAMENTS: Record<string, string> = {
  LEC: "4wyrnxyt8ggm86p", // LEC Spring 2026
  LCS: "l5erg5ef300m8k0", // LCS Spring 2026
};

// LPL — split 마다 part_stage(그룹)로 나뉘어 그룹별 순위가 1부터 재시작 → 단일표 부정확.
//   현재 split tournament uuid (시즌/스플릿 갱신 시 tournament/list 에서 "LPL Split N 2026" 재발굴).
const LPL_TOURNAMENT = "23xmvxjtov6rg8n"; // LPL Split 2 2026

// LPL 팀 한글명 (abbr 키 — uuid 보다 안정적). 로고·영문명은 team/list 자동.
const LPL_KO: Record<string, string> = {
  BLG: "빌리빌리 게이밍",
  JDG: "JD 게이밍",
  TES: "탑 e스포츠",
  AL: "애니원스 레전드",
  NIP: "닌자 인 파자마스",
  WBG: "웨이보 게이밍",
  IG: "인빅터스 게이밍",
  WE: "팀 WE",
  LNG: "LNG e스포츠",
  TT: "썬더토크 게이밍",
  EDG: "에드워드 게이밍",
  LGD: "LGD 게이밍",
  UP: "울트라 프라임",
  OMG: "OMG",
};

// 해외 팀 한글명 (ts team_id → 한국 통용 표기). 로고·영문명은 team/list 에서 자동.
const FOREIGN_KO: Record<string, string> = {
  // LEC
  "6ypq3e3u09epmd7": "팀 바이탈리티",
  "318q6g8to50vro9": "카르민 코프",
  ednm926hknxzryo: "G2 e스포츠",
  "1l4rjevu6o0km7v": "무비스타 코이",
  n54qleou2l33mvy: "나투스 빈케레",
  x7lm797bkl0lr2w: "자이언트엑스",
  l5erg5efox4ym8k: "프나틱",
  "965mk6zt7dvkq1g": "SK 게이밍",
  y39mp8xu3xexqoj: "시프터스",
  l5erg5efo92lm8k: "팀 헤레틱스",
  // LCS
  zp5rz5pfjv49r82: "클라우드9",
  l5erg5efoxdym8k: "리옹",
  y39mp8xu3g6yqoj: "팀 리퀴드",
  "2y8m4exu3yv5ql0": "플라이퀘스트",
  y0or59wblvd9mwz: "센티넬스",
  "4jwq2eku48xxq0v": "쇼피파이 리벨리온",
  l7oqd9kbn5v0m51: "디스가이즈드",
  "4wyrnxyt8p60m86": "디그니타스",
};

async function g(path: string, params: Record<string, string | number>): Promise<any> {
  try {
    return await thesportsGet(path, params);
  } catch (e) {
    return { err: (e as Error).message };
  }
}

// tournament/table/list 순회 → 특정 tournament 행 수집
async function fetchTableRows(tid: string): Promise<any[]> {
  const rows: any[] = [];
  for (let pg = 1; pg <= 12; pg++) {
    const r: any = await g("/v1/lol/tournament/table/list", { page: pg });
    const rs: any[] = r.results ?? [];
    if (!rs.length) break;
    rows.push(...rs.filter((x: any) => x.tournament_id === tid));
  }
  return rows;
}

// stage 별 그룹 → 정규시즌(팀 최다·경기 최다) stage 선택 후 팀별 1행
function pickStandings(rows: any[]): any[] {
  const byStage = new Map<string, any[]>();
  for (const r of rows) {
    const arr = byStage.get(r.stage_id) ?? [];
    arr.push(r);
    byStage.set(r.stage_id, arr);
  }
  let best: { rows: any[]; teams: number; played: number } | null = null;
  for (const [, srows] of byStage) {
    const teams = new Set(srows.map((r) => r.team_id)).size;
    const played = srows.reduce((s, r) => s + (Number(r.win) || 0) + (Number(r.lose) || 0), 0);
    if (!best || teams > best.teams || (teams === best.teams && played > best.played)) {
      best = { rows: srows, teams, played };
    }
  }
  if (!best) return [];
  const seen = new Set<string>();
  return best.rows
    .filter((r) => {
      if (seen.has(r.team_id)) return false;
      seen.add(r.team_id);
      return true;
    })
    .sort((a, b) => (Number(a.position) || 99) - (Number(b.position) || 99));
}

// ── LCK(기존) — dbId 조인, 로스터는 lolGames 집계가 담당하므로 미포함 ──
async function buildLck() {
  const lckRows = await fetchTableRows(LCK);
  console.log(`LCK table 행: ${lckRows.length}`);
  const ranked = pickStandings(lckRows);
  if (!ranked.length) {
    console.log("정규 stage 못 찾음");
    return;
  }
  const standings = ranked.map((r, i) => {
    const t = TS_LOL_TEAMS[r.team_id];
    return {
      rank: Number(r.position) || i + 1,
      teamId: r.team_id,
      name: t?.name ?? r.team_id,
      short: t?.short ?? "?",
      logo: t?.logo ?? "",
      win: Number(r.win) || 0,
      lose: Number(r.lose) || 0,
    };
  });
  const dbTeams = await prisma.team.findMany({
    where: { name: { in: standings.map((s) => s.name) } },
    select: { id: true, name: true },
  });
  const dbIdByName = new Map(dbTeams.map((t) => [t.name, t.id]));
  const withDb = standings.map((s) => ({ ...s, dbId: dbIdByName.get(s.name) ?? null }));
  fs.writeFileSync(
    "data/lol-standings.json",
    JSON.stringify({ league: "LOL", name: "LCK", updatedAt: new Date().toISOString(), standings: withDb }, null, 2),
  );
  console.log(`저장 ${withDb.length}팀 → data/lol-standings.json`);
  for (const s of withDb) console.log(`  ${s.rank}. ${s.short} ${s.name} ${s.win}-${s.lose} dbId=${s.dbId}`);
}

// player/list 전체 순회 → 타겟 팀 team_id 별 로스터 (사진·포지션·본명)
async function fetchRosters(teamIds: Set<string>): Promise<Map<string, any[]>> {
  const byTeam = new Map<string, any[]>();
  for (let pg = 1; pg <= 15; pg++) {
    const r: any = await g("/v1/lol/player/list", { page: pg });
    const rs: any[] = r.results ?? [];
    if (!rs.length) break;
    for (const p of rs) {
      if (teamIds.has(p.team_id)) {
        const arr = byTeam.get(p.team_id) ?? [];
        arr.push({
          playerId: p.id,
          name: p.name,
          realName: p.real_name || "",
          photo: p.logo || "",
          position: p.position ?? null,
        });
        byTeam.set(p.team_id, arr);
      }
    }
  }
  // 포지션 순(탑3·정글4·미드2·원딜1·서폿5)
  const order: Record<number, number> = { 3: 0, 4: 1, 2: 2, 1: 3, 5: 4 };
  for (const arr of byTeam.values()) {
    arr.sort((a, b) => (order[a.position] ?? 9) - (order[b.position] ?? 9));
  }
  return byTeam;
}

// ── 해외 리그(LEC/LCS) — 로고 자동, 한글명 매핑, 로스터 nested ──
async function buildForeign(league: string) {
  const tid = FOREIGN_TOURNAMENTS[league];
  if (!tid) {
    console.error(`알 수 없는 리그: ${league}`);
    process.exit(1);
  }
  const ranked = pickStandings(await fetchTableRows(tid));
  console.log(`${league} 순위 행: ${ranked.length}`);
  if (!ranked.length) return;

  const teamIds = new Set<string>(ranked.map((r) => r.team_id));
  const rosters = await fetchRosters(teamIds);

  // 팀 메타 (team/list?uuid) — 영문명·로고
  const teamMeta = new Map<string, any>();
  for (const id of teamIds) {
    const r: any = await g("/v1/lol/team/list", { uuid: id });
    teamMeta.set(id, r.results?.[0] ?? null);
  }

  const standings = ranked.map((r, i) => {
    const t = teamMeta.get(r.team_id);
    return {
      rank: Number(r.position) || i + 1,
      teamId: r.team_id,
      name: FOREIGN_KO[r.team_id] ?? t?.name ?? r.team_id,
      short: t?.abbr || "",
      logo: t?.logo ?? "",
      win: Number(r.win) || 0,
      lose: Number(r.lose) || 0,
      roster: rosters.get(r.team_id) ?? [],
    };
  });

  const out = `data/lol-standings-${league}.json`;
  fs.writeFileSync(
    out,
    JSON.stringify({ league, name: league, updatedAt: new Date().toISOString(), standings }, null, 2),
  );
  console.log(`저장 ${standings.length}팀 → ${out}`);
  for (const s of standings) console.log(`  ${s.rank}. ${(s.short || "?").padEnd(5)} ${s.name} ${s.win}-${s.lose} 로스터=${s.roster.length}`);
}

// 특정 tournament 의 table 행만 (그룹/part_stage 보존). 해외 fetchTableRows 와 동일하나 stage 필터 안 함.
async function fetchTournamentRows(tid: string): Promise<any[]> {
  const rows: any[] = [];
  for (let pg = 1; pg <= 15; pg++) {
    const r: any = await g("/v1/lol/tournament/table/list", { page: pg });
    const rs: any[] = r.results ?? [];
    if (!rs.length) break;
    rows.push(...rs.filter((x: any) => x.tournament_id === tid));
  }
  return rows;
}

// ── LPL — part_stage(그룹)별 분리 표. 그룹마다 position 이 1부터라 합치지 않는다 ──
async function buildLpl() {
  const rows = await fetchTournamentRows(LPL_TOURNAMENT);
  console.log(`LPL table 행: ${rows.length}`);
  if (!rows.length) return;

  // part_stage 별 그룹화 (등장 순서 유지)
  const byPart = new Map<string, any[]>();
  for (const r of rows) {
    const arr = byPart.get(r.part_stage_id) ?? [];
    arr.push(r);
    byPart.set(r.part_stage_id, arr);
  }

  const teamIds = new Set<string>(rows.map((r) => r.team_id));
  const rosters = await fetchRosters(teamIds);
  const teamMeta = new Map<string, any>();
  for (const id of teamIds) {
    const r: any = await g("/v1/lol/team/list", { uuid: id });
    teamMeta.set(id, r.results?.[0] ?? null);
  }

  // 그룹은 팀 수 많은 순(주력 그룹 먼저) → A·B·C 라벨
  const groupsRaw = [...byPart.entries()].sort((a, b) => b[1].length - a[1].length);
  const groups = groupsRaw.map(([, prows], gi) => {
    const standings = prows
      .sort((a, b) => (Number(a.position) || 99) - (Number(b.position) || 99))
      .map((r, i) => {
        const t = teamMeta.get(r.team_id);
        const abbr = t?.abbr || "";
        return {
          rank: Number(r.position) || i + 1,
          teamId: r.team_id,
          name: LPL_KO[abbr] ?? t?.name ?? r.team_id,
          short: abbr || "?",
          logo: t?.logo ?? "",
          win: Number(r.win) || 0,
          lose: Number(r.lose) || 0,
          roster: rosters.get(r.team_id) ?? [],
        };
      });
    return { name: `그룹 ${String.fromCharCode(65 + gi)}`, standings };
  });

  const out = "data/lol-standings-LPL.json";
  fs.writeFileSync(
    out,
    JSON.stringify({ league: "LPL", name: "LPL", updatedAt: new Date().toISOString(), groups }, null, 2),
  );
  console.log(`저장 ${groups.length}그룹 → ${out}`);
  for (const grp of groups) {
    console.log(`  [${grp.name}] ${grp.standings.length}팀`);
    for (const s of grp.standings) console.log(`    ${s.rank}. ${s.short.padEnd(5)} ${s.name} ${s.win}-${s.lose} 로스터=${s.roster.length}`);
  }
}

(async () => {
  const arg = process.argv.find((a) => a.startsWith("--league="));
  const league = arg ? arg.split("=")[1].toUpperCase() : "LOL";
  if (league === "LOL") await buildLck();
  else if (league === "LPL") await buildLpl();
  else await buildForeign(league);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
