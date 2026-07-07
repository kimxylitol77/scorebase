// MLB Statcast 리더보드 — Baseball Savant 공개 CSV 로 타자 배럴%·평균 타구속도·하드히트%·xwOBA 상위 집계.
// 팀 단위는 Savant 가 CSV 로 안 주므로 statsapi 로 player→team 매핑 후 규정타석 타자 가중 평균.
// 전부 무료·무인증: baseballsavant.mlb.com(CSV) + statsapi.mlb.com. 선수 페이지 percentile 과 같은 소스.
import axios from "axios";
import { unstable_cache } from "next/cache";
import { toKoreanPlayerName } from "@/lib/player-names";
import { toKoreanTeamName } from "@/lib/team-names";

export interface StatcastPlayer {
  playerId: number;
  name: string; // 한글(사전 보유 시) 아니면 영문
  teamId: number | null;
  teamAbbr: string | null;
  pa: number;
  attempts: number; // 타구 이벤트 수 (배럴/타구속도 분모)
  barrelPct: number | null;
  avgEV: number | null; // 평균 타구속도 mph
  hardHitPct: number | null; // 95mph+ 타구 비율
  xwoba: number | null;
}

export interface StatcastTeam {
  teamId: number;
  name: string;
  abbr: string;
  players: number;
  barrelPct: number | null;
  avgEV: number | null;
  hardHitPct: number | null;
  xwoba: number | null;
}

export interface StatcastLeaderboard {
  year: number;
  players: StatcastPlayer[];
  teams: StatcastTeam[];
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') q = !q;
    else if (ch === "," && !q) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

// Savant CSV → header 인덱스 맵 + 행 배열.
function parseCsv(data: string): { header: string[]; rows: string[][] } {
  const lines = data.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return { header: [], rows: [] };
  const header = parseCsvLine(lines[0].replace(/^﻿/, "")).map((h) => h.replace(/^"|"$/g, ""));
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    rows.push(parseCsvLine(lines[i]).map((c) => c.replace(/^"|"$/g, "")));
  }
  return { header, rows };
}

