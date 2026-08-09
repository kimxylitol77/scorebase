// 시즌 순위 아카이브 백필 CLI — api-football /standings 과거 시즌 직접 호출로 소급 굳히기.
// 기본 season=2025 (유럽형 25-26 + 달력형 2025). 시즌 롤오버로 캐시에서 이미 소멸한
// 최종 순위를 af 과거시즌 API 로 회수한다. 위키형 데이터 축적 1단계.
//
//   npx tsx --env-file=.env.local scripts/backfill-standings-archive.ts            # season=2025 전 리그
//   npx tsx --env-file=.env.local scripts/backfill-standings-archive.ts 2024       # 다른 시즌
//   npx tsx --env-file=.env.local scripts/backfill-standings-archive.ts 2025 EPL,LALIGA
//
// 멱등: 이미 아카이브된 (league, seasonLabel) 은 건드리지 않는다 (site 아카이브 보호).
// 팀 매칭: Team.externalId(af 기반 리그) → 이름 정규화(ts 기반 리그) → 실패 시 teamId null
// (name·ko·logo 는 af 응답으로 보존 — 위키 표시엔 충분, 팀 링크만 best-effort).

import { prisma } from "../src/lib/db";
import { API_FOOTBALL_LEAGUE_ID } from "../src/lib/sports/api-football-pro";
import { NO_STANDINGS_LEAGUES, seasonLabelFor } from "../src/lib/sports/season-calendar";
import { toKoreanTeamName } from "../src/lib/team-names";
import { upsertArchive, type ArchiveRow } from "../src/jobs/archive-standings";

const AF_BASE = "https://v3.football.api-sports.io";

interface AfResp {
  response?: Array<{
    league?: {
      standings?: Array<
        Array<{
          rank: number;
          team: { id: number; name: string; logo?: string };
          points: number;
          group?: string;
          all?: {
            played?: number;
            win?: number;
            draw?: number;
            lose?: number;
            goals?: { for?: number; against?: number };
          };
        }>
      >;
    };
  }>;
}

// 이름 정규화 — LeagueHistory.tsx 의 normEn 과 같은 취지(축약어·구두점 제거).
const TOKENS = new Set(["fc", "afc", "cf", "sc", "ac", "cd", "ud", "as", "rcd", "sd", "ssc", "ss", "uc", "acf", "cfc", "fbc", "vfl", "vfb", "sv", "club", "cp", "if", "fk", "bk", "sk", "nk"]);
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\./g, "")
    .split(/[^a-z0-9]+/).filter((w) => w && !TOKENS.has(w)).join("");

async function main() {
  const season = Number(process.argv[2] ?? 2025);
  const only = process.argv[3] ? new Set(process.argv[3].split(",")) : null;
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) throw new Error("API_FOOTBALL_KEY 미설정");

  const targets = Object.entries(API_FOOTBALL_LEAGUE_ID).filter(
    ([league]) => !NO_STANDINGS_LEAGUES.has(league) && (!only || only.has(league)),
  );
  console.log(`대상 ${targets.length}개 리그, season=${season}`);

  const out = { saved: 0, exists: 0, empty: 0, skipped: 0, failed: [] as string[] };

  for (const [league, leagueId] of targets) {
    const label = seasonLabelFor(league, season);
    try {
      // 이미 아카이브된 시즌은 보호 — 백필이 site 아카이브를 덮지 않는다
      const existing = await prisma.seasonStandingsArchive.findUnique({
        where: { league_seasonLabel: { league, seasonLabel: label } },
        select: { id: true },
      });
      if (existing) {
        out.exists++;
        continue;
      }

      const res = await fetch(`${AF_BASE}/standings?league=${leagueId}&season=${season}`, {
        headers: { "x-apisports-key": apiKey },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) {
        out.failed.push(`${league}(HTTP ${res.status})`);
        continue;
      }
      const data = (await res.json()) as AfResp;
      const tables = data.response?.[0]?.league?.standings ?? [];
      if (tables.length === 0) {
        out.empty++;
        continue;
      }

      // 팀 매칭 준비 — externalId 정확일치 + 이름 정규화 폴백
      const teams = await prisma.team.findMany({
        where: { league },
        select: { id: true, externalId: true, name: true },
      });
      const byExt = new Map(teams.map((t) => [t.externalId, t.id]));
      const byName = new Map(teams.map((t) => [norm(t.name), t.id]));

      const rows: ArchiveRow[] = [];
      const seen = new Set<string>();
      for (const table of tables) {
        for (const r of table) {
          const key = `${r.team.id}:${r.group ?? ""}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const ko = toKoreanTeamName(r.team.name, league);
          rows.push({
            teamId: byExt.get(String(r.team.id)) ?? byName.get(norm(r.team.name)) ?? null,
            name: r.team.name,
            ko: ko !== r.team.name ? ko : undefined,
            logo: r.team.logo ?? null,
            position: r.rank,
            played: r.all?.played ?? (r.all?.win ?? 0) + (r.all?.draw ?? 0) + (r.all?.lose ?? 0),
            won: r.all?.win ?? 0,
            draw: r.all?.draw ?? 0,
            loss: r.all?.lose ?? 0,
            gf: r.all?.goals?.for,
            ga: r.all?.goals?.against,
            points: r.points,
            group: tables.length > 1 ? r.group ?? undefined : undefined,
          });
        }
      }

      const result = await upsertArchive(league, label, "af-backfill", rows);
      if (result === "saved") {
        const mapped = rows.filter((r) => r.teamId != null).length;
        console.log(`${league} ${label}: ${rows.length}팀 저장 (teamId 매칭 ${mapped})`);
        out.saved++;
      } else {
        out.skipped++;
      }
      await new Promise((r) => setTimeout(r, 250));
    } catch (e) {
      out.failed.push(`${league}(${(e as Error).message})`);
    }
  }

  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
