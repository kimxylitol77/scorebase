// Team.league 라벨을 실제 편성 리그로 교정 — 승격·강등 반영 (기본 dry-run)
//
// 배경: Team.league 는 팀의 주 소속 리그인데 승격·강등을 자동으로 따라오지 않는다.
//   2026-08 실측 — EPL 라벨에 번리·웨스트햄(다음 시즌 챔피언십)이 남아 /injuries·
//   /predictions·/transfers 에 강등팀이 그대로 노출됐다. 분데스 8팀·J2 20팀도 동일.
//   이 라벨은 순위·예측·이적시장·검색·sitemap 등 30개 넘는 파일이 쓴다.
//
// 판정: 다가오는 일정에 팀이 실제로 편성된 리그 중 경기 수가 가장 많은 것.
//   컵·대륙대회·친선은 주 소속이 아니므로 제외한다. 최소 3경기 이상일 때만 판정한다
//   (표본이 적으면 컵 몇 경기로 소속이 뒤집힌다).
//
// 한계: 향후 일정이 없는 팀은 판정할 수 없다. 그중 상당수는 중복 row 다 —
//   같은 팀이 두 id 로 있고 경기는 한쪽에만 붙는다 (Wolverhampton/Wolves,
//   Hull City ×2, 분데스 5팀). 중복 정리는 이 스크립트의 일이 아니다.
//
// 실행: npx tsx --env-file=.env.local scripts/fix-team-league-labels.ts        (dry-run)
//       npx tsx --env-file=.env.local scripts/fix-team-league-labels.ts --apply
import "../src/lib/env";
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";

const prisma = new PrismaClient();

// 컵·대륙대회·친선 — 주 소속 판정에서 제외. 패턴(/CHAMPIONS/ 등)이 아니라 명시 목록인
//  이유는 CHAMPIONSHIP(잉글랜드 2부)·SUPER_LIG(터키 1부)·SUPERETTAN(스웨덴 2부) 같은
//  정규리그가 패턴에 걸려 통째로 빠지기 때문이다 (실측으로 EPL 강등팀을 놓쳤다).
const NOT_LEAGUE = new Set([
  "UCL", "UEL", "UECL", "COPA_LIB", "COPA_SUD", "ASEAN_CHAMP",
  "COPPA_ITALIA", "DFB_POKAL", "EMPEROR_CUP", "SUI_CUP", "SCO_LEAGUE_CUP",
  "CLUB_FRIENDLY", "WORLD_CUP", "INTL_FRIENDLY",
  // 타 종목 친선·단기 토너먼트 — 2026-08-18 dry-run 실측에서 하키 친선이 SLOVAK_EXTRALIGA
  // 팀을, 배구 유로가 EGL_W 팀을 역방향 오교정하려 한 것을 보고 추가.
  "HOCKEY_FRIENDLY", "VB_FRIENDLY", "VB_FRIENDLY_W",
  "VB_EURO_W", "VB_ASIAN_W", "VB_COPA_AM", "VB_NORCECA_W", "VB_PANAM", "VB_U17_WC", "VB_U17_WC_W",
  "NBA_SL",
  "BELARUS_SALEI_CUP", "KAZAKHSTAN_CUP", // 하키 프리시즌 컵 — 주 소속 아님
]);
const MIN_MATCHES = 3;
// 투표 창 = 향후 전체 + 최근 45일. 향후만 보면 일정을 1~2라운드만 미리 올리는 소규모
// 리그의 승격팀이 3경기 문턱을 못 넘어 영영 교정되지 않는다(2026-08-18 Brno CZECH_2 잔존
// 실측). 유럽 구시즌은 5월 종료라 45일 창에 안 들어와 강등 전 시즌 오염도 없다.
const PAST_WINDOW_DAYS = 45;

async function main() {
  const apply = process.argv.includes("--apply");
  const upcoming = await prisma.match.findMany({
    where: { startTime: { gte: new Date(Date.now() - PAST_WINDOW_DAYS * 86400_000) } },
    select: { league: true, homeTeamId: true, awayTeamId: true },
  });

  const byTeam = new Map<number, Map<string, number>>();
  for (const m of upcoming) {
    if (NOT_LEAGUE.has(m.league)) continue;
    for (const tid of [m.homeTeamId, m.awayTeamId]) {
      if (tid == null) continue;
      const per = byTeam.get(tid) ?? new Map<string, number>();
      per.set(m.league, (per.get(m.league) ?? 0) + 1);
      byTeam.set(tid, per);
    }
  }

  const teams = await prisma.team.findMany({ select: { id: true, name: true, league: true } });
  const plan: { id: number; name: string; from: string; to: string; n: number }[] = [];
  let matched = 0, noSchedule = 0, thin = 0;
  for (const t of teams) {
    const per = byTeam.get(t.id);
    if (!per?.size) { noSchedule++; continue; }
    const [best, n] = [...per.entries()].sort((a, b) => b[1] - a[1])[0];
    if (n < MIN_MATCHES) { thin++; continue; }
    if (best === t.league) { matched++; continue; }
    plan.push({ id: t.id, name: t.name, from: t.league, to: best, n });
  }

  console.log(`Team ${teams.length} — 일치 ${matched} · 교정 대상 ${plan.length} · 향후 일정 없음 ${noSchedule} · 표본 부족(<${MIN_MATCHES}) ${thin}`);
  const grouped = new Map<string, typeof plan>();
  for (const p of plan) {
    const k = `${p.from} → ${p.to}`;
    grouped.set(k, [...(grouped.get(k) ?? []), p]);
  }
  for (const [k, v] of [...grouped].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${k} (${v.length}팀): ${v.map((p) => `${p.name}[${p.n}]`).join(" · ")}`);
  }

  if (!apply) {
    console.log("\ndry-run — 적용하려면 --apply");
    await prisma.$disconnect();
    return;
  }

  // 되돌릴 수 있게 현재 값을 남기고 바꾼다.
  const rollback = plan.map((p) => ({ id: p.id, name: p.name, league: p.from }));
  fs.writeFileSync("/tmp/team-league-rollback.json", JSON.stringify(rollback, null, 1));
  console.log("\n롤백 백업: /tmp/team-league-rollback.json");
  let done = 0;
  for (const p of plan) {
    const cur = await prisma.team.findUnique({ where: { id: p.id }, select: { league: true } });
    if (cur?.league !== p.from) { console.log(`  skip ${p.name} — 현재 ${cur?.league}, 계획 ${p.from}`); continue; }
    await prisma.team.update({ where: { id: p.id }, data: { league: p.to } });
    done++;
  }
  console.log(`갱신 ${done}팀`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