const num = (v: string | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// "Arraez, Luis" → "Luis Arraez"
function flipName(raw: string): string {
  const parts = raw.split(",");
  if (parts.length === 2) return `${parts[1].trim()} ${parts[0].trim()}`;
  return raw.trim();
}

// statsapi 시즌 타격 splits → player_id → { teamId, name, abbr }
async function fetchTeamMap(
  year: number,
): Promise<Map<number, { teamId: number; name: string; abbr: string }>> {
  const map = new Map<number, { teamId: number; name: string; abbr: string }>();
  try {
    const { data } = await axios.get(
      `https://statsapi.mlb.com/api/v1/stats?stats=season&group=hitting&season=${year}&sportId=1&playerPool=all&limit=3000`,
      { timeout: 20000 },
    );
    const teamsById = new Map<number, { name: string; abbr: string }>();
    // teams 엔드포인트로 약어 보강 (splits.team 에 abbreviation 이 빠질 때 대비)
    try {
      const { data: td } = await axios.get(
        `https://statsapi.mlb.com/api/v1/teams?sportId=1&season=${year}&fields=teams,id,name,abbreviation`,
        { timeout: 15000 },
      );
      for (const t of td?.teams ?? []) {
        if (t?.id) teamsById.set(t.id, { name: t.name ?? "", abbr: t.abbreviation ?? "" });
      }
    } catch {}
    for (const grp of data?.stats ?? []) {
      for (const s of grp?.splits ?? []) {
        const pid = s?.player?.id;
        const tid = s?.team?.id;
        if (!pid || !tid) continue;
        const meta = teamsById.get(tid);
        map.set(pid, {
          teamId: tid,
          name: meta?.name || s?.team?.name || "",
          abbr: meta?.abbr || s?.team?.abbreviation || "",
        });
      }
    }
  } catch {}
  return map;
}

async function fetchCsv(url: string): Promise<{ header: string[]; rows: string[][] }> {
  try {
    const { data } = await axios.get<string>(url, { timeout: 20000, responseType: "text" });
    return parseCsv(data);
  } catch {
    return { header: [], rows: [] };
  }
}

// 가중 평균 헬퍼 (weight 0/음수/NaN 은 무시).
function weightedMean(items: Array<{ v: number | null; w: number }>): number | null {
  let sw = 0;
  let sv = 0;
  for (const { v, w } of items) {
    if (v == null || !Number.isFinite(v) || !(w > 0)) continue;
    sw += w;
    sv += v * w;
  }
  return sw > 0 ? sv / sw : null;
}

async function fetchStatcastBattingRaw(year: number): Promise<StatcastLeaderboard> {
  const [statcast, expected, teamMap] = await Promise.all([
    fetchCsv(
      `https://baseballsavant.mlb.com/leaderboard/statcast?type=batter&year=${year}&position=&team=&min=q&csv=true`,
    ),
    fetchCsv(
      `https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=batter&year=${year}&position=&team=&min=q&csv=true`,
    ),
    fetchTeamMap(year),
  ]);

  if (statcast.rows.length === 0) return { year, players: [], teams: [] };

  const H = (header: string[], key: string) => header.indexOf(key);
  const scId = H(statcast.header, "player_id");
  const scName = H(statcast.header, "last_name, first_name");
  const scAttempts = H(statcast.header, "attempts");
  const scEV = H(statcast.header, "avg_hit_speed");
  const scHard = H(statcast.header, "ev95percent");
  const scBarrel = H(statcast.header, "brl_percent");

  // expected: player_id → { pa, xwoba }
  const exId = H(expected.header, "player_id");
  const exPa = H(expected.header, "pa");
  const exWoba = H(expected.header, "est_woba");
  const expByPid = new Map<number, { pa: number | null; xwoba: number | null }>();
  for (const r of expected.rows) {
    const pid = num(r[exId]);
    if (pid == null) continue;
    expByPid.set(pid, { pa: num(r[exPa]), xwoba: num(r[exWoba]) });
  }

  const players: StatcastPlayer[] = [];
  for (const r of statcast.rows) {
    const pid = num(r[scId]);
    if (pid == null) continue;
    const ex = expByPid.get(pid);
    const team = teamMap.get(pid) ?? null;
    players.push({
      playerId: pid,
      name: toKoreanPlayerName(flipName(r[scName] ?? "")),
      teamId: team?.teamId ?? null,
      teamAbbr: team?.abbr || null,
      pa: ex?.pa ?? 0,
      attempts: num(r[scAttempts]) ?? 0,
      barrelPct: num(r[scBarrel]),
      avgEV: num(r[scEV]),
      hardHitPct: num(r[scHard]),
      xwoba: ex?.xwoba ?? null,
    });
  }

  // 팀 집계 — 규정타석 타자 가중 평균(배럴/타구속도/하드히트=타구수, xwOBA=타석).
  const byTeam = new Map<number, StatcastPlayer[]>();
  for (const p of players) {
    if (p.teamId == null) continue;
    const arr = byTeam.get(p.teamId) ?? [];
    arr.push(p);
    byTeam.set(p.teamId, arr);
  }
  const teams: StatcastTeam[] = [];
  for (const [teamId, ps] of byTeam) {
    const nameRaw = teamMap.get(ps[0].playerId)?.name ?? "";
    teams.push({
      teamId,
      name: toKoreanTeamName(nameRaw, "MLB"),
      abbr: ps[0].teamAbbr ?? "",
      players: ps.length,
      barrelPct: weightedMean(ps.map((p) => ({ v: p.barrelPct, w: p.attempts }))),
      avgEV: weightedMean(ps.map((p) => ({ v: p.avgEV, w: p.attempts }))),
      hardHitPct: weightedMean(ps.map((p) => ({ v: p.hardHitPct, w: p.attempts }))),
      xwoba: weightedMean(ps.map((p) => ({ v: p.xwoba, w: p.pa }))),
    });
  }

  return { year, players, teams };
}

const getStatcastBatting = unstable_cache(fetchStatcastBattingRaw, ["mlb-statcast-batting-v1"], {
  revalidate: 21600, // 6h
});

// 올 시즌 우선, 데이터 없으면 직전 시즌(시즌 초·오프시즌 대비).
export async function getStatcastLeaderboard(): Promise<StatcastLeaderboard> {
  const now = new Date().getUTCFullYear();
  for (const y of [now, now - 1]) {
    const r = await getStatcastBatting(y);
    if (r.players.length > 0) return r;
  }
  return { year: now, players: [], teams: [] };
}
