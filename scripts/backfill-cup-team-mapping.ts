// 컵 대회 팀 매핑 백필 — 컵 네임스페이스 매핑 부재로 매치가 조용히 누락되는 갭을 닫는다.
//
//   npm run backfill:cup-teams -- --league EMPEROR_CUP            # dry-run (기본, 보고만)
//   npm run backfill:cup-teams -- --league FA_CUP,SUI_CUP         # 여러 대회
//   npm run backfill:cup-teams -- --league SUI_CUP --write        # 매핑 적용 + 매치 POST
//   npm run backfill:cup-teams -- --league X --days 45            # diary sweep 일수 (기본 28)
//   npm run backfill:cup-teams -- --league X --country "Japan"    # 신규 팀 country 지정
//   npm run backfill:cup-teams -- --league COPA_DEL_REY --season   # 매핑된 tsSeasonId 의 시즌 전체
//   npm run backfill:cup-teams -- --league X --season <uuid>       # 시즌 uuid 직접 지정
//
// --season 은 "미래 일정 sweep" 대신 시즌 전체(종료 경기 포함)를 대상으로 한다. 비수기라
// 향후 일정이 0건이면 diary sweep 으로는 아무것도 못 하는데, 지난 시즌 매치가 통째로 없는
// 대회(코파 델 레이·쿠프 드 프랑스 실측 0건)를 메울 때 쓴다. 판정·안전선은 동일하다.
//
// 왜 필요한가. 매치 수신 라우트의 팀 해석은 리그 네임스페이스 단위다 — J1 에 매핑된
// 구단도 EMPEROR_CUP 네임스페이스에 없으면 그 컵 매치는 skippedNoTeam 으로 조용히
// 빠진다. 2026-08-18 천황배 실측: 개막 전날 24경기 중 3경기만 DB 에 있었다(48팀 중
// 36팀 미매핑). 이 갭은 UEFA 예선·COPA_SUD·PSL·FA컵 등 컵 전반의 공통 패턴이다.
//
// 팀 해석 3단 판정 (중복 Team row 사고 방지 — cup-domestic-duplicate-team-rows 참고):
//   ① 타 네임스페이스에 동일 tsId 매핑 존재 → 그 팀 재사용 (이름 비교 없이 확정적)
//   ② 정확 정규화 이름 일치가 **유일**할 때만 재사용 (2개 이상이면 보류 — 사람 판단)
//   ③ 신규 Team 생성 (league=컵코드, externalId=ts-<tsId>) — 대학·아마추어 등 컵 전용 팀
//
// 안전선:
//   - 기존 컵 네임스페이스 매핑이 다른 팀을 가리키면 덮지 않고 CONFLICT 보고 (사람 판단).
//   - --write 없이는 DB 를 절대 건드리지 않는다.
//   - ts 호출 간 250ms — 버스트로 방화벽에 걸리지 않게 (no-burst-from-worker-ip).
//   - 핵심: 라우트가 DB TeamSourceId 를 JSON 보다 우선 조회하므로 **DB row 만으로 충분**
//     — 배포·mapping JSON 수정·워커 재시작 전부 불요. 다음 컬렉터 주기부터 자동 수집된다.
//   - --write 는 검증까지 한다: 수집된 매치를 컬렉터와 같은 형식으로
//     /api/internal/thesports-matches 에 직접 POST 해 skippedNoTeam=0 을 그 자리에서 확인.
//
// ⚠ TheSports 는 IP whitelist — 화이트리스트된 호스트(이 맥북 포함)에서만 동작한다.

import { prisma } from "../src/lib/db";
import tsLeagueMap from "../src/lib/sports/thesports/league-id-mapping.json";

const TS_BASE = "https://api.thesports.com/v1/football";
const CALL_GAP_MS = 250;
const POST_CHUNK = 100;

