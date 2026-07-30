// 리그 AI 파워랭킹 — 팀을 Elo 레이팅으로 줄세운 "지금 전력" 스냅샷.
// 순위표(승점)와 달리 상대 강함까지 반영해 실제 전력을 보여준다. 최근 7일 순위 변동·최근 5경기 폼 동반.
import Link from "next/link";
import { TrendingUp, Info } from "lucide-react";
import { prisma } from "@/lib/db";
import { calcEloTable, STARTING_ELO } from "@/lib/predict/elo";
import type { PredictMatch } from "@/lib/predict/types";
import { currentSeasonStart, previousSeasonStart } from "@/lib/predict/season-window";
import { toKoreanTeamName } from "@/lib/team-names";
import TeamBadge from "@/components/TeamBadge";

const matchSelect = {
  id: true,
  league: true,
  status: true,
  homeTeamId: true,
  awayTeamId: true,
  homeScore: true,
  awayScore: true,
  startTime: true,
} as const;

type FormChip = "W" | "D" | "L";

interface Row {
  teamId: number;
  name: string;
  logoUrl: string | null;
  elo: number;
  rank: number;
  /** 최근 7일 순위 변동 (양수 = 상승, null = 신규/비교 불가) */
  move: number | null;
  played: number;
  w: number;
  d: number;
  l: number;
  gd: number;
  form: FormChip[]; // 과거 → 최신
}

function rankMap(elo: Map<number, number>): Map<number, number> {
  const sorted = [...elo.entries()].sort((a, b) => b[1] - a[1]);
  const m = new Map<number, number>();
  sorted.forEach(([id], i) => m.set(id, i + 1));
  return m;
}

