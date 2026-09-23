// U21 유망주 랭킹 롱폼 데이터 빌더 — /transfers?view=prospects 가 렌더 시 저장하는 PlayerRankSnapshot(list=prospects:21) 을
// 그대로 읽어(페이지와 1:1) TOP10 을 뽑고, 이름·사진·국기·나이·팀·몸값·시즌 스탯·순위 변동·여름 이적을 붙인다.
//   cd <scorebase> && npx tsx --env-file=.env.local scripts/shorts/build-longform-prospects.ts
import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "node:fs";
import rawOverrides from "../../data/player-overrides.json";
import rawPhotos from "../../data/player-photos.json";
import { currentTsTeamId } from "../../src/lib/transfers/current-team";
import { toKoreanTeamName } from "../../src/lib/team-names";
import { seasonStartUtc } from "../../src/lib/transfers/player-rankings";
import { LEAGUE_DISPLAY } from "../../src/lib/sports/sport-leagues";

const OV = rawOverrides as Record<string, { nameKo?: string; country?: string; flag?: string }>;
const PHOTOS = rawPhotos as Record<string, string>;
const p = new PrismaClient();
const SHORTS = "/Users/kimss/scorebase-shorts";
const LIST = "prospects:21";

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
  const days = await p.playerRankSnapshot.findMany({ where: { list: LIST }, distinct: ["day"], select: { day: true }, orderBy: { day: "desc" }, take: 2 });
  if (!days.length) throw new Error("prospects 스냅샷 없음 — 페이지를 한 번 열어 저장시킬 것");
  const today = days[0].day, base = days[1]?.day;
  const top = await p.playerRankSnapshot.findMany({ where: { list: LIST, day: today }, orderBy: { rank: "asc" }, take: 10, select: { playerId: true, rank: true, score: true, league: true, posCode: true } });
  const prev = base ? new Map((await p.playerRankSnapshot.findMany({ where: { list: LIST, day: base }, select: { playerId: true, rank: true } })).map((r) => [r.playerId, r.rank])) : new Map<string, number>();
  const ids = top.map((t) => t.playerId);

  const [tsp, pmv, stats, teams, tsIds, transfers] = await Promise.all([
    p.theSportsPlayer.findMany({ where: { id: { in: ids } }, select: { id: true, nameKo: true, name: true, photoUrl: true } }),
    p.playerMarketValue.findMany({ where: { id: { in: ids } }, select: { id: true, currentValue: true, age: true, teamId: true, history: true } }),
    p.$queryRawUnsafe<{ playerId: string; n: number; g: number; a: number; mins: number; ratingW: number | null }[]>(
      `SELECT "playerId", COUNT(*)::int AS n, COALESCE(SUM(goals),0)::int AS g, COALESCE(SUM(assists),0)::int AS a, COALESCE(SUM(minutes),0)::int AS mins,
         CASE WHEN COALESCE(SUM(minutes) FILTER (WHERE rating IS NOT NULL),0) > 0 THEN SUM(rating*minutes) FILTER (WHERE rating IS NOT NULL) / SUM(minutes) FILTER (WHERE rating IS NOT NULL) ELSE AVG(rating) END AS "ratingW"
       FROM "PlayerMatchLog" WHERE date >= $1 AND "playerId" = ANY($2) GROUP BY "playerId"`, seasonStartUtc(), ids),
    p.team.findMany({ where: { league: { in: ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"] } }, select: { id: true, name: true, nameKo: true, logoUrl: true, league: true } }),
    p.teamSourceId.findMany({ where: { source: "thesports" }, select: { externalId: true, teamId: true } }),
    p.footballTransfer.findMany({ where: { playerId: { in: ids }, transferTime: { gte: Math.floor(Date.parse("2026-06-01") / 1000) }, transferFee: { gt: 0 } }, select: { playerId: true, transferFee: true, fromTeamName: true, toTeamName: true, transferTime: true } }),
  ]);
  const tspM = new Map(tsp.map((x) => [x.id, x])), pmvM = new Map(pmv.map((x) => [x.id, x])), stM = new Map(stats.map((x) => [x.playerId, x]));
  const teamM = new Map(teams.map((t) => [t.id, t])), ts2our = new Map(tsIds.map((t) => [t.externalId, t.teamId]));
  const trM = new Map<string, (typeof transfers)[number]>(); for (const t of transfers) if (!trM.has(t.playerId) || (t.transferFee ?? 0) > (trM.get(t.playerId)!.transferFee ?? 0)) trM.set(t.playerId, t);

  const rows = [];
  for (const t of top) {
    const s = tspM.get(t.playerId), m = pmvM.get(t.playerId), st = stM.get(t.playerId), ov = OV[t.playerId];
    const tsTeam = currentTsTeamId(t.playerId, m?.teamId ?? null);
    const our = tsTeam ? ts2our.get(tsTeam) : undefined; const tm = our != null ? teamM.get(our) : undefined;
    const hist = (Array.isArray(m?.history) ? (m!.history as { market_time?: number; market_value?: number }[]) : []).filter((h) => h.market_value && h.market_time).sort((a, b) => a.market_time! - b.market_time!);
    const yearAgo = Date.now() / 1000 - 365 * 86400; const v1y = [...hist].reverse().find((h) => h.market_time! <= yearAgo)?.market_value;
    const photoUrl = PHOTOS[t.playerId] || s?.photoUrl || null; const photo = `soc-${t.playerId}.png`;
    const okPhoto = photoUrl ? await download(photoUrl, photo) : false;
    const flagFile = ov?.flag ? `flag-${t.playerId}.png` : ""; if (ov?.flag) await download(ov.flag, flagFile);
    const logoFile = tm?.logoUrl ? `tlogo-${tm.id}.png` : ""; if (tm?.logoUrl) await download(tm.logoUrl, logoFile);
    const tr = trM.get(t.playerId);
    rows.push({
      rank: t.rank, prevRank: prev.get(t.playerId) ?? null, score: t.score ?? 0, id: t.playerId,
      name: ov?.nameKo || s?.nameKo || s?.name || "?", pos: t.posCode, age: m?.age ?? null,
      country: ov?.country ?? null, flag: flagFile, team: toKoreanTeamName(tm?.name) || tm?.nameKo || tm?.name || "—", teamLogo: logoFile, league: LEAGUE_DISPLAY[t.league ?? ""] ?? t.league,
      value: Math.round((m?.currentValue ?? 0) / 1e6), v1y: v1y ? Math.round(v1y / 1e6) : null,
      games: st?.n ?? 0, goals: st?.g ?? 0, assists: st?.a ?? 0, mins: st?.mins ?? 0, rating: st?.ratingW == null ? null : Math.round(Number(st.ratingW) * 100) / 100,
      photo: okPhoto ? photo : "",
      transfer: tr ? { fee: tr.transferFee ? Math.round(tr.transferFee / 1e6) : null, from: toKoreanTeamName(tr.fromTeamName ?? undefined) || tr.fromTeamName, to: toKoreanTeamName(tr.toTeamName ?? undefined) || tr.toTeamName } : null,
    });
  }
  // 이야기 규칙: 저평가 = 몸값 대비 지수(점수/log(value)) 최고 · 급상승 = prevRank-rank 최대 · 여름 이적 = 이적료 최고
  const undervalued = [...rows].sort((a, b) => b.score / Math.log(Math.max(2, b.value)) - a.score / Math.log(Math.max(2, a.value)))[0];
  const growth = [...rows].filter((r) => r.v1y && r.v1y > 0).sort((a, b) => b.value / b.v1y! - a.value / a.v1y!)[0];
  const summer = [...rows].filter((r) => r.transfer?.fee).sort((a, b) => b.transfer!.fee! - a.transfer!.fee!)[0];
  const byTeam: Record<string, number> = {}; for (const r of rows) byTeam[r.team] = (byTeam[r.team] ?? 0) + 1;
  const out = { snapshot: today.toISOString().slice(0, 10), baseline: base?.toISOString().slice(0, 10) ?? null, top: rows, stories: { undervalued: undervalued.rank, growth: growth?.rank ?? null, summer: summer?.rank ?? null }, byTeam };
  mkdirSync(`${SHORTS}/data`, { recursive: true });
  writeFileSync(`${SHORTS}/data/longform-prospects.json`, JSON.stringify(out, null, 2));
  for (const r of rows) console.log(`${r.rank}(${r.prevRank ?? "new"}) ${r.name} ${r.pos} ${r.age}세 ${r.team} | ${r.games}경기 ${r.goals}골 ${r.assists}도움 평점 ${r.rating} | €${r.value}M (1y ${r.v1y}) | ${r.score} | 사진${r.photo ? "O" : "X"} 국기${r.flag ? "O" : "X"} 로고${r.teamLogo ? "O" : "X"}${r.transfer ? ` | 이적 ${r.transfer.from}→${r.transfer.to} €${r.transfer.fee}M` : ""}`);
  console.log("이야기:", out.stories, "팀별:", byTeam);
}
main().finally(() => p.$disconnect());
