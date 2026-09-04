// 리그 순위표 임베드 위젯 — 외부 블로그가 iframe 으로 붙이는 화면(사이트 chrome 없음).
// URL: /embed/standings?league=EPL&rows=10&theme=light|dark
// 종목 통합 행은 lib/standings/public-standings (공개 API 와 동일) — 축구·야구·농구·배구·NHL.
// 승점 종목은 승/무/패/득실/승점, 승률 종목(야구·농구)은 승/패/승률/게임차 열로 그린다.
import type { Metadata } from "next";
import { Fragment } from "react";
import { buildPublicStandings, PUBLIC_STANDINGS_LEAGUES } from "@/lib/standings/public-standings";
import TeamBadge from "@/components/TeamBadge";

export const revalidate = 600;

const SITE_URL = process.env.SITE_URL ?? "https://www.scorebase.kr";

export const metadata: Metadata = {
  title: "리그 순위표 위젯",
  robots: { index: false, follow: true },
};

export default async function StandingsEmbed({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";
  const leagueRaw = one("league").toUpperCase();
  const league = PUBLIC_STANDINGS_LEAGUES.has(leagueRaw) ? leagueRaw : "EPL";
  const rowsMax = Math.min(Math.max(Number(one("rows")) || 10, 3), 40);
  const dark = one("theme") === "dark";

  let data: Awaited<ReturnType<typeof buildPublicStandings>> = null;
  try {
    data = await buildPublicStandings(league);
  } catch {
    // 빌드 프리렌더 중 Neon 연결 실패 대비 — 빈 표로 렌더, revalidate 로 다음에 채움.
  }
  const ok = data && data !== "unavailable" ? data : null;
  const rows = ok ? ok.rows.slice(0, rowsMax) : [];
  const label = ok?.leagueLabel ?? league;
  const winPct = ok?.metric === "winPct";
  const hasDraw = rows.some((r) => r.draw > 0);
  const grouped = rows.some((r) => r.group);

  const wrap = dark ? "bg-neutral-950 text-neutral-100" : "bg-white text-neutral-900";
  const sub = dark ? "text-neutral-400" : "text-neutral-500";
  const line = dark ? "border-neutral-800" : "border-neutral-200";
  const th = `py-1 text-right font-medium`;

  return (
    <div className={`${wrap} min-h-screen px-3 py-3 font-sans text-[13px]`}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h1 className="text-[15px] font-bold tracking-tight">{label} 순위</h1>
        <a
          href={`${SITE_URL}/leagues/${league}`}
          target="_blank"
          rel="noopener"
          className={`text-[11px] ${sub} hover:underline`}
        >
          제공: 스코어베이스 →
        </a>
      </div>
      {rows.length === 0 ? (
        <p className={`py-6 text-center ${sub}`}>순위 데이터를 준비 중입니다.</p>
      ) : (
        <table className="w-full border-collapse tabular-nums">
          <thead>
            <tr className={`border-b ${line} text-[11px] ${sub}`}>
              <th className="py-1 pr-1 text-left font-medium">#</th>
              <th className="py-1 text-left font-medium">팀</th>
              <th className={th}>경기</th>
              <th className={th}>승</th>
              {(!winPct || hasDraw) && <th className={th}>무</th>}
              <th className={th}>패</th>
              {winPct ? (
                <>
                  <th className={th}>승률</th>
                  <th className={`${th} pl-1`}>게임차</th>
                </>
              ) : (
                <>
                  <th className={th}>득실</th>
                  <th className={`${th} pl-1 font-semibold`}>승점</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const newGroup = grouped && (i === 0 || rows[i - 1].group !== r.group);
              return (
                <Fragment key={r.id}>
                  {newGroup && (
                    <tr key={`g-${r.group}`}>
                      <td colSpan={8} className={`pt-2 pb-0.5 text-[11px] font-semibold ${sub}`}>{r.group}</td>
                    </tr>
                  )}
                  <tr key={r.id} className={`border-b ${line}`}>
                    <td className={`py-1.5 pr-1 ${sub}`}>{r.position}</td>
                    <td className="py-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <TeamBadge logoUrl={r.logoUrl} size={16} />
                        <span className="truncate">{r.team}</span>
                      </span>
                    </td>
                    <td className="py-1.5 text-right">{r.played}</td>
                    <td className="py-1.5 text-right">{r.won}</td>
                    {(!winPct || hasDraw) && <td className="py-1.5 text-right">{r.draw}</td>}
                    <td className="py-1.5 text-right">{r.loss}</td>
                    {winPct ? (
                      <>
                        <td className="py-1.5 text-right">{r.winPct != null ? r.winPct.toFixed(3).replace(/^0/, "") : "-"}</td>
                        <td className="py-1.5 pl-1 text-right">{r.gamesBehind == null ? "-" : r.gamesBehind}</td>
                      </>
                    ) : (
                      <>
                        <td className="py-1.5 text-right">
                          {r.difference != null ? (r.difference > 0 ? `+${r.difference}` : r.difference) : "-"}
                        </td>
                        <td className="py-1.5 pl-1 text-right font-semibold">{r.points}</td>
                      </>
                    )}
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
