// MLB 예측 탭 — 포스트시즌 확률판. 우승 후보 카드 + 리그별 라운드 진출표(진출 → DS → LCS → WS → 우승).
// 숫자는 mlb-postseason(5분 캐시)의 mlbAdvancementOdds — 대진표 페이지와 같은 Elo·같은 시리즈 확률을 대진 전체로 합산한 값.
import Link from "next/link";
import type { MlbPostseasonPage } from "@/lib/sports/mlb-postseason";
import type { League, TeamOdds } from "@/lib/sports/mlb-postseason-build";

const COLS: Array<{ key: "ds" | "lcs" | "ws" | "champ"; label: string; short: string }> = [
  { key: "ds", label: "디비전 시리즈", short: "DS" },
  { key: "lcs", label: "챔피언십 시리즈", short: "LCS" },
  { key: "ws", label: "월드시리즈", short: "WS" },
  { key: "champ", label: "우승", short: "우승" },
];

function pctText(p: number) {
  if (p >= 0.9995) return "✓";
  if (p <= 0) return "—";
  if (p < 0.001) return "<0.1%";
  return `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`;
}

function Cell({ p, strong }: { p: number; strong?: boolean }) {
  // 확률만큼 진하게 — 0.25 투명도 상한이라 글자는 항상 읽힌다
  const alpha = p >= 0.9995 ? 0.18 : Math.min(0.28, 0.04 + p * 0.3);
  return (
    <td className="px-0.5 py-1.5 text-center sm:px-1">
      <span
        className={`inline-block min-w-[2.6rem] rounded-md px-1 py-1 text-[11px] sm:min-w-[3.1rem] sm:px-1.5 sm:text-xs tabular-nums ${strong ? "font-black" : "font-semibold"} ${
          p <= 0 ? "text-neutral-400" : "text-neutral-900 dark:text-white"
        }`}
        style={p > 0 ? { background: `rgba(16,185,129,${alpha})` } : undefined}
      >
        {pctText(p)}
      </span>
    </td>
  );
}

export default function MlbPostseasonOdds({ page }: { page: MlbPostseasonPage }) {
  const { data, logoById, teamPageById } = page;
  const byId = new Map<number, { name: string; seed: number; wins: number; losses: number; divisionWinner: boolean }>();
  for (const lg of ["AL", "NL"] as const) for (const s of data.seeds[lg]) byId.set(s.id, s);
  const odds = data.odds;
  const top = [...odds].filter((o) => o.champ > 0).sort((a, b) => b.champ - a.champ).slice(0, 4);
  const champion = data.champion;
  const logo = (id: number) => logoById[id];

  const TeamCell = ({ o }: { o: TeamOdds }) => {
    const t = byId.get(o.id);
    const href = teamPageById[o.id] ? `/teams/${teamPageById[o.id]}` : null;
    const inner = (
      <span className="flex min-w-0 items-center gap-2">
        {logo(o.id) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo(o.id)} alt="" width={22} height={22} className="h-[22px] w-[22px] shrink-0 rounded-full bg-white object-contain p-0.5" />
        ) : (
          <span className="h-[22px] w-[22px] shrink-0 rounded-full bg-neutral-200 dark:bg-neutral-700" />
        )}
        <span className={`truncate font-semibold ${o.eliminated ? "text-neutral-400 line-through decoration-neutral-400/60" : ""}`}>{t?.name ?? o.id}</span>
      </span>
    );
    return (
      <td className="max-w-[7.5rem] px-1.5 py-1.5 sm:max-w-none sm:px-2">
        {href ? <Link href={href} prefetch={false} className="hover:underline">{inner}</Link> : inner}
      </td>
    );
  };

  const leagueTable = (lg: League) => {
    const rows = odds.filter((o) => o.league === lg).sort((a, b) => a.seed - b.seed);
    return (
      <div className="min-w-0 overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
        <div className="px-4 pt-3 pb-1 text-xs font-bold text-neutral-700 dark:text-neutral-200">{lg === "AL" ? "아메리칸리그" : "내셔널리그"}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] text-neutral-500 whitespace-nowrap">
              <tr>
                <th className="w-7 px-1 py-2 text-center font-medium sm:w-8 sm:px-2">시드</th>
                <th className="px-2 py-2 text-left font-medium">팀</th>
                {COLS.map((c) => (
                  <th key={c.key} className="px-0.5 py-2 text-center font-medium sm:px-1" title={c.label}>{c.short}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-white/[0.06]">
              {rows.map((o) => (
                <tr key={o.id} className={o.eliminated ? "opacity-60" : ""}>
                  <td className="px-1 py-1.5 text-center text-xs font-bold tabular-nums text-neutral-500 sm:px-2">
                    <span className={byId.get(o.id)?.divisionWinner ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>{o.seed}</span>
                  </td>
                  <TeamCell o={o} />
                  {COLS.map((c) => <Cell key={c.key} p={o[c.key]} strong={c.key === "champ"} />)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">
            {data.season} 포스트시즌 우승 확률
            {!data.fieldSet && <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">현재 순위 기준 예상</span>}
          </h2>
          <p className="mt-1 text-xs text-neutral-500 break-keep">
            와일드카드 → 디비전 시리즈 → 챔피언십 시리즈 → 월드시리즈까지 가능한 대진을 모두 따라가 합산한 확률입니다. 끝난 시리즈는 결과, 진행 중인 시리즈는 현재 승수부터 계산합니다.
          </p>
        </div>
        <Link
          href="/baseball/mlb-postseason"
          className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-4 py-2 text-sm font-bold text-rose-600 ring-1 ring-rose-500/20 transition hover:bg-rose-500/15 dark:text-rose-400"
        >
          대진표·경기 일정 →
        </Link>
      </div>

      {champion ? (
        <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-yellow-50 p-5 ring-1 ring-amber-300/60 dark:from-amber-950/30 dark:to-yellow-950/20 dark:ring-amber-700/40">
          <div className="text-xs font-bold text-amber-700 dark:text-amber-300">{data.season} 월드시리즈 우승</div>
          <div className="mt-1 text-2xl font-black">{champion.name}</div>
        </div>
      ) : (
        top.length > 0 && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {top.map((o, i) => {
              const t = byId.get(o.id);
              return (
                <div key={o.id} className="relative overflow-hidden rounded-2xl bg-white p-4 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-neutral-400">{i + 1}위 후보</span>
                    {logo(o.id) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logo(o.id)} alt="" width={36} height={36} className="h-9 w-9 rounded-full bg-white object-contain p-1" />
                    )}
                  </div>
                  <div className="mt-1 truncate text-sm font-bold">{t?.name}</div>
                  <div className="mt-1 text-2xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">{pctText(o.champ)}</div>
                  <div className="mt-0.5 text-[11px] text-neutral-500 tabular-nums">
                    {o.league} {o.seed}번 시드 · WS 진출 {pctText(o.ws)}
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/10">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(2, o.champ * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {leagueTable("AL")}
        {leagueTable("NL")}
      </div>
      <p className="text-[11px] text-neutral-400 break-keep">
        시드 <span className="font-semibold text-emerald-600 dark:text-emerald-400">초록</span> = 지구 우승,{" "}
        <span className="font-semibold text-amber-600 dark:text-amber-400">주황</span> = 와일드카드 · 1·2번 시드는 와일드카드 시리즈 부전승 · 경기
        승률은 자체 Elo(홈 +24) · WS 홈 어드밴티지는 정규시즌 승률 높은 팀 · 5분마다 갱신
      </p>
    </section>
  );
}
