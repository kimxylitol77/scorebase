// KBO·NPB 포스트시즌 선수 기록 수집 — 시즌별로 선수 한 줄씩 합산해 PlayerSeasonStatArchive(source kbo-ps·npb-ps)에 저장.
//   KBO: 공식 기록실 BasicOld.aspx 시리즈(와일드카드·준PO·PO·KS) × 출전 팀 표를 합산.
//   NPB: 일정의 가을 경기 박스 중 "第N戦"(CS·일본시리즈) 경기만 골라 NpbPlayerGameLog(이미 적재)에서 그 경기 줄을 합산.
//   시즌 단위로 교체 저장이라 새 시즌이 지난 시즌 행을 건드리지 않는다. 가져온 게 0명이면 기존 행을 지우지 않는다(전멸 가드).
// 실행: npx tsx src/jobs/collect-baseball-postseason.ts --league KBO --season 2025   (cron: /api/cron/baseball-postseason-stats)
import "@/lib/env";
import { prisma } from "@/lib/db";
import { fetchKboPostseasonTable, KBO_POSTSEASON_SERIES } from "@/lib/sports/kbo-official";
import { fetchNpbScheduleLinks } from "@/lib/sports/npb-box";
import { npbPlayerKo } from "@/lib/sports/npb-player-ko";
import { toKoreanTeamName } from "@/lib/team-names";
import type { BbPlayerRow } from "@/lib/sports/baseball/player-rankings";
import {
  kboIpToNumber, npbIpToNumber, sumBatLines, sumPitLines, PS_ARCHIVE_SOURCE,
  type PsBatLine, type PsPitLine,
} from "@/lib/sports/baseball/postseason-aggregate";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const int = (s: string | undefined) => { const n = parseInt((s ?? "").replace(/,/g, ""), 10); return Number.isFinite(n) ? n : 0; };

// KBO 기록 표 팀명 → 기록실 ddlTeam 코드
const KBO_TEAM_CODE: Record<string, string> = { KT: "KT", 삼성: "SS", LG: "LG", KIA: "HT", 두산: "OB", NC: "NC", 롯데: "LT", SSG: "SK", 한화: "HH", 키움: "WO" };
// npb.jp 박스 경로 팀 코드 → NpbPlayerGameLog.team(한글 약칭)
const NPB_CODE_KO: Record<string, string> = { g: "요미우리", t: "한신", db: "DeNA", c: "히로시마", d: "주니치", s: "야쿠르트", h: "소프트뱅크", f: "닛폰햄", m: "롯데", b: "오릭스", bs: "오릭스", e: "라쿠텐", l: "세이부" };

async function collectKbo(season: number): Promise<{ bat: BbPlayerRow[]; pit: BbPlayerRow[]; series: string[] }> {
  const bat: PsBatLine[] = [];
  const pit: PsPitLine[] = [];
  const played: string[] = [];
  for (const s of KBO_POSTSEASON_SERIES) {
    // 팀 없이 = 그 시리즈 규정 타자 — 출전 팀만 알아낸다. 0명이면 아직 안 열린 시리즈
    const qual = await fetchKboPostseasonTable("hitter", String(season), s.code);
    const teams = [...new Set(qual.map((r) => r.cells["팀명"]).filter((t) => t && KBO_TEAM_CODE[t]))];
    if (teams.length === 0) continue;
    played.push(s.label);
    for (const t of teams) {
      await sleep(300);
      for (const r of await fetchKboPostseasonTable("hitter", String(season), s.code, KBO_TEAM_CODE[t])) {
        const c = r.cells;
        if (!r.playerId || !c["선수명"]) continue;
        bat.push({ id: r.playerId, name: c["선수명"], team: toKoreanTeamName(c["팀명"]) || c["팀명"], g: int(c.G), ab: int(c.AB), h: int(c.H), d2b: int(c["2B"]), d3b: int(c["3B"]), hr: int(c.HR), rbi: int(c.RBI), bb: int(c.BB), hbp: int(c.HBP) });
      }
      await sleep(300);
      for (const r of await fetchKboPostseasonTable("pitcher", String(season), s.code, KBO_TEAM_CODE[t])) {
        const c = r.cells;
        if (!r.playerId || !c["선수명"]) continue;
        pit.push({ id: r.playerId, name: c["선수명"], team: toKoreanTeamName(c["팀명"]) || c["팀명"], g: int(c.G), w: int(c.W), l: int(c.L), sv: int(c.SV), ip: kboIpToNumber(c.IP ?? ""), h: int(c.H), bb: int(c.BB), so: int(c.SO), er: int(c.ER) });
      }
    }
  }
  return { bat: sumBatLines(bat, "externalId"), pit: sumPitLines(pit, "externalId"), series: played };
}

