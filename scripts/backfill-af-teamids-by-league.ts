// 리그 단위로 api-football team id ↔ 우리 Team 을 대조해 TeamSourceId 에 backfill.
//
// 배경: /scores 는 DB 매치(ts) + af 날짜조회 orphan 을 합쳐 그리고, 판정(lib/sports/orphan-dedup)이
//       이름 대조에 기대는 축이 있다. 두 소스가 팀을 아주 다른 이름으로 부르면(별명 "Jaiba Brava",
//       약어 "UDG", 구 팀명) 이름 규칙으로는 영구히 안 풀린다 — af 팀 ID 를 등록해 [teamId] 축으로
//       확정 판정하게 만드는 게 근본 해법. CHINA_3 를 이 방식으로 닫았고(2026-08-16), 감사에
//       추가한 [사각지대] 경보가 찍은 나머지 리그에 같은 처방을 일반화한 것.
//
// 매칭은 **확실한 것만** 자동 등록한다 — 영구 저장이라 오매칭이 중복보다 나쁘다.
//   ① 정규화 이름 / 로마자 / 토큰정렬 키가 완전 일치        → auto
//   ② 한쪽이 다른 쪽을 포함(3자 이상) + 양방향 1:1          → auto
//   ③ af venue.city 가 우리 팀명에 들어감 + 양방향 1:1      → auto  (연고이전으로 이름만 옛것인 경우)
//   그 외는 [보류] 로 출력만 하고 넣지 않는다(사람이 판단).
//
// 사용:
//   npx tsx --env-file=.env.local scripts/backfill-af-teamids-by-league.ts MEXICO_2 WK_LEAGUE
//   npx tsx --env-file=.env.local scripts/backfill-af-teamids-by-league.ts MEXICO_2 --apply
import "@/lib/env";
import axios from "axios";
import { prisma } from "@/lib/db";
import { API_FOOTBALL_LEAGUE_ID } from "@/lib/sports/api-football-pro";
import { normalizeTeamName, romanizeTeamName, tokenSortKey } from "@/lib/sports/orphan-dedup";

const APPLY = process.argv.includes("--apply");
const SEASON = Number(process.env.AF_SEASON ?? 2026);

interface AfTeam {
  id: string;
  name: string;
  city: string | null;
}

async function fetchAfTeams(leagueId: number): Promise<AfTeam[]> {
  const { data } = await axios.get("https://v3.football.api-sports.io/teams", {
    params: { league: leagueId, season: SEASON },
    headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY! },
  });
  // 분당 한도는 HTTP 200 + errors 로 온다 — 빈 배열을 "팀 없음"으로 오해하면 안 된다.
  const errs = data.errors;
  if (errs && (Array.isArray(errs) ? errs.length : Object.keys(errs).length)) {
    throw new Error(`af teams(league=${leagueId}) errors: ${JSON.stringify(errs)}`);
  }
  return (data.response ?? []).map((r: { team: { id: number; name: string }; venue?: { city?: string } }) => ({
    id: String(r.team.id),
    name: r.team.name,
    city: r.venue?.city ?? null,
  }));
}