// ESPN/api-football 이 수집을 담당하는 대회 — ts 로 넣으면 크로스소스 중복이 된다.
// lightsail-worker/football-match-collector.js 의 SKIP_LEAGUES 와 반드시 동기 유지.
const SKIP_LEAGUES = new Set([
  "CLUB_WORLD_CUP", "WC_QUAL", "EURO_QUAL", "UEFA_NL",
  "INTL_FRIENDLY", "AFCON", "CONCACAF_GOLD",
]);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : undefined;
}
const has = (n: string) => process.argv.includes(`--${n}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const norm = (s: string) => s.toLowerCase().replace(/[^0-9a-z가-힣]/g, "");

// lightsail-worker/football-match-collector.js 의 mapStatus 와 동일해야 한다.
function mapStatus(id: number): "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED" {
  if (id === 1) return "SCHEDULED";
  if (id >= 2 && id <= 7) return "LIVE";
  if (id === 8) return "FINISHED";
  if (id === 9 || id === 10 || id === 11 || id === 12) return "POSTPONED";
  return "SCHEDULED";
}

interface DiaryMatch {
  id: string;
  competition_id: string;
  home_team_id?: string;
  away_team_id?: string;
  match_time?: number;
  status_id: number;
  home_scores?: unknown[];
  away_scores?: unknown[];
}

// home_scores/away_scores: [0]=정규시간, [5]=연장 포함 총점, [6]=승부차기(절대 합산 금지).
// lightsail-worker/football-match-collector.js 의 finalScore 와 동일해야 한다 — 연장 경기에서
// [0]만 쓰면 연장 스코어가 90분 스코어로 되덮인다(2026-07-20 WC 결승 사고).
function finalScore(arr: unknown): number | undefined {
  if (!Array.isArray(arr)) return undefined;
  const reg = Number(arr[0]);
  const ot = Number(arr[5]);
  if (!Number.isFinite(reg)) return undefined;
  return Number.isFinite(ot) && ot > 0 && ot >= reg ? ot : reg;
}

async function tsGet(path: string, params: Record<string, string>): Promise<unknown[]> {
  const q = new URLSearchParams({
    user: process.env.THESPORTS_USER ?? "",
    secret: process.env.THESPORTS_SECRET ?? "",
    ...params,
  });
  const r = await fetch(`${TS_BASE}/${path}?${q}`);
  if (!r.ok) throw new Error(`ts ${path} HTTP ${r.status}`);
  const j = (await r.json()) as { results?: unknown[] };
  return Array.isArray(j.results) ? j.results : [];
}

type Action =
  | { kind: "ok-mapped"; teamId: number }
  | { kind: "reuse-tsid"; teamId: number; via: string }
  | { kind: "reuse-name"; teamId: number; via: string }
  | { kind: "create"; name: string }
  | { kind: "conflict"; detail: string }
  | { kind: "skip"; detail: string };

async function processLeague(
  code: string,
  days: number,
  write: boolean,
  country?: string,
  season?: { uuid?: string },
) {
  if (SKIP_LEAGUES.has(code)) {
    console.log(`\n■ ${code} — ESPN/api-football 수집 담당 대회. ts 로 넣으면 크로스소스 중복. 건너뜀`);
    return;
  }
  const entry = (tsLeagueMap as Array<{ code: string; tsId?: string }>).find((e) => e.code === code);
  if (!entry?.tsId) {
    console.log(`\n■ ${code} — league-id-mapping.json 에 tsId 가 없다. 온보딩부터 필요. 건너뜀`);
    return;
  }

  // 1. 매치 수집 — 기본은 향후 N일 diary sweep, --season 이면 시즌 전체(종료 경기 포함)
  const matches: DiaryMatch[] = [];
  const keep = (m: DiaryMatch) =>
    // 0=Abnormal·13=TBD 는 컬렉터와 동일하게 제외 (유령 row 방지)
    m.competition_id === entry.tsId && m.status_id !== 0 && m.status_id !== 13 &&
    Boolean(m.home_team_id) && Boolean(m.away_team_id);
  let scope: string;
  if (season) {
    const uuid = season.uuid ?? (entry as { tsSeasonId?: string }).tsSeasonId;
    if (!uuid) {
      console.log(`\n■ ${code} — tsSeasonId 가 없다. --season <uuid> 로 직접 지정하라. 건너뜀`);
      return;
    }
    const rows = (await tsGet("match/season/recent", { uuid })) as DiaryMatch[];
    for (const m of rows) if (keep(m)) matches.push(m);
    scope = `시즌 ${uuid} 전체`;
  } else {
    for (let d = 0; d < days; d++) {
      const date = new Date(Date.now() + d * 86400_000).toISOString().slice(0, 10).replace(/-/g, "");
      const rows = (await tsGet("match/diary", { date })) as DiaryMatch[];
      for (const m of rows) if (keep(m)) matches.push(m);
      await sleep(CALL_GAP_MS);
    }
    scope = `향후 ${days}일`;
  }
  const teamIds = [...new Set(matches.flatMap((m) => [m.home_team_id!, m.away_team_id!]))];
  console.log(`\n■ ${code} — ${scope} 매치 ${matches.length}건 · 팀 ${teamIds.length}개`);
  if (teamIds.length === 0) return;

  // 2. 팀별 판정
  const [nsRows, anyRows, allTeams] = await Promise.all([
    prisma.teamSourceId.findMany({
      where: { league: code, source: "thesports", externalId: { in: teamIds } },
      select: { externalId: true, teamId: true },
    }),
    prisma.teamSourceId.findMany({
      where: { source: "thesports", externalId: { in: teamIds } },
      select: { externalId: true, teamId: true, league: true, team: { select: { name: true } } },
      orderBy: { id: "asc" },
    }),
    prisma.team.findMany({ select: { id: true, name: true, league: true } }),
  ]);
  const nsMap = new Map(nsRows.map((r) => [r.externalId, r.teamId]));
  const anyMap = new Map<string, { teamId: number; via: string }>();
  for (const r of anyRows) {
    if (r.league === code || anyMap.has(r.externalId)) continue;
    anyMap.set(r.externalId, { teamId: r.teamId, via: `${r.league}:${r.team.name}` });
  }
  const byNorm = new Map<string, { id: number; name: string; league: string }[]>();
  for (const t of allTeams) {
    const k = norm(t.name);
    if (!k) continue;
    (byNorm.get(k) ?? byNorm.set(k, []).get(k)!).push(t);
  }

  const plan = new Map<string, Action>();
  for (const ext of teamIds) {
    const existing = nsMap.get(ext);
    const reuse = anyMap.get(ext);
    if (existing != null) {
      // 이미 이 네임스페이스에 있음 — 단 타 네임스페이스와 다른 팀을 가리키면 사람 판단
      if (reuse && reuse.teamId !== existing) {
        plan.set(ext, { kind: "conflict", detail: `네임스페이스 간 상이 — ${code}=#${existing} vs ${reuse.via}=#${reuse.teamId}` });
      } else {
        plan.set(ext, { kind: "ok-mapped", teamId: existing });
      }
      continue;
    }
    if (reuse) {
      plan.set(ext, { kind: "reuse-tsid", teamId: reuse.teamId, via: reuse.via });
      continue;
    }
    // 이름 조회 (미매핑 팀만 ts 호출)
    const info = (await tsGet("team/additional/list", { uuid: ext })) as Array<{ name?: string }>;
    await sleep(CALL_GAP_MS);
    const name = info[0]?.name?.trim();
    if (!name) {
      plan.set(ext, { kind: "skip", detail: "ts 팀 이름 조회 실패" });
      continue;
    }
    const hits = byNorm.get(norm(name)) ?? [];
    if (hits.length === 1) plan.set(ext, { kind: "reuse-name", teamId: hits[0].id, via: `${hits[0].league}:${hits[0].name}` });
    else if (hits.length > 1)
      plan.set(ext, { kind: "skip", detail: `이름 후보 ${hits.length}개(${hits.map((h) => h.league).join(",")}) — 사람 판단` });
    else plan.set(ext, { kind: "create", name });
  }

  const count = (k: Action["kind"]) => [...plan.values()].filter((a) => a.kind === k).length;
  console.log(
    `  판정 — 기매핑 ${count("ok-mapped")} · 재사용(tsId) ${count("reuse-tsid")} · 재사용(이름) ${count("reuse-name")} · 신규 ${count("create")} · 보류 ${count("skip")} · 충돌 ${count("conflict")}`,
  );
  for (const [ext, a] of plan) {
    if (a.kind === "reuse-name") console.log(`   [이름재사용] ${ext} → ${a.via}`);
    if (a.kind === "create") console.log(`   [신규] ${ext} ${a.name}`);
    if (a.kind === "skip") console.log(`   [보류] ${ext} ${a.detail}`);
    if (a.kind === "conflict") console.log(`   [충돌] ${ext} ${a.detail}`);
  }

  if (!write) {
    console.log(`  DRY-RUN — 적용하려면 --write`);
    return;
  }

  // 3. 적용 — 신규 생성 + 네임스페이스 매핑 upsert (기매핑·보류·충돌은 손대지 않음)
  let created = 0;
  let mapped = 0;
  for (const [ext, a] of plan) {
    let teamId: number | undefined;
    if (a.kind === "reuse-tsid" || a.kind === "reuse-name") teamId = a.teamId;
    else if (a.kind === "create") {
      const t = await prisma.team.upsert({
        where: { league_externalId: { league: code, externalId: `ts-${ext}` } },
        create: { league: code, externalId: `ts-${ext}`, name: a.name, ...(country ? { country } : {}) },
        update: {},
      });
      teamId = t.id;
      created++;
    } else continue;
    await prisma.teamSourceId.upsert({
      where: { league_source_externalId: { league: code, source: "thesports", externalId: ext } },
      create: { league: code, source: "thesports", externalId: ext, teamId: teamId! },
      update: {}, // 기존 값은 덮지 않는다 — 충돌은 위에서 이미 걸렀다
    });
    mapped++;
  }
  console.log(`  적용 — 팀 신규 ${created} · 매핑 ${mapped}건`);

  // 4. 검증 — 컬렉터와 같은 형식으로 내부 라우트에 POST (다음 주기를 기다리지 않는다)
  const site = (process.env.SITE_URL || "https://www.scorebase.kr").replace("://scorebase.kr", "://www.scorebase.kr");
  const payload = matches.map((m) => ({
    league: code,
    tsMatchId: m.id,
    tsHomeTeamId: m.home_team_id!,
    tsAwayTeamId: m.away_team_id!,
    startTime: new Date((m.match_time || 0) * 1000).toISOString(),
    status: mapStatus(m.status_id),
    // 종료 경기를 스코어 없이 넣으면 카드에 "null : null" 이 남는다. 라우트는 SCHEDULED 면
    // 스코어를 알아서 버리므로 항상 실어 보내면 된다(컬렉터와 동일).
    homeScore: finalScore(m.home_scores),
    awayScore: finalScore(m.away_scores),
  }));
  let upserted = 0;
  let skippedNoTeam = 0;
  for (let i = 0; i < payload.length; i += POST_CHUNK) {
    const r = await fetch(`${site}/api/internal/thesports-matches`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INTERNAL_API_TOKEN}` },
      body: JSON.stringify({ sport: "football", matches: payload.slice(i, i + POST_CHUNK) }),
    });
    const j = (await r.json()) as { upserted?: number; skippedNoTeam?: number };
    upserted += j.upserted ?? 0;
    skippedNoTeam += j.skippedNoTeam ?? 0;
  }
  console.log(`  검증 POST — upserted ${upserted} · skippedNoTeam ${skippedNoTeam}${skippedNoTeam > 0 ? " ⚠ 보류·충돌 팀의 매치" : " ✓"}`);
}

async function main() {
  const leagues = (arg("league") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (leagues.length === 0) {
    console.log("사용법: npm run backfill:cup-teams -- --league FA_CUP[,SUI_CUP] [--days 28 | --season [uuid]] [--write] [--country \"England\"]");
    process.exit(1);
  }
  const days = Number(arg("days") ?? 28);
  const write = has("write");
  const country = arg("country");
  const season = has("season") ? { uuid: arg("season") } : undefined;
  if (season && leagues.length > 1 && season.uuid) {
    console.log("--season 에 uuid 를 직접 줄 때는 리그를 하나만 지정하라 (시즌 uuid 는 대회별로 다르다).");
    process.exit(1);
  }
  console.log(
    `컵 팀 매핑 백필 — ${leagues.join(", ")} · ${season ? (season.uuid ? `시즌 ${season.uuid}` : "매핑된 시즌 전체") : `sweep ${days}일`} · ${write ? "WRITE" : "DRY-RUN"}`,
  );
  for (const code of leagues) await processLeague(code, days, write, country, season);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("실패:", e);
  process.exit(1);
});