/** 가을 경기(9/20 이후) 박스를 열어 "第N戦" 이 있는 경기(CS·일본시리즈)만 — 정규시즌 박스에는 없다(2025 실측). */
async function npbPostseasonGames(season: number): Promise<Set<string>> {
  const keys = new Set<string>();
  for (const month of [9, 10, 11]) {
    for (const g of await fetchNpbScheduleLinks(season, month)) {
      if (g.mmdd < "0920") continue;
      await sleep(250);
      const res = await fetch(`https://npb.jp${g.path}`, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128 Safari/537.36" }, signal: AbortSignal.timeout(15000) }).catch(() => null);
      if (!res?.ok) throw new Error(`npb.jp ${res?.status ?? "fetch 실패"} ${g.path}`); // 한 경기라도 못 읽으면 합계가 틀리니 저장하지 않는다
      if (!/第\s*[0-9０-９]+\s*戦/.test(await res.text())) continue;
      const [home, away] = g.path.split("/")[4].split("-");
      for (const code of [home, away]) if (NPB_CODE_KO[code]) keys.add(`${g.mmdd}|${NPB_CODE_KO[code]}`);
    }
  }
  return keys;
}

async function collectNpb(season: number): Promise<{ bat: BbPlayerRow[]; pit: BbPlayerRow[]; series: string[] }> {
  const keys = await npbPostseasonGames(season);
  if (keys.size === 0) return { bat: [], pit: [], series: [] };
  const dates = [...new Set([...keys].map((k) => k.split("|")[0]))].map((mmdd) => new Date(Date.UTC(season, Number(mmdd.slice(0, 2)) - 1, Number(mmdd.slice(2)))));
  const logs = await prisma.npbPlayerGameLog.findMany({ where: { season, date: { in: dates } }, orderBy: [{ date: "asc" }, { seq: "asc" }] });
  const bat: PsBatLine[] = [];
  const pit: PsPitLine[] = [];
  for (const l of logs) {
    const mmdd = l.date.toISOString().slice(5, 10).replace("-", "");
    if (!l.team || !keys.has(`${mmdd}|${l.team}`)) continue;
    const name = npbPlayerKo(l.npbId, l.name ?? l.npbId);
    if (l.role === "B") bat.push({ id: l.npbId, name, team: l.team, g: 1, ab: l.ab ?? 0, h: l.h ?? 0, d2b: l.d2b ?? 0, d3b: l.d3b ?? 0, hr: l.hr ?? 0, rbi: l.rbi ?? 0, bb: l.bb ?? 0, hbp: l.hbp ?? 0 });
    else if (l.role === "P") pit.push({ id: l.npbId, name, team: l.team, g: 1, w: l.result === "W" ? 1 : 0, l: l.result === "L" ? 1 : 0, sv: l.result === "S" ? 1 : 0, ip: npbIpToNumber(l.ip), h: l.h ?? 0, bb: l.bb ?? 0, so: l.so ?? 0, er: l.er ?? 0 });
  }
  return { bat: sumBatLines(bat, "logId"), pit: sumPitLines(pit, "logId"), series: [`${keys.size / 2}경기`] };
}

/** 한 시즌 교체 저장 — playerId 는 "bat:{id}"·"pit:{id}" (투타 겸업이 두 줄). */
async function save(league: "KBO" | "NPB", season: number, bat: BbPlayerRow[], pit: BbPlayerRow[]) {
  const source = PS_ARCHIVE_SOURCE[league];
  const seasonLabel = String(season);
  const rows = [
    ...bat.map((r) => ({ playerId: `bat:${r.key}`, stat: { role: "bat", ...r } })),
    ...pit.map((r) => ({ playerId: `pit:${r.key}`, stat: { role: "pit", ...r } })),
  ];
  await prisma.$transaction([
    prisma.playerSeasonStatArchive.deleteMany({ where: { source, seasonLabel } }),
    prisma.playerSeasonStatArchive.createMany({ data: rows.map((r) => ({ source, league, seasonLabel, playerId: r.playerId, stat: r.stat })) }),
  ]);
  return rows.length;
}

export async function runCollectBaseballPostseason(league: "KBO" | "NPB", season: number) {
  const got = league === "KBO" ? await collectKbo(season) : await collectNpb(season);
  if (got.bat.length + got.pit.length === 0) return { league, season, saved: 0, skipped: "no-postseason-games" };
  const saved = await save(league, season, got.bat, got.pit);
  return { league, season, saved, bat: got.bat.length, pit: got.pit.length, series: got.series };
}

if (process.argv[1]?.endsWith("collect-baseball-postseason.ts")) {
  const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
  const leagues = (arg("--league") ?? "KBO,NPB").split(",") as Array<"KBO" | "NPB">;
  const seasons = (arg("--season") ?? String(new Date().getFullYear())).split(",").map(Number);
  (async () => {
    for (const lg of leagues) for (const y of seasons) console.log(JSON.stringify(await runCollectBaseballPostseason(lg, y)));
    await prisma.$disconnect();
  })().catch((e) => { console.error(e); process.exit(1); });
}
