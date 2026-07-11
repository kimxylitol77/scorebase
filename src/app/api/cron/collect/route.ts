import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { runCollect } from "@/jobs/collect";
import { prisma } from "@/lib/db";
import type { League } from "@/lib/sports/types";
import tsLeagueMap from "@/lib/sports/thesports/league-id-mapping.json";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Phase 3c (2026-05-25): TheSports football collector 가 cover 하는 축구 리그는
// api-football collect 에서 skip. ts collector 가 매치 row 만들고 endpoint dedup
// 가드가 ts: prefix 매치 중복 차단. api-football quota 70%+ 절약.
//
// 미커버 16 (api-football collector 계속 사용): EFL_CUP, SUI_CUP, UEFA_NL,
// INTL_FRIENDLY, EURO_QUAL, BELARUS_PL, K3/K4_LEAGUE, PARAGUAY_PD, VIETNAM_VL2,
// A_LEAGUE_W, OLYMPICS_FOOTBALL, KFA_CUP(id 294 활성화 2026-05-25), BRASILEIRAO_2 등.
//
// 야구/농구/하키 등 비-축구 리그는 TS_COVERED 에 없으므로 filter 통과 — 영향 X.
const TS_COVERED = new Set(
  (tsLeagueMap as Array<{ code: string; tsSeasonId?: string }>)
    .filter((e) => e.tsSeasonId)
    .map((e) => e.code),
);
// TS_COVERED 분류지만 실제로는 ts collector 가 매치를 안 만드는 리그 — af 수집 유지.
// K_LEAGUE_1 (2026-06-10): ts- 매치 0건인데 skip 돼 미래 일정 공백 → 경기 당일에야
// af 매치 생성 → PREVIEW(3일 전)·predict 전무 → 리그 페이지 적중률 0건이던 원인.
// PREVIEW_LEAGUES 인데 일정 공백이 생기면 여기 추가.
//
// ⚠️ IIHF_WC 는 이 방식으로 못 고친다 (2026-06-10 진단): 아이스하키라 TS_COVERED(축구
// 매핑) 분류 밖 + af collector·ALL_LEAGUES 미등록이라 여기 넣어도 무효. 매치 소스는
// ts ice_hockey worker 인데 당일/사후 수집만 해 2026 대회 30경기가 미래 리드타임 0
// → predict 4건·채점 0. 2027 대회(5월) 전에 ts worker 의 미래 일정 커버를 점검할 것.
//
// YKKONEN·LATVIA_VL (2026-06-13): af 소스 매치인데 ts 매치↔af row 연결이 거의 실패
// (최근 30일 cache 연결 4%·48%) → af 수집까지 skip 되면 결과 갱신 경로가 전무, 매 경기일
// stale SCHEDULED → cleanup verify 가 6h 후 뒷수습하는 패턴 반복 (6/12~13 알림 5건).
// 같은 증상 후보: ESTONIA_ML·LITHUANIA_AL·GEORGIA_EL·SINGAPORE_PL — 알림 재발 시 추가.
//
// BELARUS_PL·KAZAKHSTAN_PL (2026-06-14): 같은 패턴 재발. cleanup-stale-scheduled 알림에서
// 3경기(#316277·#316278·#316807)가 startTime 동결(6/13→6/14 연기 누락)로 발견 — 매치의
// 96%+ 가 af 생성(BELARUS 238/247·KAZAKHSTAN 240/241, ts 는 9·1건뿐)인데 TS_COVERED 로
// af 수집이 skip 돼 5/25 이후 갱신 경로 전무. ts 워커가 실커버리지를 못 채우므로 af 수집 유지.
// ECUADOR_LP (2026-07-09): 동일 패턴. stale-cleanup 알림 8경기가 startTime 동결
// (07-05→07-10~12 연기 누락)로 발견 — ts 부분커버(29/251)라 ts 미생성 매치는 af skip 으로
// 갱신 경로 없음. api-football verify 결과 전부 NS(미래) = false positive 였으나 근본 = af 재개.
const TS_COVERED_EXCEPTIONS = new Set<League>([
  "K_LEAGUE_1", "YKKONEN", "LATVIA_VL", "BELARUS_PL", "KAZAKHSTAN_PL",
  "ECUADOR_LP",
]);

