import { NextResponse } from "next/server";
import { runCollect } from "@/jobs/collect";
import { prisma } from "@/lib/db";
import type { League } from "@/lib/sports/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
  "NBA",
  "NHL",
  "MLB",
  "KBO",
  "NPB",
  "LOL",
];

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

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
  const leagues = leaguesParam
    ? (leaguesParam.split(",").filter(Boolean) as League[])
    : ALL_LEAGUES;
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
