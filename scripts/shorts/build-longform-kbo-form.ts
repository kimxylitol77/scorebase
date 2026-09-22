// KBO 투수 폼 롱폼 데이터 빌더 — /baseball/rankings?view=form&role=pit 과 같은 산식(최근 5등판 ERA, 10이닝 이상)으로
// TOP10 + 등판별 로그 + 사진 + 팀 로고 + 현재 순위를 뽑아 ~/scorebase-shorts/data/longform-kbo-form.json 에 쓴다.
//   cd <scorebase> && npx tsx --env-file=.env.local scripts/shorts/build-longform-kbo-form.ts
import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "node:fs";
import { aggregateForm, computeBbForm, FORM_PIT_GAMES, type BbPlayerRow, type LogLine } from "../../src/lib/sports/baseball/player-rankings";

const p = new PrismaClient();
const SHORTS = "/Users/kimss/scorebase-shorts";
const season = "2026";
const kboPhotoUrl = (id: string) => `https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/person/middle/${season}/${id}.jpg`;

async function download(url: string, file: string) {
  try {
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!r.ok) return false;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 500) return false;
    mkdirSync(`${SHORTS}/public/players`, { recursive: true });
    writeFileSync(`${SHORTS}/public/players/${file}`, buf);
    return true;
  } catch { return false; }
}
const fmtIp = (ip: number | null | undefined) => ip == null ? "-" : `${Math.floor(ip)}.${Math.round((ip - Math.floor(ip)) * 3)}`;