const ALL_LEAGUES: League[] = [
  "EPL",
  "LALIGA",
  "BUNDESLIGA",
  "SERIE_A",
  "LIGUE_1",
  "MLS",
  "UCL",
  "K_LEAGUE_1",
  "K_LEAGUE_2",
  "J1_LEAGUE",
  "J2_LEAGUE",
  "AFC_CL",
  "SAUDI_PL",
  "UEL",
  "UECL",
  "CHAMPIONSHIP",
  "LALIGA_2",
  "BUNDESLIGA_2",
  "SERIE_B",
  "LIGUE_2",
  "CLUB_WORLD_CUP",
  "AFC_CL_TWO",
  "AFC_U23",
  "CSL",
  "A_LEAGUE",
  "EREDIVISIE",
  "PRIMEIRA_LIGA",
  "SUPER_LIG",
  "JUPILER_PL",
  "SPL",
  "SCO_LEAGUE_CUP", // 스코틀랜드 리그컵 (af 185, 2026 시즌 진행 중)
  "GREEK_SL",
  "BRASILEIRAO",
  "LIGA_MX",
  "COPA_LIB",
  "COPA_SUD",
  "EKSTRAKLASA",
  "POLAND_1L",
  "BULGARIA_PL",
  "LIGA_I",
  "SWISS_SL",
  "CHALLENGE_LEAGUE",
  "ARMENIA_PL",
  "AUSTRIA_BL",
  "CZECH_L",
  "HNL",
  "UKRAINE_PL",
  "HUNGARY_NB1",
  "SERBIA_SL",
  "SLOVAKIA_SL",
  "SLOVENIA_SNL",
  "CYPRUS_1D",
  "DENMARK_SL",
  "IRELAND_PD",
  "BOSNIA_PL",
  "ALBANIA_SL",
  "MOLDOVA_SL",
  "ELITESERIEN",
  "NORWAY_1L",
  "ALLSVENSKAN",
  "SUPERETTAN",
  "VEIKKAUSLIIGA",
  "YKKONEN",
  "URVALSDEILD",
  "ICELAND_1L",
  "CHILE_PD",
  "CHILE_PB",
  "ECUADOR_LP",
  "COLOMBIA_PA",
  "PERU_PD",
  "VENEZUELA_PD",
  "EGYPT_PL",
  "ISRAEL_PL",
  "INDIA_ISL",
  "VIETNAM_VL1",
  "INDONESIA_L1",
  "SINGAPORE_PL",
  "UAE_PL",
  "QATAR_SL",
  "MOROCCO_BP",
  "SOUTHAFRICA_PSL",
  "USA_USL_CH",
  "CANADA_PL",
  // 2026-05-24 추가 (4개)
  "SUI_CUP",
  "LEAGUE_ONE",
  "LATVIA_VL",
  "BELARUS_PL",
  // 2026-05-24 추가 (2차, 8개)
  "ESTONIA_ML",
  "LITHUANIA_AL",
  "LEVAIN_CUP",
  "KAZAKHSTAN_PL",
  "GEORGIA_EL",
  "AZERBAIJAN_PL",
  "EREDIVISIE_2",
  "PRIMEIRA_LIGA_2",
  "NBA",
  "NHL",
  "MLB",
  "KBO",
  "NPB",
  "LOL",
  "LCK_CL", // LCK 2군
  "LPL", "LEC", "LCS", // 해외 (표시만) — collect 가 fetchLolAll 1회 캐시 공유
];

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  // ?leagues=K_LEAGUE_1,J1_LEAGUE,... — 부분 수집 (Vercel Hobby 60초 한도 회피용 batch).
  // ?pastDays=N&futureDays=N — 일자 범위 조정 (수동 backfill 용).
  const url = new URL(req.url);
  const leaguesParam = url.searchParams.get("leagues");
  const pastDaysParam = url.searchParams.get("pastDays");
  const futureDaysParam = url.searchParams.get("futureDays");
  const leaguesRaw = leaguesParam
    ? (leaguesParam.split(",").filter(Boolean) as League[])
    : ALL_LEAGUES;
  // Phase 3c — TS cover 축구 리그 skip (야구/농구/하키는 영향 없음).
  // 단 TS_COVERED_EXCEPTIONS 는 ts collector 실커버리지가 없어 af 수집 유지.
  const leagues = leaguesRaw.filter(
    (l) => !TS_COVERED.has(l) || TS_COVERED_EXCEPTIONS.has(l),
  );
  const pastDays = pastDaysParam ? parseInt(pastDaysParam) : 2;
  const futureDays = futureDaysParam ? parseInt(futureDaysParam) : 7;
  try {
    // 어제 + 오늘 + 향후 7일 매치 일정/스코어 수집
    // pastDays=2: 어제 시작·오늘 새벽 끝난 매치의 score/status 보정 (RECAP 잡 트리거에 필수)
    // futureDays=7: 미래 SCHEDULED 매치도 채워서 PREVIEW 잡이 잡아갈 수 있게 함
    await runCollect({ leagues, pastDays, futureDays });
    return NextResponse.json({ ok: true, leagues: leagues.length });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  } finally {
    await prisma.$disconnect();
  }
}