// 자동 규칙이 못 잡는 확정 짝 — 약어·별명·연고이전이라 이름으로는 영영 안 붙는다.
// 근거는 ①af venue.city ②같은 날 경기 대조(양팀 중 나머지가 확정되면 남은 짝도 확정)
// ③리그 팀 수 1:1 소거. 셋 중 하나라도 없으면 넣지 않는다.
const MANUAL: Record<string, { af: string; ourId: number; note: string }[]> = {
  ARG_PRIMERA_NACIONAL: [
    { af: "448", ourId: 607820, note: "Colon Santa Fe → Colon de Santa Fe (전치사)" },
    { af: "461", ourId: 607802, note: "San Martin S.J. → San Martin San Juan (약어, city=San Juan)" },
    { af: "465", ourId: 607804, note: "Atletico DE Rafaela → Atletico Rafaela (전치사)" },
    { af: "470", ourId: 607822, note: "Ferro Carril Oeste → Ferrol Carril Oeste (우리 쪽 표기 Ferrol)" },
    { af: "1936", ourId: 607799, note: "CA Estudiantes → Estudiantes de Caseros (city=Caseros)" },
    { af: "1957", ourId: 607817, note: "Racing Cordoba → Racing de Cordoba (전치사)" },
  ],
  MEXICO_2: [
    { af: "2307", ourId: 611754, note: "Leones Negros UDG → Leones Negros de la U. de G. (약어)" },
    { af: "2313", ourId: 611751, note: "Correcaminos Uat → Correcaminos de la U.A.T. (약어)" },
    { af: "19905", ourId: 607885, note: "CDS Tampico Madero → Club Jaiba Brava (별명, city=Tampico y Ciudad Madero)" },
  ],
  UZBEKISTAN_SL: [
    { af: "4209", ourId: 611741, note: "Andijan → FK Andijon (철자)" },
    { af: "4213", ourId: 611749, note: "Mash'al → Mashal Muborak (아포스트로피, city=Mubarek)" },
  ],
  // WK리그는 af 가 구 연고를 유지한다. 8/21 경기 대조로 전부 확정 —
  // af "Incheon vs Boeun Sangmu" = DB "Incheon vs Mungyeong Sangmu",
  // af "Gumi Sportstoto vs Changnyeong" = DB "Sejong Sportstoto vs Gangjin Swans".
  WK_LEAGUE: [
    { af: "14372", ourId: 612270, note: "Boeun Sangmu W → Mungyeong Sangmu WFC (연고이전, 8/21 경기 대조)" },
    { af: "14373", ourId: 612271, note: "Changnyeong W → Gangjin Swans Women (연고이전, 8/21 경기 대조)" },
    { af: "14374", ourId: 612272, note: "Gumi Sportstoto W → Sejong Sportstoto WFC (연고이전, 8/21 경기 대조)" },
    { af: "14375", ourId: 612268, note: "Gyeongju W → Gyeongju Korea Hydro & Nuclear Power WFC" },
    { af: "14377", ourId: 612266, note: "Incheon Red Angels W → Incheon Hyundai Steel Red Angels Women" },
    { af: "14378", ourId: 612267, note: "Seoul W → Seoul Amazones Women" },
  ],
};

const keysOf = (s: string) => [normalizeTeamName(s), romanizeTeamName(s), tokenSortKey(s)];

/** 이름 3키 중 하나라도 완전 일치. */
function exactHit(a: string, b: string): boolean {
  const [an, ar, at] = keysOf(a);
  const [bn, br, bt] = keysOf(b);
  return (an && an === bn) || (ar && ar === br) || (at && at === bt) ? true : false;
}

/** 한쪽이 다른 쪽을 포함(3자 이상) — 약어·풀네임 차이 흡수. */
function substrHit(a: string, b: string): boolean {
  const [, ar] = keysOf(a);
  const [, br] = keysOf(b);
  return ar.length >= 3 && br.length >= 3 && (ar.includes(br) || br.includes(ar));
}

/** af 연고지가 우리 팀명 안에 있는지 — 이름만 옛것인 연고이전 케이스. */
function cityHit(city: string | null, ourName: string): boolean {
  if (!city) return false;
  const c = romanizeTeamName(city);
  return c.length >= 4 && romanizeTeamName(ourName).includes(c);
}

