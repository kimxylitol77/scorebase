// WNBA 시즌 단계 백필 — ts 시즌 목록(match/season/recent)의 kind 로 프리시즌·플레이오프·커미셔너스컵 결승을 표시한다.
// ts kind(2026-10-03 실측, 2026 시즌 365경기): 1 정규(330 = 15팀×44÷2)·2 플레이오프·3 프리시즌·5 커미셔너스컵 결승(순위 미반영).
// diary 는 최근 30일만 인가라 4~5월 프리시즌은 시즌 목록으로만 보인다. 8/19 이전 경기는 api-sports 행(raw 에 단계 표시 없음)이라
// 같은 두 팀·킥오프 ±36시간으로 짝짓는다. 표시 형식은 워커(basketball-match-collector)와 같다.
//  - 프리시즌: raw.thesports.preseason=true (lib/predict/preseason.ts 가 읽는다). api-sports raw 는 최상위에 thesports 키만 덧붙인다.
//  - 플레이오프·컵 결승: playoffRound (FIRST_ROUND·SEMIFINALS·FINALS·CUP_FINAL) — 순위·팀 통계가 playoffRound 있는 경기를 뺀다.
// 실행: npx tsx --env-file=.env.local scripts/backfill-wnba-season-phase.ts [--dry]
import "@/lib/env";
import { prisma } from "@/lib/db";
import { thesportsGet } from "@/lib/sports/thesports/client";
import teamMap from "@/lib/sports/thesports/basketball-team-id-mapping.json";

const DRY = process.argv.includes("--dry");
const WNBA_COMP = "0gx7lm73tor2wdk";
const PAIR_WINDOW_MS = 36 * 3600_000;

interface TsMatch { id: string; kind?: number; match_time: number; home_team_id?: string; away_team_id?: string; round?: { stage_id?: string } }

/** lightsail-worker/basketball-match-collector.js wnbaPhase 와 같은 판정 */
function wnbaRound(kind: number | undefined, stageName: string): string | null {
  if (kind === 5) return "CUP_FINAL";
  if (kind !== 2) return null;
  const h = stageName.toLowerCase();
  if (/first round/.test(h)) return "FIRST_ROUND";
  if (/semi/.test(h)) return "SEMIFINALS";
  if (/final/.test(h)) return "FINALS";
  return "PLAYOFF";
}

async function main() {
  const comp = await thesportsGet<{ code: number; results?: Array<{ cur_season_id?: string }> }>("/v1/basketball/competition/list", { uuid: WNBA_COMP });
  const sid = comp.results?.[0]?.cur_season_id;
  if (!sid) throw new Error("WNBA 현재 시즌 id 없음");
  const season = (await thesportsGet<{ code: number; results?: TsMatch[] }>("/v1/basketball/match/season/recent", { uuid: sid })).results ?? [];
  const stages = (await thesportsGet<{ code: number; results?: Array<{ id: string; name: string }> }>("/v1/basketball/stage/list", {})).results ?? [];
  const stageName = new Map(stages.map((s) => [s.id, s.name]));
  const byKind = new Map<number, number>();
  for (const m of season) byKind.set(m.kind ?? -1, (byKind.get(m.kind ?? -1) ?? 0) + 1);
  console.log(`ts 시즌 ${sid} ${season.length}경기 · kind ${[...byKind].map(([k, n]) => `${k}:${n}`).join(" ")}`);

  const ourId = new Map((teamMap as Array<{ ourId: number; ourLeague: string; tsId: string }>).filter((t) => t.ourLeague === "WNBA").map((t) => [t.tsId, t.ourId]));
  const first = Math.min(...season.map((m) => m.match_time)) * 1000;
  const rows = await prisma.match.findMany({
    where: { league: "WNBA", startTime: { gte: new Date(first - 2 * 86400_000) } },
    select: { id: true, externalId: true, startTime: true, homeTeamId: true, awayTeamId: true, raw: true, playoffRound: true },
  });
  const byExt = new Map(rows.map((r) => [r.externalId, r]));
  const used = new Set<number>();

  let pre = 0, po = 0, unchanged = 0, unmatched = 0;
  const matchedByKind = new Map<number, number>();
  for (const m of season) {
    let row = byExt.get(`ts-${m.id}`);
    if (!row) {
      const h = ourId.get(m.home_team_id ?? ""), a = ourId.get(m.away_team_id ?? "");
      const t = m.match_time * 1000;
      row = rows.find((r) => !used.has(r.id) && !r.externalId?.startsWith("ts-") && r.homeTeamId === h && r.awayTeamId === a && Math.abs(r.startTime.getTime() - t) <= PAIR_WINDOW_MS);
    }
    if (!row) {
      if (m.kind !== 1) console.log(`  짝 없음 kind=${m.kind} ${new Date(m.match_time * 1000).toISOString().slice(0, 16)} ts-${m.id}`);
      unmatched++;
      continue;
    }
    used.add(row.id);
    matchedByKind.set(m.kind ?? -1, (matchedByKind.get(m.kind ?? -1) ?? 0) + 1);
    const data: { raw?: string; playoffRound?: string } = {};
    if (m.kind === 3) {
      const cur = row.raw ? (JSON.parse(row.raw) as Record<string, unknown> & { thesports?: Record<string, unknown> }) : {};
      if (cur.thesports?.preseason !== true) {
        data.raw = JSON.stringify({ ...cur, thesports: { ...(cur.thesports ?? {}), preseason: true } });
        pre++;
      }
    }
    const round = wnbaRound(m.kind, stageName.get(m.round?.stage_id ?? "") ?? "");
    if (round && row.playoffRound !== round) { data.playoffRound = round; po++; }
    if (Object.keys(data).length === 0) { unchanged++; continue; }
    if (!DRY) await prisma.match.update({ where: { id: row.id }, data });
  }
  const orphans = rows.filter((r) => !used.has(r.id));
  console.log(`짝 ${used.size} (kind ${[...matchedByKind].map(([k, n]) => `${k}:${n}`).join(" ")}) · 짝 없음 ts ${unmatched} · 짝 없는 DB 행 ${orphans.length}`);
  for (const o of orphans) console.log(`  DB 고아 #${o.id} ${o.externalId} ${o.startTime.toISOString().slice(0, 16)} ${o.homeTeamId}-${o.awayTeamId}`);
  console.log(`프리시즌 표시 ${pre} · playoffRound ${po} · 이미 반영 ${unchanged}${DRY ? " (dry)" : ""}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
