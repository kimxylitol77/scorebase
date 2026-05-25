import axios from "axios";
import { config as loadEnv } from "dotenv";
import path from "path";
import { prisma } from "../src/lib/db";

loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv({ path: path.join(process.cwd(), ".env") });

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER!;
const TS_SECRET = process.env.THESPORTS_SECRET!;
const SITE_URL = process.env.SITE_URL!;
const TOKEN = process.env.INTERNAL_API_TOKEN!;
const K_LEAGUE_2_CID = "kn54qllh25dqvy9";

function mapStatus(id: number) {
  if (id === 1) return "SCHEDULED";
  if (id >= 2 && id <= 7) return "LIVE";
  if (id === 8) return "FINISHED";
  if (id === 9 || id === 10 || id === 11) return "POSTPONED";
  return "SCHEDULED";
}

async function fetchDiary(tsp: number) {
  const { data } = await axios.get(`${TS_BASE}/v1/football/match/diary`, {
    params: { user: TS_USER, secret: TS_SECRET, tsp },
    timeout: 30_000,
  });
  return data;
}

async function main() {
  console.log(`SITE_URL=${SITE_URL}`);

  // K_LEAGUE_2 매치만 ±3일 sweep
  const seen = new Set<string>();
  const batch: any[] = [];
  for (const offset of [-1, 0, 1, 2, 3]) {
    const tsp = Math.floor(Date.now() / 1000) + offset * 86400;
    let raw;
    try { raw = await fetchDiary(tsp); } catch (e: any) { console.error(`offset=${offset}: ${e.message}`); continue; }
    if (raw.code !== 0) continue;
    for (const m of raw.results ?? []) {
      if (m.competition_id !== K_LEAGUE_2_CID) continue;
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      if (!m.home_team_id || !m.away_team_id) continue;
      batch.push({
        league: "K_LEAGUE_2",
        tsMatchId: m.id,
        tsHomeTeamId: m.home_team_id,
        tsAwayTeamId: m.away_team_id,
        startTime: new Date((m.match_time || 0) * 1000).toISOString(),
        status: mapStatus(m.status_id),
        homeScore: Array.isArray(m.home_scores) ? m.home_scores[0] : undefined,
        awayScore: Array.isArray(m.away_scores) ? m.away_scores[0] : undefined,
      });
    }
  }
  console.log(`K_LEAGUE_2 ts matches collected: ${batch.length}`);

  if (batch.length === 0) { console.log("(nothing to post)"); return; }
  const res = await axios.post(
    `${SITE_URL}/api/internal/thesports-matches`,
    { sport: "football", matches: batch },
    { headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, timeout: 60_000 },
  );
  console.log("endpoint response:", res.data);

  // 88120 / 88123 cache 재확인
  console.log("\n# 88120 / 88123 사후 확인");
  for (const id of [88120, 88123]) {
    const m = await prisma.match.findUnique({ where: { id }, select: { id: true, league: true, externalId: true, startTime: true } });
    const cache = await prisma.theSportsMatchCache.findUnique({ where: { matchId: id }, select: { tsMatchId: true } });
    console.log(`  ${id} ext=${m?.externalId} tsMatchId=${cache?.tsMatchId ?? "null"}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => (prisma as any).$disconnect());