export default async function LeaguePowerRanking({
  league,
  leagueName,
}: {
  league: string;
  leagueName: string;
}) {
  const upper = league.toUpperCase();
  const seasonStart = currentSeasonStart(upper);
  let dbMatches = await prisma.match.findMany({
    where: {
      league: upper,
      ...(seasonStart ? { startTime: { gte: seasonStart } } : {}),
    },
    select: matchSelect,
  });
  // 새 시즌 개막 직후·오프시즌(완료 <10)은 직전 시즌 창으로 폴백 — 예측 페이지와 동일 규칙.
  if (seasonStart && dbMatches.filter((m) => m.status === "FINISHED").length < 10) {
    dbMatches = await prisma.match.findMany({
      where: {
        league: upper,
        startTime: { gte: previousSeasonStart(seasonStart), lt: seasonStart },
      },
      select: matchSelect,
    });
  }
  const matches: PredictMatch[] = dbMatches.map((m) => ({ ...m }));

  const elo = calcEloTable(matches);
  if (elo.ratings.size < 2) {
    return (
      <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.04] p-8 text-center">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          아직 이번 시즌 경기 데이터가 충분하지 않아 파워랭킹을 만들 수 없습니다. 시즌이 시작되면 자동으로 채워집니다.
        </p>
      </div>
    );
  }

  // 최근 7일 순위 변동 — 7일 전 시점까지의 매치만으로 Elo 를 다시 계산해 순위 비교.
  // 서버 컴포넌트 — 요청(또는 revalidate)마다 1회 렌더라 클라이언트 렌더 순수성 규칙 대상이 아니다.
  // eslint-disable-next-line react-hooks/purity
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const priorElo = calcEloTable(matches.filter((m) => m.startTime <= cutoff));
  const currRank = rankMap(elo.ratings);
  const priorRank = rankMap(priorElo.ratings);

  // 팀 이름·로고
  const teams = await prisma.team.findMany({
    where: { id: { in: [...elo.ratings.keys()] } },
    select: { id: true, name: true, logoUrl: true },
  });
  const nameById = new Map(teams.map((t) => [t.id, t.name] as const));
  const logoById = new Map(teams.map((t) => [t.id, t.logoUrl ?? null] as const));

  // 팀별 전적·폼 집계 (FINISHED 매치만)
  const agg = new Map<
    number,
    { w: number; d: number; l: number; gf: number; ga: number; form: { r: FormChip; t: number }[] }
  >();
  const get = (id: number) => {
    let a = agg.get(id);
    if (!a) {
      a = { w: 0, d: 0, l: 0, gf: 0, ga: 0, form: [] };
      agg.set(id, a);
    }
    return a;
  };
  const finished = matches
    .filter((m) => m.status === "FINISHED" && m.homeScore != null && m.awayScore != null)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  for (const m of finished) {
    const hs = m.homeScore as number;
    const as_ = m.awayScore as number;
    const h = get(m.homeTeamId);
    const a = get(m.awayTeamId);
    h.gf += hs; h.ga += as_;
    a.gf += as_; a.ga += hs;
    const t = m.startTime.getTime();
    if (hs > as_) { h.w++; a.l++; h.form.push({ r: "W", t }); a.form.push({ r: "L", t }); }
    else if (hs < as_) { h.l++; a.w++; h.form.push({ r: "L", t }); a.form.push({ r: "W", t }); }
    else { h.d++; a.d++; h.form.push({ r: "D", t }); a.form.push({ r: "D", t }); }
  }

  const rows: Row[] = [...elo.ratings.entries()]
    .map(([teamId, rating]): Row => {
      const a = agg.get(teamId);
      const pr = priorRank.get(teamId);
      const cr = currRank.get(teamId) ?? 0;
      const form = (a?.form ?? []).slice(-5).map((f) => f.r);
      return {
        teamId,
        name: toKoreanTeamName(nameById.get(teamId) ?? String(teamId), upper),
        logoUrl: logoById.get(teamId) ?? null,
        elo: Math.round(rating),
        rank: cr,
        move: pr != null ? pr - cr : null,
        played: (a?.w ?? 0) + (a?.d ?? 0) + (a?.l ?? 0),
        w: a?.w ?? 0,
        d: a?.d ?? 0,
        l: a?.l ?? 0,
        gd: (a?.gf ?? 0) - (a?.ga ?? 0),
        form,
      };
    })
    .filter((r) => r.played > 0)
    .sort((a, b) => b.elo - a.elo)
    .map((r, i) => ({ ...r, rank: i + 1 })); // played 필터 후 순위 재부여

  const top = rows[0];

  return (
    <div className="space-y-6">
      {/* 헤더 + 설명 */}
      <div>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-rose-500" aria-hidden />
          <h2 className="text-xl font-black tracking-tight">{leagueName} AI 파워랭킹</h2>
        </div>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed max-w-2xl">
          우리 AI 모델이 이번 시즌 전 경기 결과로 계산한 <strong>Elo 레이팅</strong> 기준 팀 전력 순위입니다.
          매 경기 후 자동 갱신됩니다.
        </p>
      </div>

      {/* 어떻게 읽나 · 왜 쓰나 */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.04] p-4">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-neutral-500">
            <Info className="h-3.5 w-3.5" aria-hidden /> 어떻게 읽나요
          </div>
          <ul className="mt-2 space-y-1.5 text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
            <li><strong className="text-neutral-900 dark:text-white">Elo 점수</strong> — 현재 전력. 평균이 {STARTING_ELO}, 높을수록 강함. 강팀을 이기면 크게 오르고 약팀에 지면 크게 내립니다.</li>
            <li><strong className="text-emerald-600 dark:text-emerald-400">▲</strong>/<strong className="text-rose-600 dark:text-rose-400">▼</strong> — 최근 7일 순위 변동.</li>
            <li><strong className="text-neutral-900 dark:text-white">최근 5</strong> — 마지막 5경기 승(W)·무(D)·패(L).</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.04] p-4">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-neutral-500">
            <Info className="h-3.5 w-3.5" aria-hidden /> 왜 순위표와 다른가요
          </div>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
            순위표는 <strong>승점</strong>만 셉니다 — 누구를 이겼는지는 무시하죠. 파워랭킹은 <strong>상대의 강함</strong>까지 반영해
            강팀 상대 선전과 약팀 상대 졸전을 구분합니다. 즉 “지금 진짜 누가 센가”와 다음 경기 예측의 토대이며,{" "}
            <Link href="/predictions/accuracy" className="text-rose-600 dark:text-rose-400 underline underline-offset-2 hover:opacity-80">
              적중률로 검증된
            </Link>{" "}
            같은 모델이 산출합니다.
          </p>
        </div>
      </div>

      {top && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          현재 <strong className="text-neutral-900 dark:text-white">{top.name}</strong> 이(가) Elo{" "}
          <strong className="text-rose-600 dark:text-rose-400 tabular-nums">{top.elo}</strong> 로 리그 최강 전력입니다.
        </p>
      )}

      {/* 랭킹 표 */}
      <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.03] text-left text-xs uppercase tracking-wider text-neutral-500">
              <th className="py-3 pl-4 pr-2 font-bold">#</th>
              <th className="py-3 px-2 font-bold">팀</th>
              <th className="py-3 px-2 font-bold text-right">Elo</th>
              <th className="py-3 px-2 font-bold text-center hidden sm:table-cell">변동</th>
              <th className="py-3 px-2 font-bold text-center hidden md:table-cell">경기</th>
              <th className="py-3 px-2 font-bold text-center hidden md:table-cell">승·무·패</th>
              <th className="py-3 px-2 font-bold text-center hidden lg:table-cell">득실</th>
              <th className="py-3 px-2 pr-4 font-bold text-center">최근 5</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.teamId}
                className="border-b border-neutral-100 dark:border-white/[0.06] last:border-0 hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition"
              >
                <td className="py-2.5 pl-4 pr-2 tabular-nums font-bold text-neutral-500">{r.rank}</td>
                <td className="py-2.5 px-2">
                  <Link
                    href={`/teams/${r.teamId}`}
                    className="flex items-center gap-2 font-semibold hover:text-rose-600 dark:hover:text-rose-400 transition"
                  >
                    <TeamBadge logoUrl={r.logoUrl} size={20} />
                    <span className="truncate">{r.name}</span>
                  </Link>
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums font-bold">{r.elo}</td>
                <td className="py-2.5 px-2 text-center hidden sm:table-cell">
                  {r.move == null || r.move === 0 ? (
                    <span className="text-neutral-300 dark:text-neutral-600">–</span>
                  ) : r.move > 0 ? (
                    <span className="text-emerald-600 dark:text-emerald-400 tabular-nums text-xs font-bold">▲{r.move}</span>
                  ) : (
                    <span className="text-rose-600 dark:text-rose-400 tabular-nums text-xs font-bold">▼{-r.move}</span>
                  )}
                </td>
                <td className="py-2.5 px-2 text-center tabular-nums text-neutral-500 hidden md:table-cell">{r.played}</td>
                <td className="py-2.5 px-2 text-center tabular-nums text-neutral-500 hidden md:table-cell">
                  {r.w}·{r.d}·{r.l}
                </td>
                <td className="py-2.5 px-2 text-center tabular-nums hidden lg:table-cell">
                  <span className={r.gd > 0 ? "text-emerald-600 dark:text-emerald-400" : r.gd < 0 ? "text-rose-600 dark:text-rose-400" : "text-neutral-500"}>
                    {r.gd > 0 ? `+${r.gd}` : r.gd}
                  </span>
                </td>
                <td className="py-2.5 px-2 pr-4">
                  <div className="flex items-center justify-center gap-1">
                    {r.form.length === 0 ? (
                      <span className="text-neutral-300 dark:text-neutral-600 text-xs">–</span>
                    ) : (
                      r.form.map((f, i) => (
                        <span
                          key={i}
                          className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${
                            f === "W"
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                              : f === "L"
                                ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                                : "bg-neutral-400/15 text-neutral-500"
                          }`}
                          title={f}
                        >
                          {f}
                        </span>
                      ))
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 더 깊게 — 시즌 시뮬 교차링크 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link
          href={`/predictions/${upper}`}
          className="inline-flex items-center gap-1.5 font-semibold text-rose-600 dark:text-rose-400 hover:opacity-80 transition"
        >
          더 깊게 — {leagueName} 시즌 시뮬레이션(우승·순위 확률) <span aria-hidden>→</span>
        </Link>
        <Link
          href="/predictions/accuracy"
          className="inline-flex items-center gap-1.5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition"
        >
          AI 적중률 보드 <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
