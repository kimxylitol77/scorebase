// 향후 경기 + AI 승률 임베드 위젯 — 외부 블로그가 iframe 으로 붙이는 화면(사이트 chrome 없음).
// URL: /embed/fixtures?league=EPL&days=7&limit=10&theme=light|dark
// 리그 페이지와 같은 Match.predHome/Draw/Away 를 막대로 보여준다. 전 리그 가능.
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { ALL_LEAGUES, LEAGUE_DISPLAY, SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";
import { toKoreanTeamName } from "@/lib/team-names";
import TeamBadge from "@/components/TeamBadge";

export const revalidate = 300;

const SITE_URL = process.env.SITE_URL ?? "https://www.scorebase.kr";
const LEAGUE_SET = new Set<string>(ALL_LEAGUES as readonly string[]);
const KST = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
});

export const metadata: Metadata = {
  title: "경기 일정 · AI 승률 위젯",
  robots: { index: false, follow: true },
};

interface Row {
  id: number;
  startTime: Date;
  status: string;
  home: string; away: string;
  homeLogo: string | null; awayLogo: string | null;
  homeScore: number | null; awayScore: number | null;
  pH: number | null; pD: number | null; pA: number | null;
}

export default async function FixturesEmbed({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";
  const leagueRaw = one("league").toUpperCase();
  const league = LEAGUE_SET.has(leagueRaw) ? leagueRaw : "EPL";
  const days = Math.min(Math.max(Number(one("days")) || 7, 1), 30);
  const limit = Math.min(Math.max(Number(one("limit")) || 10, 1), 30);
  const dark = one("theme") === "dark";
  const label = LEAGUE_DISPLAY[league] ?? league;
  const hasDraw = (SOCCER_LEAGUES as Set<string>).has(league);

  let rows: Row[] = [];
  try {
    const now = Date.now();
    const ms = await prisma.match.findMany({
      where: {
        league,
        startTime: { gte: new Date(now - 3 * 3600_000), lte: new Date(now + days * 86400_000) },
        status: { in: ["SCHEDULED", "LIVE"] },
      },
      orderBy: { startTime: "asc" },
      take: limit,
      select: {
        id: true, startTime: true, status: true, homeScore: true, awayScore: true,
        predHome: true, predDraw: true, predAway: true,
        homeTeam: { select: { name: true, logoUrl: true } },
        awayTeam: { select: { name: true, logoUrl: true } },
      },
    });
    rows = ms.map((m) => ({
      id: m.id, startTime: m.startTime, status: m.status,
      home: toKoreanTeamName(m.homeTeam.name, league), away: toKoreanTeamName(m.awayTeam.name, league),
      homeLogo: m.homeTeam.logoUrl ?? null, awayLogo: m.awayTeam.logoUrl ?? null,
      homeScore: m.homeScore, awayScore: m.awayScore,
      pH: m.predHome, pD: hasDraw ? m.predDraw : null, pA: m.predAway,
    }));
  } catch {
    // 빌드 프리렌더 중 Neon 연결 실패 대비 — 빈 목록으로 렌더, revalidate 로 다음에 채움.
  }

  const wrap = dark ? "bg-neutral-950 text-neutral-100" : "bg-white text-neutral-900";
  const sub = dark ? "text-neutral-400" : "text-neutral-500";
  const line = dark ? "border-neutral-800" : "border-neutral-200";
  const track = dark ? "bg-neutral-800" : "bg-neutral-100";
  const pct = (v: number | null) => (v == null ? null : Math.round(v * 100));

  return (
    <div className={`${wrap} min-h-screen px-3 py-3 font-sans text-[13px]`}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h1 className="text-[15px] font-bold tracking-tight">{label} 경기 · AI 승률</h1>
        <a href={`${SITE_URL}/leagues/${league}`} target="_blank" rel="noopener" className={`text-[11px] ${sub} hover:underline`}>
          제공: 스코어베이스 →
        </a>
      </div>
      {rows.length === 0 ? (
        <p className={`py-6 text-center ${sub}`}>{days}일 안에 예정된 경기가 없습니다.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const h = pct(r.pH), d = pct(r.pD), a = pct(r.pA);
            const live = r.status === "LIVE";
            return (
              <li key={r.id} className={`rounded-lg border ${line} px-2.5 py-2`}>
                <div className={`mb-1 flex items-center justify-between text-[11px] ${sub}`}>
                  <span>{KST.format(r.startTime)}</span>
                  {live && <span className="font-semibold text-rose-500">LIVE {r.homeScore ?? 0}-{r.awayScore ?? 0}</span>}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex min-w-0 flex-1 items-center gap-1.5">
                    <TeamBadge logoUrl={r.homeLogo} size={16} />
                    <span className="truncate">{r.home}</span>
                  </span>
                  <span className={`px-1 text-[11px] ${sub}`}>vs</span>
                  <span className="inline-flex min-w-0 flex-1 items-center justify-end gap-1.5">
                    <span className="truncate">{r.away}</span>
                    <TeamBadge logoUrl={r.awayLogo} size={16} />
                  </span>
                </div>
                {h != null && a != null ? (
                  <div className="mt-1.5">
                    <div className={`flex h-1.5 overflow-hidden rounded-full ${track}`}>
                      <div className="bg-rose-500" style={{ width: `${h}%` }} />
                      {d != null && <div className="bg-neutral-400" style={{ width: `${d}%` }} />}
                      <div className="bg-sky-500" style={{ width: `${a}%` }} />
                    </div>
                    <div className={`mt-0.5 flex justify-between text-[11px] tabular-nums ${sub}`}>
                      <span>홈 {h}%</span>
                      {d != null && <span>무 {d}%</span>}
                      <span>원정 {a}%</span>
                    </div>
                  </div>
                ) : (
                  <div className={`mt-1 text-[11px] ${sub}`}>AI 예측 준비 중</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
