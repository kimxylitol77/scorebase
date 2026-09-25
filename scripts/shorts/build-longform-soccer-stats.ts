// 축구 선수 스탯 롱폼 데이터 빌더 — /soccer/stats 로더(stats-data.ts)와 같은 쿼리 + buildSoccerStatRows(순수)로 페이지와 1:1.
// 부문별 TOP3(골·도움·키패스·태클·인터셉트·평점) + 완성형 TOP3(규정 선수 백분위 평균) + 사진·팀 로고 → shorts data JSON.
//   cd <scorebase> && npx tsx --env-file=.env.local scripts/shorts/build-longform-soccer-stats.ts [EPL]
import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "node:fs";
import rawPhotos from "../../data/player-photos.json";
import { toKoreanTeamName } from "../../src/lib/team-names";
import { buildSoccerStatRows, type SoccerSeasonRow } from "../../src/lib/sports/soccer/stats-table";
import { LEAGUE_DISPLAY } from "../../src/lib/sports/sport-leagues";

const PHOTOS = rawPhotos as Record<string, string>;
const p = new PrismaClient();
const SHORTS = "/Users/kimss/scorebase-shorts";
const league = (process.argv[2] || "EPL").toUpperCase();
const seasonStartUtc = (now = new Date()) => { const y = now.getUTCFullYear(); return new Date(Date.UTC(now.getUTCMonth() >= 6 ? y : y - 1, 6, 1)); };

async function download(url: string, file: string) {
  try {
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!r.ok) return false;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 300) return false;
    mkdirSync(`${SHORTS}/public/players`, { recursive: true });
    writeFileSync(`${SHORTS}/public/players/${file}`, buf);
    return true;
  } catch { return false; }
}

