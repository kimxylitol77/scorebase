// 신규 대회 탐지 — 향후 14일 원천 일정에서 우리에게 아직 없는 대회를 모아 후보로 올린다(2026-10-03).
// 일정 공백 감시(schedule-gap-audit)가 "있는 리그의 빈 일정"을 본다면, 이건 "아예 없는 대회"를 본다.
// 추가는 사람이 한다 — 새 대회는 리그명·순위·팀 매핑·탭을 한 묶음으로 맞춰야 해서 자동 추가는 사고가 난다.
//
// 원천: api-football /fixtures?date= (하루 1콜, 대회명·국가 포함)가 주력. TheSports diary 는 한국 관련 대회만 보탠다
// (ts 대회명은 af 와 표기가 달라 같은 대회를 둘로 세기 쉽다).
import { prisma } from "@/lib/db";
import { thesportsGet } from "@/lib/sports/thesports/client";
import { API_FOOTBALL_LEAGUE_ID } from "@/lib/sports/api-football-pro";
import { TS_FOOTBALL_COMPETITION_ID } from "@/lib/sports/thesports/football-competitions";
import tsLeagueMap from "@/lib/sports/thesports/league-id-mapping.json";
import type { CompetitionCandidate } from "./new-competition-score";
// 배포 서버엔 data/ 를 fs 로 읽을 수 없어(번들 밖) 정적 import 한다 — /soccer/korea 와 같은 방식
import koreaAbroad from "../../../data/korea-abroad.json";

const DAY = 86400;
const KOREA_NATIONAL = /korea republic|south korea|\bkorea\b(?!.*dpr)/i;
const NORTH_KOREA = /korea dpr|north korea/i;

interface AfFixture {
  league: { id: number; name: string; country: string };
  teams: { home: { id: number; name: string }; away: { id: number; name: string } };
}

/** 해외파 소속팀 af id → 선수 이름(들) */
function abroadTeams(): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const d = koreaAbroad as { players?: Array<{ nameKo?: string; nameEn?: string; team?: { afId?: number; name?: string } }> };
  for (const p of d.players ?? []) {
    if (!p.team?.afId) continue;
    const a = out.get(p.team.afId) ?? [];
    a.push(`${p.nameKo ?? p.nameEn}(${p.team.name ?? ""})`);
    out.set(p.team.afId, a);
  }
  return out;
}

async function kLeagueAfTeams(): Promise<Set<number>> {
  // DB 가 잠깐 안 닿아도 보고 전체를 망치지 않는다 — K리그 근거만 빠진다
  const rows = await prisma.teamSourceId
    .findMany({
      where: { source: "api-football", league: { in: ["K_LEAGUE_1", "K_LEAGUE_2", "K3_LEAGUE"] } },
      select: { externalId: true },
    })
    .catch((e: Error) => {
      console.warn("[new-competition-scout] K리그 팀 조회 실패 — K리그 근거 생략:", e.message.split("\n")[0]);
      return [] as Array<{ externalId: string }>;
    });
  return new Set(rows.map((r) => Number(r.externalId)).filter(Number.isFinite));
}