async function runLeague(league: string) {
  const leagueId = (API_FOOTBALL_LEAGUE_ID as Record<string, number>)[league];
  if (!leagueId) {
    console.log(`\n### ${league} — af 리그 id 없음, 건너뜀`);
    return;
  }
  const [afTeams, ourTeams] = await Promise.all([
    fetchAfTeams(leagueId),
    prisma.team.findMany({
      where: { league },
      select: { id: true, name: true, sourceIds: { select: { source: true, externalId: true } } },
    }),
  ]);
  const mappedAf = new Set(
    ourTeams.flatMap((t) => t.sourceIds.filter((s) => s.source === "api-football").map((s) => s.externalId)),
  );
  console.log(`\n### ${league} (af ${leagueId}, season ${SEASON}) — af ${afTeams.length}팀 · DB ${ourTeams.length}팀 · 기매핑 ${mappedAf.size}`);

  // 후보 수집 — 단계를 낮은 확신도로 내려가며, 이미 짝지어진 쪽은 제외한다.
  const takenAf = new Set(mappedAf);
  const takenOur = new Set(
    ourTeams.filter((t) => t.sourceIds.some((s) => s.source === "api-football")).map((t) => t.id),
  );
  const decided: { af: AfTeam; our: (typeof ourTeams)[number]; how: string }[] = [];

  // 수동 확정 짝을 가장 먼저 소비 — 자동 규칙이 이 팀들을 다른 짝에 써버리지 않게 한다.
  for (const p of MANUAL[league] ?? []) {
    const a = afTeams.find((x) => x.id === p.af);
    const o = ourTeams.find((x) => x.id === p.ourId);
    if (!a || !o) {
      console.log(` [건너뜀] 수동 짝이 이번 시즌 명단에 없음 — af ${p.af} / our ${p.ourId} (${p.note})`);
      continue;
    }
    if (takenAf.has(a.id) || takenOur.has(o.id)) continue;
    takenAf.add(a.id);
    takenOur.add(o.id);
    decided.push({ af: a, our: o, how: `manual: ${p.note}` });
  }

  const stages: [string, (a: AfTeam, o: (typeof ourTeams)[number]) => boolean][] = [
    ["exact", (a, o) => exactHit(a.name, o.name)],
    ["substr", (a, o) => substrHit(a.name, o.name)],
    ["city", (a, o) => cityHit(a.city, o.name)],
  ];
  for (const [how, hit] of stages) {
    const pending = afTeams.filter((a) => !takenAf.has(a.id));
    for (const a of pending) {
      const cands = ourTeams.filter((o) => !takenOur.has(o.id) && hit(a, o));
      if (cands.length !== 1) continue;
      const o = cands[0];
      // 역방향 1:1 — 그 우리 팀에 걸리는 af 후보도 하나뿐이어야 한다.
      const back = pending.filter((x) => !takenAf.has(x.id) && hit(x, o));
      if (back.length !== 1) continue;
      takenAf.add(a.id);
      takenOur.add(o.id);
      decided.push({ af: a, our: o, how });
    }
  }

  for (const d of decided) {
    console.log(`${APPLY ? " insert" : " (dry)"} [${d.how}] af ${d.af.id} "${d.af.name}"${d.af.city ? ` (${d.af.city})` : ""} → ${d.our.name} (${d.our.id})`);
    if (APPLY) {
      await prisma.teamSourceId.upsert({
        where: { league_source_externalId: { league, source: "api-football", externalId: d.af.id } },
        update: {},
        create: { league, source: "api-football", externalId: d.af.id, teamId: d.our.id },
      });
    }
  }
  const restAf = afTeams.filter((a) => !takenAf.has(a.id));
  const restOur = ourTeams.filter((o) => !takenOur.has(o.id));
  if (restAf.length || restOur.length) {
    console.log(` [보류] af ${restAf.length}팀 · DB ${restOur.length}팀 — 자동 판정 불가, 눈으로 확인할 것`);
    for (const a of restAf) console.log(`    af   ${a.id} "${a.name}"${a.city ? ` (${a.city})` : ""}`);
    for (const o of restOur) console.log(`    DB   ${o.id} "${o.name}"`);
  }
  console.log(` → ${APPLY ? "등록" : "등록 예정"} ${decided.length}건 · 보류 ${restAf.length}건`);
}

(async () => {
  const leagues = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!leagues.length) {
    console.log("리그 코드를 인자로 주세요. 예: MEXICO_2 WK_LEAGUE");
    return;
  }
  for (const lg of leagues) await runLeague(lg);
  console.log(`\n${APPLY ? "적용 완료" : "dry-run — 반영하려면 --apply"}`);
  await prisma.$disconnect();
})();
