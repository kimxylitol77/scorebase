// 야구 팀/선수 시즌 누적 성적 fetch — 매일 1회 cron.
// 경기 전 분석 섹션(① 팀 시즌 성적 비교, ② 타자 전력)의 데이터 소스.
//
// 데이터 소스 (2026-06-02 실측 검증):
//   - MLB: statsapi.mlb.com /teams/stats (팀) + /teams/{id}/roster hydrate (선수)
//   - KBO: koreabaseball.com /Record/Team/* (팀) + /Record/Player/HitterBasic/* (선수)
//   - NPB: npb.jp/bis/{Y}/stats/{tmb,tmp,bat}_{c,p}.html (팀 타격/투구 + 선수)
//
// 저장:
//   - BaseballTeamSeasonStats  : (league, season, teamName) — avg/ops/hr/sb/runs/era/whip/W-L
//   - BaseballPlayerSeasonStats: (league, season, teamName, playerName) — avg/hits/rbi/ops/hr
// teamName = toKoreanTeamName 정규화 한글명 (매치 페이지가 같은 정규화로 join).
//
// 리그별 try/catch 격리 — 스크랩 실패(사이트 구조 변경 등)해도 다른 리그/기존 페이지 무영향.

import "@/lib/env";
import axios from "axios";
import * as cheerio from "cheerio";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import {
  fetchKboRecordTableForTeam,
  KBO_TEAM_CODES,
} from "@/lib/sports/kbo-official";
import { toKoreanPlayerName } from "@/lib/player-names";
import { npbPlayerToKorean } from "@/lib/sports/npb-player-names";

/* ============================================================
 * 공통 타입 + upsert
 * ==========================================================*/

interface TeamStatsInput {
  league: string;
  season: string;
  teamName: string;
  teamNameEn?: string;
  externalId?: string;
  games?: number;
  wins?: number;
  losses?: number;
  draws?: number;
  avg?: number | null;
  ops?: number | null;
  homeRuns?: number | null;
  stolenBases?: number | null;
  runs?: number | null;
  era?: number | null;
  whip?: number | null;
}

interface PlayerStatsInput {
  league: string;
  season: string;
  teamName: string;
  playerName: string;
  playerNameEn?: string;
  externalId?: string;
  avg?: number | null;
  hits?: number | null;
  rbi?: number | null;
  ops?: number | null;
  homeRuns?: number | null;
  games?: number | null;
}

async function upsertTeam(d: TeamStatsInput) {
  await prisma.baseballTeamSeasonStats.upsert({
    where: {
      league_season_teamName: {
        league: d.league,
        season: d.season,
        teamName: d.teamName,
      },
    },
    update: {
      teamNameEn: d.teamNameEn,
      externalId: d.externalId,
      games: d.games ?? 0,
      wins: d.wins ?? 0,
      losses: d.losses ?? 0,
      draws: d.draws ?? 0,
      avg: d.avg ?? null,
      ops: d.ops ?? null,
      homeRuns: d.homeRuns ?? null,
      stolenBases: d.stolenBases ?? null,
      runs: d.runs ?? null,
      era: d.era ?? null,
      whip: d.whip ?? null,
      fetchedAt: new Date(),
    },
    create: {
      league: d.league,
      season: d.season,
      teamName: d.teamName,
      teamNameEn: d.teamNameEn,
      externalId: d.externalId,
      games: d.games ?? 0,
      wins: d.wins ?? 0,
      losses: d.losses ?? 0,
      draws: d.draws ?? 0,
      avg: d.avg ?? null,
      ops: d.ops ?? null,
      homeRuns: d.homeRuns ?? null,
      stolenBases: d.stolenBases ?? null,
      runs: d.runs ?? null,
      era: d.era ?? null,
      whip: d.whip ?? null,
    },
  });
}