// 대표팀 대회 판정 — af 는 국제 대회의 country 를 "World" 로 준다. 클럽 대항전(챔스·리베르타도레스 등)도 World 라 이름으로 뺀다.
// (팀 이름에 FC 가 없으면 대표팀으로 보던 첫 방식은 터키 2부·세리에C 같은 클럽 리그를 대표팀으로 오판했다)
const CLUB_INTL = /club|champions|libertadores|sudamericana|cup winners|confederation|afc cup|caf |concacaf (champions|cup)|leagues cup|recopa|super cup|intercontinental|premier league|international cup/i;
function isNationalCompetition(name: string, country: string): boolean {
  return country === "World" && !CLUB_INTL.test(name);
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function scoutNewCompetitions(opts: { days?: number; now?: Date; budgetMs?: number } = {}): Promise<CompetitionCandidate[]> {
  const days = opts.days ?? 14;
  const now = opts.now ?? new Date();
  const deadline = Date.now() + (opts.budgetMs ?? 200_000);
  const knownAf = new Set(Object.values(API_FOOTBALL_LEAGUE_ID).map(Number));
  const knownTs = new Set<string>([
    ...Object.values(TS_FOOTBALL_COMPETITION_ID).filter(Boolean) as string[],
    ...(tsLeagueMap as Array<{ tsId?: string }>).map((e) => e.tsId).filter(Boolean) as string[],
  ]);
  // 우리가 ts 로만 가진 국제 대회(아시안게임 등)는 af id 매핑이 없어 "미매핑"으로 보인다 → 국제 대회만 이름으로 거른다.
  // 국내 리그는 "Super League"·"Primera Division" 처럼 나라마다 같은 이름이라 이름 대조를 하지 않는다.
  const knownIntl = (tsLeagueMap as Array<{ tsEn?: string }>).map((e) => norm(e.tsEn ?? "")).filter((n) => n.length >= 6);
  const isKnownIntl = (name: string) => {
    const n = norm(name);
    return n.length >= 6 && knownIntl.some((k) => k.includes(n) || n.includes(k));
  };
  const abroad = abroadTeams();
  const kTeams = await kLeagueAfTeams();

  const byAf = new Map<number, CompetitionCandidate>();
  for (let i = 0; i < days && Date.now() < deadline; i++) {
    const date = new Date(now.getTime() + i * DAY * 1000).toISOString().slice(0, 10);
    const r = await fetch(`https://v3.football.api-sports.io/fixtures?date=${date}`, {
      headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY ?? "" },
      signal: AbortSignal.timeout(20000),
    })
      .then((x) => x.json() as Promise<{ response?: AfFixture[] }>)
      .catch(() => null);
    for (const f of r?.response ?? []) {
      if (knownAf.has(f.league.id)) continue;
      if (f.league.country === "World" && isKnownIntl(f.league.name)) continue;
      let e = byAf.get(f.league.id);
      if (!e) {
        e = { source: "af", id: String(f.league.id), name: f.league.name, country: f.league.country, matches: 0, korea: [], national: isNationalCompetition(f.league.name, f.league.country) };
        byAf.set(f.league.id, e);
      }
      e.matches++;
      for (const t of [f.teams.home, f.teams.away]) {
        const why =
          KOREA_NATIONAL.test(t.name) && !NORTH_KOREA.test(t.name)
            ? `대표팀 ${t.name}`
            : kTeams.has(t.id)
              ? `K리그 ${t.name}`
              : abroad.has(t.id)
                ? `해외파 ${abroad.get(t.id)!.join("·")}`
                : null;
        if (why && !e.korea.includes(why)) e.korea.push(why);
      }
    }
  }
  const out: CompetitionCandidate[] = [...byAf.values()];

  // ts — 한국 대표팀이 나오는 미매핑 대회만(af 에 같은 이름이 있으면 건너뜀)
  const afNames = new Set(out.map((c) => c.name.toLowerCase()));
  const tsKorea = new Map<string, CompetitionCandidate>();
  for (let i = 0; i < days && Date.now() < deadline; i++) {
    const d = await thesportsGet<{
      code: number;
      results?: Array<{ competition_id?: string; home_team_id?: string; away_team_id?: string }>;
      results_extra?: { competition?: Array<{ id: string; name: string }>; team?: Array<{ id: string; name: string }> };
    }>("/v1/football/match/diary", { tsp: Math.floor(now.getTime() / 1000) + i * DAY } as never).catch(() => null);
    const comp = new Map((d?.results_extra?.competition ?? []).map((x) => [x.id, x.name]));
    const team = new Map((d?.results_extra?.team ?? []).map((x) => [x.id, x.name]));
    for (const m of d?.results ?? []) {
      if (!m.competition_id || knownTs.has(m.competition_id)) continue;
      const names = [team.get(m.home_team_id ?? "") ?? "", team.get(m.away_team_id ?? "") ?? ""];
      const kr = names.find((n) => KOREA_NATIONAL.test(n) && !NORTH_KOREA.test(n));
      if (!kr) continue;
      const cname = comp.get(m.competition_id) ?? m.competition_id;
      if (afNames.has(cname.toLowerCase())) continue;
      const e = tsKorea.get(m.competition_id) ?? { source: "ts" as const, id: m.competition_id, name: cname, country: "", matches: 0, korea: [], national: true };
      e.matches++;
      if (!e.korea.includes(`대표팀 ${kr}`)) e.korea.push(`대표팀 ${kr}`);
      tsKorea.set(m.competition_id, e);
    }
  }
  return [...out, ...tsKorea.values()];
}