async function main() {
  // 1) 페이지와 같은 재료·산식
  const stats = await p.baseballPlayerSeasonStats.findMany({ where: { league: "KBO", season } });
  const lines = await p.$queryRaw<LogLine[]>`
    WITH l AS (
      SELECT "kboId" AS id, role, COALESCE(ab,0)::int ab, COALESCE(h,0)::int h, COALESCE(d2b,0)::int d2b, COALESCE(d3b,0)::int d3b, COALESCE(hr,0)::int hr, COALESCE(bb,0)::int bb, 0::int hbp, ip, COALESCE(er,0)::int er,
        ROW_NUMBER() OVER (PARTITION BY "kboId", role ORDER BY date DESC, seq DESC) rn
      FROM "KboPlayerGameLog" WHERE season = ${Number(season)}
    ) SELECT id, role, ab, h, d2b, d3b, hr, bb, hbp, ip, er FROM l WHERE role = 'P' AND rn <= ${FORM_PIT_GAMES}`;
  const form = aggregateForm(lines);
  const rows: BbPlayerRow[] = stats.map((s) => ({
    key: s.externalId ?? `${s.playerName}|${s.teamName}`, externalId: s.externalId, name: s.playerName, nameEn: s.playerNameEn, team: s.teamName, games: s.games ?? 0,
    avg: s.avg, hits: s.hits, hr: s.homeRuns, rbi: s.rbi, ops: s.ops, era: s.era, whip: s.whip, ip: s.ip, so: s.so, w: s.wins, l: s.losses, sv: s.saves, salary: null, logId: s.externalId,
  }));
  const ranked = computeBbForm(rows, form, "pit").slice(0, 10);
  const byKey = new Map(rows.map((r) => [r.key, r]));

  // 2) 팀 로고
  const teams = await p.team.findMany({ where: { league: "KBO" }, select: { id: true, name: true, nameKo: true, logoUrl: true } });
  const logoOf = new Map<string, string>();
  for (const t of teams) {
    const f = `team-${t.id}.png`;
    if (t.logoUrl && (await download(t.logoUrl, f))) { logoOf.set(t.name, f); if (t.nameKo) logoOf.set(t.nameKo, f); }
  }
  const teamLogo = (name: string) => logoOf.get(name) ?? [...logoOf.entries()].find(([k]) => k.includes(name) || name.includes(k))?.[1] ?? "";

  // 3) TOP10 + 등판별 로그 + 사진
  const top = [];
  for (let i = 0; i < ranked.length; i++) {
    const x = ranked[i]; const r = byKey.get(x.key)!;
    const logs = await p.kboPlayerGameLog.findMany({ where: { season: Number(season), kboId: r.externalId!, role: "P" }, orderBy: [{ date: "desc" }, { seq: "desc" }], take: FORM_PIT_GAMES, select: { date: true, opponent: true, ip: true, er: true, gameEra: true, so: true, result: true, roleDetail: true } });
    const photo = `kbo-${r.externalId}.jpg`;
    const ok = await download(kboPhotoUrl(r.externalId!), photo);
    top.push({
      rank: i + 1, name: r.name, team: r.team, kboId: r.externalId, photo: ok ? photo : "", teamLogo: teamLogo(r.team),
      formEra: x.form.era, formIp: fmtIp(x.form.ip), formN: x.form.n, seasonEra: x.season, delta: x.delta,
      seasonLine: `${r.games}경기 ${fmtIp(r.ip)}이닝 · ERA ${r.era?.toFixed(2)} · WHIP ${r.whip?.toFixed(2)} · ${r.so ?? 0}K · ${r.w ?? 0}승`,
      wins: r.w ?? 0, so: r.so ?? 0, games: r.games,
      starts: logs.reverse().map((g) => ({ date: `${g.date.getUTCMonth() + 1}/${g.date.getUTCDate()}`, opp: g.opponent, ip: g.ip, er: g.er, gameEra: g.gameEra, so: g.so, result: g.result, detail: g.roleDetail })),
    });
  }

  // 4) 현재 순위 (승률 정렬 + 1위 대비 게임차)
  const ts = await p.baseballTeamSeasonStats.findMany({ where: { league: "KBO", season }, select: { teamName: true, wins: true, losses: true, draws: true } });
  const sorted = ts.map((t) => ({ ...t, pct: t.wins / Math.max(1, t.wins + t.losses) })).sort((a, b) => b.pct - a.pct);
  const lead = sorted[0];
  const standings = sorted.map((t, i) => ({ rank: i + 1, team: t.teamName, w: t.wins, l: t.losses, d: t.draws, pct: +t.pct.toFixed(3), gb: (lead.wins - t.wins + (t.losses - lead.losses)) / 2, logo: teamLogo(t.teamName) }));

  // 5) 이야기 3개 — 규칙으로 선정 (반등왕 = 시즌 대비 개선폭 최대 · 꾸준함 = 폼·시즌 모두 최저 합 · 베테랑 = 류현진이 TOP10 안이면)
  const rebound = [...top].sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))[0];
  const steady = [...top].sort((a, b) => (a.formEra! + a.seasonEra!) - (b.formEra! + b.seasonEra!))[0];
  const veteran = top.find((t) => t.name === "류현진") ?? null;
  const props = { season, snapshot: new Date().toISOString().slice(0, 10), top, standings, stories: { rebound: rebound.rank, steady: steady.rank, veteran: veteran?.rank ?? null } };
  mkdirSync(`${SHORTS}/data`, { recursive: true });
  writeFileSync(`${SHORTS}/data/longform-kbo-form.json`, JSON.stringify(props, null, 2));
  console.log(`✓ TOP10: ${top.map((t) => `${t.rank} ${t.name}(${t.team}) ${t.formEra} Δ${t.delta} 사진${t.photo ? "O" : "X"} 로고${t.teamLogo ? "O" : "X"} 등판${t.starts.length}`).join(" | ")}`);
  console.log(`✓ 순위: ${standings.slice(0, 5).map((s) => `${s.rank} ${s.team} ${s.w}-${s.l}-${s.d}`).join(" | ")}`);
  console.log(`✓ 이야기: 반등=${rebound.name} 꾸준=${steady.name} 베테랑=${veteran?.name ?? "없음"}`);
}
main().finally(() => p.$disconnect());