async function upsertPlayer(d: PlayerStatsInput) {
  await prisma.baseballPlayerSeasonStats.upsert({
    where: {
      league_season_teamName_playerName: {
        league: d.league,
        season: d.season,
        teamName: d.teamName,
        playerName: d.playerName,
      },
    },
    update: {
      playerNameEn: d.playerNameEn,
      externalId: d.externalId,
      avg: d.avg ?? null,
      hits: d.hits ?? null,
      rbi: d.rbi ?? null,
      ops: d.ops ?? null,
      homeRuns: d.homeRuns ?? null,
      games: d.games ?? null,
      fetchedAt: new Date(),
    },
    create: {
      league: d.league,
      season: d.season,
      teamName: d.teamName,
      playerName: d.playerName,
      playerNameEn: d.playerNameEn,
      externalId: d.externalId,
      avg: d.avg ?? null,
      hits: d.hits ?? null,
      rbi: d.rbi ?? null,
      ops: d.ops ?? null,
      homeRuns: d.homeRuns ?? null,
      games: d.games ?? null,
    },
  });
}

/** 같은 (league, season) 에서 이번 실행이 갱신하지 않은(= fetchedAt 이 오래된) stale row 정리.
 *  upsert 가 create/update 모두 fetchedAt=now 로 갱신하므로 runStart 이전 fetchedAt = 이번에 안 건드린 row.
 *  teamName 이 바뀐 orphan(약어→한글 등)·시즌 중 이탈 선수까지 안전하게 제거. */
async function clearStaleByTime(league: string, season: string, before: Date) {
  await prisma.baseballTeamSeasonStats.deleteMany({
    where: { league, season, fetchedAt: { lt: before } },
  });
  await prisma.baseballPlayerSeasonStats.deleteMany({
    where: { league, season, fetchedAt: { lt: before } },
  });
}

const flt = (v: unknown): number | null => {
  if (v == null) return null;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};
