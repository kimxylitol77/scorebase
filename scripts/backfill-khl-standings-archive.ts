// KHL 지난 시즌 최종 순위 백필 — ts season/table/detail(시즌별) → SeasonStandingsArchive (역사 탭 "시즌별 최종 순위").
// 매일 아카이브 잡(archiveHockeyTs)은 현재 시즌만 굳히므로, 2008-09 ~ 지난 시즌은 이 스크립트로 한 번 채운다.
// 지금 없는 팀(조커릿·메드베스차크 등)은 우리 Team 이 없어 ts team/list 로 이름·로고만 받는다(teamId null).
// ts 호출이 있어 로컬(화이트리스트 IP)에서 실행: npx tsx --env-file=.env.local scripts/backfill-khl-standings-archive.ts [--dry]
import "@/lib/env";
import { prisma } from "@/lib/db";
import { upsertArchive, type ArchiveRow } from "@/jobs/archive-standings";
import { toKoreanTeamName } from "@/lib/team-names";
import rawMapping from "../src/lib/sports/thesports/ice-hockey-team-id-mapping.json";

const DRY = process.argv.includes("--dry");
const KHL_UTID = "9vjxm87bywlr6od";
const TS_USER = process.env.THESPORTS_USER ?? "";
const TS_SECRET = process.env.THESPORTS_SECRET ?? "";

async function ts<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const u = new URL(`https://api.thesports.com/v1/ice_hockey/${path}`);
  u.searchParams.set("user", TS_USER);
  u.searchParams.set("secret", TS_SECRET);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { signal: AbortSignal.timeout(30000) });
  const d = (await r.json()) as { code?: number; results?: T; err?: string };
  if (d.code !== 0) throw new Error(`${path}: ${d.err ?? d.code}`);
  return d.results ?? null;
}

interface RawRow { team_id: string; position: number; points: number; total: number; win: number; goals: number; goals_against: number }

async function main() {
  // KHL 지난 시즌 목록 — season/list 페이지를 끝까지 (현재 시즌 제외)
  const seasons: Array<{ id: string; year: string }> = [];
  for (let page = 1; page <= 10; page++) {
    const rows = await ts<Array<{ id: string; unique_tournament_id: string; year: string; is_current: number }>>("season/list", { page: String(page) });
    if (!rows?.length) break;
    for (const s of rows) if (s.unique_tournament_id === KHL_UTID && !s.is_current && s.year >= "2008") seasons.push({ id: s.id, year: s.year });
  }
  seasons.sort((a, b) => a.year.localeCompare(b.year));
  console.log(`KHL 지난 시즌 ${seasons.length}개: ${seasons.map((s) => s.year).join(", ")}`);

  // ts 팀 → 우리 Team (KHL 매핑 우선)
  const map = rawMapping as Array<{ ourId: number; ourLeague: string; tsId: string }>;
  const ourIdOf = new Map<string, number>();
  for (const m of map) if (m.ourLeague === "KHL") ourIdOf.set(m.tsId, m.ourId);
  for (const m of map) if (!ourIdOf.has(m.tsId)) ourIdOf.set(m.tsId, m.ourId);
  const teams = await prisma.team.findMany({ where: { id: { in: [...new Set(ourIdOf.values())] } }, select: { id: true, name: true, logoUrl: true } });
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const tsTeamCache = new Map<string, { name: string; logo: string | null }>();

  for (const s of seasons) {
    const label = `${s.year.slice(0, 4)}-${s.year.slice(-2)}`; // "2008-2009" → "2008-09"
    const res = await ts<{ tables?: Array<{ name: string; rows?: RawRow[] }> }>("season/table/detail", { uuid: s.id });
    const tables = (res?.tables ?? []).filter((t) => t.rows?.length);
    if (tables.length === 0) { console.log(`  ${label}: 표 없음`); continue; }
    // 전체 표 = 행이 가장 많은 표. 그래도 팀이 빠지면(컨퍼런스 표만 있는 시즌) 모든 표를 합쳐 승점순으로.
    const allTeams = new Set(tables.flatMap((t) => t.rows!.map((r) => r.team_id)));
    let rows = [...tables].sort((a, b) => b.rows!.length - a.rows!.length)[0].rows!;
    let merged = false;
    if (rows.length < allTeams.size) {
      const seen = new Map<string, RawRow>();
      for (const t of tables) for (const r of t.rows!) if (!seen.has(r.team_id)) seen.set(r.team_id, r);
      rows = [...seen.values()].sort((a, b) => b.points - a.points || (b.goals - b.goals_against) - (a.goals - a.goals_against));
      merged = true;
    }
    const out: ArchiveRow[] = [];
    for (const [i, r] of rows.entries()) {
      const ourId = ourIdOf.get(r.team_id) ?? null;
      const t = ourId != null ? teamById.get(ourId) : undefined;
      let name = t?.name, logo = t?.logoUrl ?? null;
      if (!name) {
        if (!tsTeamCache.has(r.team_id)) {
          const info = (await ts<Array<{ name: string; logo?: string }>>("team/list", { uuid: r.team_id }))?.[0];
          tsTeamCache.set(r.team_id, { name: info?.name ?? r.team_id, logo: info?.logo || null });
        }
        ({ name, logo } = tsTeamCache.get(r.team_id)!);
      }
      const ko = toKoreanTeamName(name, "KHL");
      out.push({
        teamId: t ? ourId : null,
        name,
        ...(ko && ko !== name ? { ko } : {}),
        logo,
        position: merged ? i + 1 : r.position,
        played: r.total,
        won: r.win,
        loss: r.total - r.win,
        gf: r.goals,
        ga: r.goals_against,
        points: r.points,
      });
    }
    const top = out.find((r) => r.position === 1);
    const result = DRY ? "dry" : await upsertArchive("KHL", label, "ts-hockey-table-backfill", out);
    console.log(`  ${label}: ${out.length}팀${merged ? " (표 합침)" : ""} · 1위 ${top?.ko ?? top?.name} ${top?.points}점 → ${result}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