async function main() {
  // ── 페이지 로더(stats-data.ts getSoccerStatsData) 그대로 ──
  const labels = await p.playerSeasonStatArchive.groupBy({ by: ["seasonLabel"], where: { source: "ts", league } });
  const season = labels.map((l) => l.seasonLabel).sort().at(-1)!;
  const arch = await p.playerSeasonStatArchive.findMany({ where: { source: "ts", league, seasonLabel: season }, select: { playerId: true, stat: true } });
  const ids = arch.map((a) => a.playerId);
  const [players, ratings] = await Promise.all([
    p.theSportsPlayer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, nameKo: true, photoUrl: true } }),
    p.$queryRaw<Array<{ playerId: string; wr: number | null; mins: number | null }>>`
      SELECT "playerId", SUM(rating * minutes)::float AS wr, SUM(minutes)::int AS mins
      FROM "PlayerMatchLog" WHERE "playerId" = ANY(${ids}) AND date >= ${seasonStartUtc()} AND rating IS NOT NULL AND minutes >= 10
      GROUP BY "playerId"`,
  ]);
  const nameOf = new Map(players.map((x) => [x.id, { name: x.nameKo || x.name, photo: PHOTOS[x.id] || x.photoUrl || null }]));
  const ratingOf = new Map(ratings.map((r) => [r.playerId, r.mins && r.mins > 0 && r.wr != null ? { rating: r.wr / r.mins, mins: r.mins } : null]));
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  type A = Record<string, number | string | null | undefined>;
  const rows: SoccerSeasonRow[] = arch.map((a) => {
    const s = (a.stat ?? {}) as A; const nm = nameOf.get(a.playerId); const rt = ratingOf.get(a.playerId) ?? null;
    return {
      playerId: a.playerId, name: nm?.name ?? a.playerId, team: s.team ? toKoreanTeamName(String(s.team)) : "", pos: (s.pos as string) ?? null, photo: nm?.photo ?? null,
      matches: n(s.matches), starts: n(s.starts), minutes: n(s.minutes), goals: n(s.goals), assists: n(s.assists), shots: n(s.shots), sot: n(s.sot),
      keyPasses: n(s.keyPasses), passAcc: (s.passAcc as number) ?? null, tackles: n(s.tackles), interceptions: n(s.interceptions), yellow: n(s.yellow), red: n(s.red),
      saves: n(s.saves), cleanSheets: (s.cleanSheets as number) ?? null, conceded: (s.conceded as number) ?? null, rating: rt?.rating ?? null, ratedMinutes: rt?.mins ?? 0,
    };
  });
  const rated = rows.filter((r) => r.rating != null && r.minutes > 0);
  const avg = rated.length ? rated.reduce((a2, r) => a2 + (r.rating ?? 0), 0) / rated.length : 0;
  if (rated.length / Math.max(1, rows.length) < 0.3 || avg < 5) for (const r of rows) { r.rating = null; r.ratedMinutes = 0; }

  const { rows: table, qualifiedCount, minMinutes } = buildSoccerStatRows(rows, "ALL", "total");
  const byId = new Map(rows.map((r) => [r.playerId, r]));
  const qual = table.filter((t) => t.qualified);
  const maxMatches = Math.max(...rows.map((r) => r.matches));

  // 팀 로고 (한글 팀명 매칭)
  const teams = await p.team.findMany({ where: { league }, select: { id: true, name: true, nameKo: true, logoUrl: true } });
  const logoByKo = new Map<string, string>();
  for (const t of teams) if (t.logoUrl) { const ko = toKoreanTeamName(t.name); const f = `tlogo-${t.id}.png`; if (!logoByKo.has(ko) && (await download(t.logoUrl, f))) logoByKo.set(ko, f); if (t.nameKo && !logoByKo.has(t.nameKo)) logoByKo.set(t.nameKo, f); }

  const photoCache = new Map<string, string>();
  const card = async (key: string) => {
    const r = byId.get(key)!; const t = table.find((x) => x.key === key)!;
    let photo = photoCache.get(key);
    if (photo === undefined) { photo = r.photo && (await download(r.photo, `soc-${key}.png`)) ? `soc-${key}.png` : ""; photoCache.set(key, photo); }
    const pct = Object.fromEntries(Object.entries(t.cells).map(([k, c]) => [k, c.pct == null ? null : Math.round(c.pct)]));
    return { id: key, name: r.name, team: r.team, teamLogo: logoByKo.get(r.team) ?? "", pos: r.pos, photo, matches: r.matches, minutes: r.minutes,
      goals: r.goals, assists: r.assists, shots: r.shots, sot: r.sot, keyPasses: r.keyPasses, passAcc: r.passAcc, tackles: r.tackles, interceptions: r.interceptions, yellow: r.yellow,
      rating: r.rating == null ? null : Math.round(r.rating * 100) / 100, pct, qualified: t.qualified };
  };

  // 부문별 TOP3 — 규정 선수 안, 동률은 출전 분 적은 쪽(효율) 우선
  const CATS = [
    { key: "goals", label: "골" }, { key: "assists", label: "도움" }, { key: "keyPasses", label: "키패스" },
    { key: "tackles", label: "태클" }, { key: "interceptions", label: "인터셉트" }, { key: "rating", label: "평점" },
  ];
  const leaders = [];
  for (const c of CATS) {
    const top = [...qual].filter((t) => t.cells[c.key]?.value != null).sort((a, b) => (b.cells[c.key].value! - a.cells[c.key].value!) || (byId.get(a.key)!.minutes - byId.get(b.key)!.minutes)).slice(0, 3);
    leaders.push({ key: c.key, label: c.label, top: await Promise.all(top.map((t) => card(t.key))) });
  }
  // 완성형 TOP3 — 규정 필드 선수, 9개 지표(골·도움·슈팅·유효슛·키패스·패스%·태클·인터셉트·평점) 백분위 평균.
  // 9개가 전부 있는 선수만 — 평점 결측(로그 없는 팀)은 8개 평균이 되어 공정 비교가 안 된다(09-25 헐 시티 실측).
  const ALL9 = ["goals", "assists", "shots", "sot", "keyPasses", "passAcc", "tackles", "interceptions", "rating"];
  const allround = [...qual].map((t) => { const v = ALL9.map((k) => t.cells[k]?.pct).filter((x): x is number => x != null); return { key: t.key, avg: v.length === ALL9.length ? v.reduce((a2, b) => a2 + b, 0) / v.length : 0 }; })
    .sort((a, b) => b.avg - a.avg).slice(0, 3);
  const complete = await Promise.all(allround.map(async (x) => ({ ...(await card(x.key)), allAvg: Math.round(x.avg) })));
  const hook = await card(leaders[0].top[0].id);

  const out = { league, leagueLabel: LEAGUE_DISPLAY[league] ?? league, season, snapshot: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10),
    rounds: maxMatches, qualifiedCount, minMinutes, totalPlayers: table.length, hook, leaders, complete };
  mkdirSync(`${SHORTS}/data`, { recursive: true });
  writeFileSync(`${SHORTS}/data/longform-soccer-stats.json`, JSON.stringify(out, null, 2));
  console.log(`✓ ${out.leagueLabel} ${season} · 최대 ${maxMatches}경기 · 규정 ${minMinutes}분 이상 ${qualifiedCount}명 / 전체 ${table.length}`);
  for (const l of leaders) console.log(`  [${l.label}] ` + l.top.map((t) => `${t.name}(${t.team}) ${(t as Record<string, unknown>)[l.key]} p${t.pct[l.key]} ${t.photo ? "사진" : "X"}${t.teamLogo ? "로고" : "X"}`).join(" | "));
  console.log("  [완성형] " + complete.map((c) => `${c.name}(${c.team}) 평균백분위 ${c.allAvg}`).join(" | "));
}
main().finally(() => p.$disconnect());