const int = (v: unknown): number | null => {
  if (v == null) return null;
  const n = parseInt(String(v).replace(/[, ]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};

/* ============================================================
 * MLB — MLB Stats API
 * ==========================================================*/

interface MlbSplit {
  team?: { id?: number; name?: string };
  stat?: Record<string, unknown>;
}

async function runMlb(season: string) {
  const summary = { teams: 0, players: 0 };
  const runStart = new Date();

  // 1) 팀 시즌 타격 + 투구 (1콜, 30팀)
  const teamRes = await fetch(
    `https://statsapi.mlb.com/api/v1/teams/stats?stats=season&group=hitting,pitching&season=${season}&sportId=1&gameType=R`,
    { cache: "no-store" },
  );
  if (!teamRes.ok) throw new Error(`MLB team stats HTTP ${teamRes.status}`);
  const teamData = (await teamRes.json()) as {
    stats?: Array<{ group?: { displayName?: string }; splits?: MlbSplit[] }>;
  };
  const hitting = teamData.stats?.find((s) => s.group?.displayName === "hitting")?.splits ?? [];
  const pitching = teamData.stats?.find((s) => s.group?.displayName === "pitching")?.splits ?? [];
  const pitByTeam = new Map<number, MlbSplit>();
  for (const sp of pitching) if (sp.team?.id) pitByTeam.set(sp.team.id, sp);

  // teamId → 한글팀명 (선수 upsert 때 재사용)
  const teamNameById = new Map<number, string>();

  for (const sp of hitting) {
    const tid = sp.team?.id;
    const nameEn = sp.team?.name ?? "";
    if (!tid || !nameEn) continue;
    const teamName = toKoreanTeamName(nameEn) || nameEn;
    teamNameById.set(tid, teamName);
    const h = sp.stat ?? {};
    const p = pitByTeam.get(tid)?.stat ?? {};
    await upsertTeam({
      league: "MLB",
      season,
      teamName,
      teamNameEn: nameEn,
      externalId: String(tid),
      games: int(p.gamesPlayed ?? h.gamesPlayed) ?? 0,
      wins: int(p.wins) ?? 0,
      losses: int(p.losses) ?? 0,
      avg: flt(h.avg),
      ops: flt(h.ops),
      homeRuns: int(h.homeRuns),
      stolenBases: int(h.stolenBases),
      runs: int(h.runs),
      era: flt(p.era),
      whip: flt(p.whip),
    });    summary.teams++;
  }

  // 2) 팀별 로스터 + 선수 시즌 타격 (30콜)
  for (const [tid, teamName] of teamNameById) {
    try {
      const r = await fetch(
        `https://statsapi.mlb.com/api/v1/teams/${tid}/roster?rosterType=active&hydrate=person(stats(type=season,sportId=1,season=${season},group=hitting))`,
        { cache: "no-store" },
      );
      if (!r.ok) continue;
      const data = (await r.json()) as {
        roster?: Array<{
          person?: {
            id?: number;
            fullName?: string;
            stats?: Array<{ splits?: Array<{ stat?: Record<string, unknown> }> }>;
          };
        }>;
      };
      for (const e of data.roster ?? []) {
        const person = e.person;
        const st = person?.stats?.[0]?.splits?.[0]?.stat;
        if (!person?.fullName || !st) continue;
        const ab = int(st.atBats) ?? 0;
        if (ab <= 0) continue; // 타석 없는 선수(투수 등) 제외
        const nameKo = toKoreanPlayerName(person.fullName) || person.fullName;
        await upsertPlayer({
          league: "MLB",
          season,
          teamName,
          playerName: nameKo,
          playerNameEn: person.fullName,
          externalId: person.id ? String(person.id) : undefined,
          avg: flt(st.avg),
          hits: int(st.hits),
          rbi: int(st.rbi),
          ops: flt(st.ops),
          homeRuns: int(st.homeRuns),
          games: int(st.gamesPlayed),
        });        summary.players++;
      }
    } catch (err) {
      console.warn(`[bb-season/mlb] roster ${tid}`, (err as Error).message);
    }
    await new Promise((res) => setTimeout(res, 120)); // burst 회피
  }

  await clearStaleByTime("MLB", season, runStart);
  return summary;
}

/* ============================================================
 * KBO — koreabaseball.com 스크랩
 * ==========================================================*/

interface KboRow {
  cells: Record<string, string>;
  playerId: string | null;
}

/** KBO 기록 표 파싱 — header(th) 텍스트를 key 로 cells 맵 구성. anchor playerId 추출. */
async function fetchKboTable(url: string): Promise<KboRow[]> {
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) return [];
  const $ = cheerio.load(await r.text());
  const table = $("table").filter((_, t) => $(t).find("tr").length > 3).first();
  if (table.length === 0) return [];
  const headers: string[] = [];
  table.find("tr").first().find("th").each((_, th) => { headers.push($(th).text().trim()); });
  const rows: KboRow[] = [];
  table.find("tr").slice(1).each((_, tr) => {
    const $tr = $(tr);
    const tds = $tr.find("td").map((_, td) => $(td).text().trim()).get();
    if (tds.length < 3) return;
    const cells: Record<string, string> = {};
    for (let i = 0; i < headers.length && i < tds.length; i++) cells[headers[i]] = tds[i];
    const href = $tr.find("a[href*='playerId=']").first().attr("href") ?? "";
    const m = href.match(/playerId=(\d+)/);
    rows.push({ cells, playerId: m ? m[1] : null });
  });
  return rows;
}

async function runKbo(season: string) {
  const summary = { teams: 0, players: 0 };
  const runStart = new Date();

  // --- 팀: 타자 Basic1(AVG/HR/R/G) + Basic2(OPS) + 투수 Basic1(ERA/W/L/WHIP) + 러너(SB)
  const [tHit1, tHit2, tPit, tRun] = await Promise.all([
    fetchKboTable("https://www.koreabaseball.com/Record/Team/Hitter/Basic1.aspx"),
    fetchKboTable("https://www.koreabaseball.com/Record/Team/Hitter/Basic2.aspx"),
    fetchKboTable("https://www.koreabaseball.com/Record/Team/Pitcher/Basic1.aspx"),
    fetchKboTable("https://www.koreabaseball.com/Record/Team/Runner/Basic.aspx").catch(() => []),
  ]);
  const byTeam = (rows: KboRow[]) => {
    const m = new Map<string, Record<string, string>>();
    for (const row of rows) {
      const t = row.cells["팀명"];
      if (t) m.set(t, row.cells);
    }
    return m;
  };
  const hit2 = byTeam(tHit2);
  const pit = byTeam(tPit);
  const run = byTeam(tRun);
  for (const row of tHit1) {
    const rawTeam = row.cells["팀명"];
    // 합계/리그평균 등 비-팀 row 제외 (팀명 셀이 숫자뿐인 경우 등)
    if (!rawTeam || !/[가-힣A-Za-z]/.test(rawTeam)) continue;
    const teamName = toKoreanTeamName(rawTeam) || rawTeam;
    const h2 = hit2.get(rawTeam) ?? {};
    const p = pit.get(rawTeam) ?? {};
    const rn = run.get(rawTeam) ?? {};
    await upsertTeam({
      league: "KBO",
      season,
      teamName,
      teamNameEn: rawTeam,
      games: int(row.cells["G"]) ?? 0,
      wins: int(p["W"]) ?? 0,
      losses: int(p["L"]) ?? 0,
      avg: flt(row.cells["AVG"]),
      ops: flt(h2["OPS"]),
      homeRuns: int(row.cells["HR"]),
      stolenBases: int(rn["SB"]),
      runs: int(row.cells["R"]),
      era: flt(p["ERA"]),
      whip: flt(p["WHIP"]),
    });    summary.teams++;
  }

  // --- 선수: HitterBasic Basic1(AVG/H/RBI/HR/팀명) + Basic2(OPS) — 팀명별 그룹
  // 팀 선택 POST 순회로 전 타자 수집 (GET 단독=규정타석 상위 30 제한). 실패 시 기존 GET fallback.
  let pHit1: KboRow[] = [];
  let pHit2: KboRow[] = [];
  for (const code of KBO_TEAM_CODES) {
    try {
      pHit1.push(
        ...(await fetchKboRecordTableForTeam("/Record/Player/HitterBasic/Basic1.aspx", code, season)),
      );
      pHit2.push(
        ...(await fetchKboRecordTableForTeam("/Record/Player/HitterBasic/Basic2.aspx", code, season)),
      );
    } catch (e) {
      console.warn(`[season-stats/KBO] team=${code} 타자 POST 실패:`, (e as Error).message);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (pHit1.length < 30) {
    console.warn(`[season-stats/KBO] 팀별 수집 ${pHit1.length}명 — 단일 페이지 fallback`);
    [pHit1, pHit2] = await Promise.all([
      fetchKboTable("https://www.koreabaseball.com/Record/Player/HitterBasic/Basic1.aspx"),
      fetchKboTable("https://www.koreabaseball.com/Record/Player/HitterBasic/Basic2.aspx"),
    ]);
  }
  const ops2 = new Map<string, string>(); // 선수명+팀 → OPS
  for (const row of pHit2) {
    const key = `${row.cells["선수명"]}|${row.cells["팀명"]}`;
    if (row.cells["OPS"]) ops2.set(key, row.cells["OPS"]);
  }
  for (const row of pHit1) {
    const name = row.cells["선수명"];
    const rawTeam = row.cells["팀명"];
    if (!name || !rawTeam) continue;
    const teamName = toKoreanTeamName(rawTeam) || rawTeam;
    await upsertPlayer({
      league: "KBO",
      season,
      teamName,
      playerName: name,
      externalId: row.playerId ?? undefined,
      avg: flt(row.cells["AVG"]),
      hits: int(row.cells["H"]),
      rbi: int(row.cells["RBI"]),
      ops: flt(ops2.get(`${name}|${rawTeam}`)),
      homeRuns: int(row.cells["HR"]),
      games: int(row.cells["G"]),
    });    summary.players++;
  }

  await clearStaleByTime("KBO", season, runStart);
  return summary;
}

/* ============================================================
 * NPB — npb.jp 스크랩 (센트럴 + 퍼시픽)
 * ==========================================================*/

// 팀 페이지 'チーム' 셀(풀네임/약칭) → 한국명. 부분 일치로 resolve.
const NPB_TEAM_JP: Array<[string, string]> = [
  ["読売", "요미우리"], ["巨人", "요미우리"],
  ["阪神", "한신"],
  ["ＤｅＮＡ", "요코하마"], ["DeNA", "요코하마"], ["横浜", "요코하마"],
  ["広島", "히로시마"],
  ["中日", "주니치"],
  ["ヤクルト", "야쿠르트"],
  ["ソフトバンク", "소프트뱅크"],
  ["日本ハム", "닛폰햄"], ["日本ハ", "닛폰햄"],
  ["ロッテ", "롯데"],
  ["オリックス", "오릭스"],
  ["楽天", "라쿠텐"],
  ["西武", "세이부"],
];
function npbTeamToKorean(raw: string): string {
  for (const [jp, ko] of NPB_TEAM_JP) if (raw.includes(jp)) return ko;
  return toKoreanTeamName(raw) || raw;
}

// 선수 페이지의 "이름(약어)" 셀 약어 → 한국명 (exact). 팀 페이지 풀네임과 별개.
const NPB_TEAM_ABBR: Record<string, string> = {
  "神": "한신", "巨": "요미우리", "デ": "요코하마", "Ｄｅ": "요코하마", "De": "요코하마",
  "広": "히로시마", "中": "주니치", "ヤ": "야쿠르트", "ソ": "소프트뱅크",
  "日": "닛폰햄", "ロ": "롯데", "オ": "오릭스", "楽": "라쿠텐", "西": "세이부",
};
function npbAbbrToKorean(abbr: string): string {
  const a = abbr.trim();
  return NPB_TEAM_ABBR[a] ?? npbTeamToKorean(a);
}

interface NpbTable {
  headers: string[];
  rows: string[][];
}
async function fetchNpbTable(url: string): Promise<NpbTable> {
  const res = await axios.get<string>(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    timeout: 15000,
    responseType: "text",
  });
  const $ = cheerio.load(res.data);
  const table = $("table").filter((_, el) => $(el).find("tr").length > 3).first();
  if (table.length === 0) return { headers: [], rows: [] };
  const headers: string[] = [];
  table.find("tr").first().find("th").each((_, th) => { headers.push($(th).text().trim()); });
  const rows: string[][] = [];
  table.find("tr").slice(1).each((_, tr) => {
    const tds = $(tr).find("td").map((_, td) => $(td).text().trim()).get();
    if (tds.length >= 3) rows.push(tds);
  });
  return { headers, rows };
}
const col = (headers: string[], ...names: string[]): number => {
  for (const n of names) {
    const i = headers.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
};

async function runNpb(season: string) {
  const summary = { teams: 0, players: 0 };
  const runStart = new Date();

  // --- 팀 타격 + 투구 (C/P 각각)
  for (const lg of ["c", "p"] as const) {
    const bat = await fetchNpbTable(`https://npb.jp/bis/${season}/stats/tmb_${lg}.html`);
    const pit = await fetchNpbTable(`https://npb.jp/bis/${season}/stats/tmp_${lg}.html`);
    const bi = {
      team: col(bat.headers, "チーム"), avg: col(bat.headers, "打率"),
      h: col(bat.headers, "安打"), hr: col(bat.headers, "本塁打"),
      sb: col(bat.headers, "盗塁"), runs: col(bat.headers, "得点"),
      slg: col(bat.headers, "長打率"), obp: col(bat.headers, "出塁率"),
    };
    const pitByTeam = new Map<string, string[]>();
    const pti = {
      team: col(pit.headers, "チーム"), era: col(pit.headers, "防御率"),
      w: col(pit.headers, "勝利"), l: col(pit.headers, "敗北"),
      ip: col(pit.headers, "投球回"), h: col(pit.headers, "安打"), bb: col(pit.headers, "四球"),
    };
    for (const r of pit.rows) if (pti.team >= 0) pitByTeam.set(r[pti.team], r);
    for (const r of bat.rows) {
      const rawTeam = bi.team >= 0 ? r[bi.team] : "";
      if (!rawTeam) continue;
      const teamName = npbTeamToKorean(rawTeam);
      const p = pitByTeam.get(rawTeam) ?? [];
      const slg = bi.slg >= 0 ? flt(r[bi.slg]) : null;
      const obp = bi.obp >= 0 ? flt(r[bi.obp]) : null;
      const ops = slg != null && obp != null ? Number((slg + obp).toFixed(3)) : null;
      const ip = pti.ip >= 0 ? flt(p[pti.ip]) : null;
      const ph = pti.h >= 0 ? int(p[pti.h]) : null;
      const pbb = pti.bb >= 0 ? int(p[pti.bb]) : null;
      const whip = ip && ip > 0 && ph != null && pbb != null
        ? Number(((ph + pbb) / ip).toFixed(2)) : null;
      await upsertTeam({
        league: "NPB",
        season,
        teamName,
        teamNameEn: rawTeam,
        avg: bi.avg >= 0 ? flt(r[bi.avg]) : null,
        ops,
        homeRuns: bi.hr >= 0 ? int(r[bi.hr]) : null,
        stolenBases: bi.sb >= 0 ? int(r[bi.sb]) : null,
        runs: bi.runs >= 0 ? int(r[bi.runs]) : null,
        era: pti.era >= 0 ? flt(p[pti.era]) : null,
        wins: (pti.w >= 0 ? int(p[pti.w]) : 0) ?? 0,
        losses: (pti.l >= 0 ? int(p[pti.l]) : 0) ?? 0,
        whip,
      });      summary.teams++;
    }

    // --- 선수 타격 (bat_{c,p}) — 선수명 셀에 "이름(팀약자)" 형태
    const batP = await fetchNpbTable(`https://npb.jp/bis/${season}/stats/bat_${lg}.html`);
    const pi = {
      name: col(batP.headers, "選手"), avg: col(batP.headers, "打率"),
      h: col(batP.headers, "安打"), hr: col(batP.headers, "本塁打"),
      rbi: col(batP.headers, "打点"), g: col(batP.headers, "試合"),
      slg: col(batP.headers, "長打率"), obp: col(batP.headers, "出塁率"),
    };
    for (const r of batP.rows) {
      if (pi.name < 0) break;
      const raw = r[pi.name] ?? "";
      const tm = raw.match(/^(.+?)[（(]([^）)]+)[）)]\s*$/);
      const playerJp = (tm ? tm[1] : raw).trim();
      if (!playerJp) continue;
      const teamName = tm ? npbAbbrToKorean(tm[2]) : "";
      if (!teamName) continue;
      const slg = pi.slg >= 0 ? flt(r[pi.slg]) : null;
      const obp = pi.obp >= 0 ? flt(r[pi.obp]) : null;
      const ops = slg != null && obp != null ? Number((slg + obp).toFixed(3)) : null;
      const playerName = npbPlayerToKorean(playerJp) || playerJp;
      await upsertPlayer({
        league: "NPB",
        season,
        teamName,
        playerName,
        playerNameEn: playerJp,
        avg: pi.avg >= 0 ? flt(r[pi.avg]) : null,
        hits: pi.h >= 0 ? int(r[pi.h]) : null,
        rbi: pi.rbi >= 0 ? int(r[pi.rbi]) : null,
        ops,
        homeRuns: pi.hr >= 0 ? int(r[pi.hr]) : null,
        games: pi.g >= 0 ? int(r[pi.g]) : null,
      });      summary.players++;
    }
  }

  await clearStaleByTime("NPB", season, runStart);
  return summary;
}

/* ============================================================
 * Entry
 * ==========================================================*/

export async function runFetchBaseballSeasonStats(opts?: {
  league?: "MLB" | "KBO" | "NPB";
}): Promise<Record<string, unknown>> {
  const season = String(new Date().getUTCFullYear());
  const only = opts?.league;
  const summary: Record<string, unknown> = { season };
  const run = async (lg: "MLB" | "KBO" | "NPB", fn: () => Promise<unknown>) => {
    if (only && only !== lg) return;
    try {
      summary[lg] = await fn();
    } catch (e) {
      summary[lg] = { error: (e as Error).message };
      console.warn(`[bb-season/${lg}]`, (e as Error).message);
    }
  };
  await run("MLB", () => runMlb(season));
  await run("KBO", () => runKbo(season));
  await run("NPB", () => runNpb(season));
  return summary;
}

// CLI 직접 실행 — `tsx --env-file=.env.local src/jobs/fetch-baseball-season-stats.ts [MLB|KBO|NPB]`
// (cron route 가 import 할 때는 argv[1] 이 next 서버라 실행되지 않음)
if (process.argv[1] && /fetch-baseball-season-stats/.test(process.argv[1])) {
  const lg = process.argv[2] as "MLB" | "KBO" | "NPB" | undefined;
  runFetchBaseballSeasonStats(lg ? { league: lg } : undefined)
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
      return prisma.$disconnect();
    })
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
