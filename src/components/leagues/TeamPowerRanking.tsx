// 팀 파워랭킹 (하키·농구·e스포츠 공용) — Elo(전력) + 종목별 지표를 곁들인 전력 순위.
// 무승부 없는 종목용(W-L). 지표는 경기 결과에서 계산: NHL/WNBA=실점/경기, LOL=맵득실.
// 야구(ERA=별도 DB)는 BaseballPowerRanking, 축구는 LeaguePowerRanking 사용.
import Link from "next/link";
import { TrendingUp, Info } from "lucide-react";
import { prisma } from "@/lib/db";
import { calcEloTable, STARTING_ELO } from "@/lib/predict/elo";
import type { PredictMatch } from "@/lib/predict/types";
import { currentSeasonStart, previousSeasonStart } from "@/lib/predict/season-window";
import { toKoreanTeamName } from "@/lib/team-names";
import TeamBadge from "@/components/TeamBadge";

const matchSelect = {
  id: true, league: true, status: true,
  homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, startTime: true,
} as const;

// 종목별 라벨/지표 설정. against = 실점/경기(낮을수록 강함). null 이면 지표 컬럼 없음.
const CFG: Record<string, { diffLabel: string; againstLabel: string | null; againstDigits: number; unit: string }> = {
  NHL: { diffLabel: "득실", againstLabel: "실점", againstDigits: 2, unit: "골" },
  WNBA: { diffLabel: "득실차", againstLabel: "실점", againstDigits: 1, unit: "점" },
  LOL: { diffLabel: "맵득실", againstLabel: null, againstDigits: 0, unit: "맵" },
};

type FormChip = "W" | "L";
interface Row {
  teamId: number; name: string; logoUrl: string | null; elo: number; rank: number;
  move: number | null; played: number; w: number; l: number; diff: number;
  against: number | null; form: FormChip[];
}

function rankMap(elo: Map<number, number>): Map<number, number> {
  const sorted = [...elo.entries()].sort((a, b) => b[1] - a[1]);
  const m = new Map<number, number>();
  sorted.forEach(([id], i) => m.set(id, i + 1));
  return m;
}

export default async function TeamPowerRanking({ league, leagueName }: { league: string; leagueName: string }) {
  const upper = league.toUpperCase();
  const cfg = CFG[upper] ?? CFG.NHL;
  const seasonStart = currentSeasonStart(upper);
  let dbMatches = await prisma.match.findMany({
    where: { league: upper, ...(seasonStart ? { startTime: { gte: seasonStart } } : {}) },
    select: matchSelect,
  });
  if (seasonStart && dbMatches.filter((m) => m.status === "FINISHED").length < 10) {
    dbMatches = await prisma.match.findMany({
      where: { league: upper, startTime: { gte: previousSeasonStart(seasonStart), lt: seasonStart } },
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

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const priorRank = rankMap(calcEloTable(matches.filter((m) => m.startTime <= cutoff)).ratings);
  const currRank = rankMap(elo.ratings);

  const teams = await prisma.team.findMany({
    where: { id: { in: [...elo.ratings.keys()] } },
    select: { id: true, name: true, logoUrl: true },
  });
  const nameById = new Map(teams.map((t) => [t.id, t.name] as const));
  const logoById = new Map(teams.map((t) => [t.id, t.logoUrl ?? null] as const));

  const agg = new Map<number, { w: number; l: number; gf: number; ga: number; form: { r: FormChip; t: number }[] }>();
  const get = (id: number) => {
    let a = agg.get(id);
    if (!a) { a = { w: 0, l: 0, gf: 0, ga: 0, form: [] }; agg.set(id, a); }
    return a;
  };
  const finished = matches
    .filter((m) => m.status === "FINISHED" && m.homeScore != null && m.awayScore != null)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  for (const m of finished) {
    const hs = m.homeScore as number, as_ = m.awayScore as number;
    const h = get(m.homeTeamId), a = get(m.awayTeamId);
    h.gf += hs; h.ga += as_; a.gf += as_; a.ga += hs;
    const t = m.startTime.getTime();
    if (hs > as_) { h.w++; a.l++; h.form.push({ r: "W", t }); a.form.push({ r: "L", t }); }
    else if (hs < as_) { h.l++; a.w++; h.form.push({ r: "L", t }); a.form.push({ r: "W", t }); }
  }

  const rows: Row[] = [...elo.ratings.entries()]
    .map(([teamId, rating]): Row => {
      const a = agg.get(teamId);
      const played = (a?.w ?? 0) + (a?.l ?? 0);
      const pr = priorRank.get(teamId);
      return {
        teamId, name: toKoreanTeamName(nameById.get(teamId) ?? String(teamId), upper), logoUrl: logoById.get(teamId) ?? null,
        elo: Math.round(rating), rank: currRank.get(teamId) ?? 0,
        move: pr != null ? pr - (currRank.get(teamId) ?? 0) : null,
        played, w: a?.w ?? 0, l: a?.l ?? 0,
        diff: (a?.gf ?? 0) - (a?.ga ?? 0),
        against: cfg.againstLabel && played > 0 ? (a?.ga ?? 0) / played : null,
        form: (a?.form ?? []).slice(-5).map((f) => f.r),
      };
    })
    .filter((r) => r.played > 0 && !/all.?star|올스타/i.test(nameById.get(r.teamId) ?? ""))
    .sort((a, b) => b.elo - a.elo)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const top = rows[0];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-rose-500" aria-hidden />
          <h2 className="text-xl font-black tracking-tight">{leagueName} AI 파워랭킹</h2>
        </div>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed max-w-2xl">
          우리 AI 모델이 시즌 전 경기 결과로 계산한 <strong>Elo 레이팅</strong> 기준 팀 전력 순위입니다.
          {cfg.againstLabel && <> 팀 <strong>{cfg.againstLabel}/경기</strong>도 함께 보여줍니다.</>} 매 경기 후 자동 갱신됩니다.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.04] p-4">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-neutral-500">
            <Info className="h-3.5 w-3.5" aria-hidden /> 어떻게 읽나요
          </div>
          <ul className="mt-2 space-y-1.5 text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
            <li><strong className="text-neutral-900 dark:text-white">Elo</strong> — 현재 전력. 평균 {STARTING_ELO}, 강팀을 이기면 크게 오릅니다.</li>
            {cfg.againstLabel && <li><strong className="text-neutral-900 dark:text-white">{cfg.againstLabel}/경기</strong> — 팀 수비력(낮을수록 강함).</li>}
            <li><strong className="text-emerald-600 dark:text-emerald-400">▲</strong>/<strong className="text-rose-600 dark:text-rose-400">▼</strong> 최근 7일 순위 변동 · <strong>최근 5</strong> 마지막 5경기.</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.04] p-4">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-neutral-500">
            <Info className="h-3.5 w-3.5" aria-hidden /> 왜 순위표와 다른가요
          </div>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
            순위표는 <strong>승패</strong>만 셉니다. 파워랭킹은 <strong>상대의 강함</strong>까지 반영해 “지금 진짜 누가 센가”를 보여주며,{" "}
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

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.03] text-left text-xs uppercase tracking-wider text-neutral-500">
              <th className="py-3 pl-4 pr-2 font-bold">#</th>
              <th className="py-3 px-2 font-bold">팀</th>
              <th className="py-3 px-2 font-bold text-right">Elo</th>
              {cfg.againstLabel && <th className="py-3 px-2 font-bold text-right hidden sm:table-cell">{cfg.againstLabel}</th>}
              <th className="py-3 px-2 font-bold text-center hidden sm:table-cell">변동</th>
              <th className="py-3 px-2 font-bold text-center hidden md:table-cell">승-패</th>
              <th className="py-3 px-2 font-bold text-center hidden lg:table-cell">{cfg.diffLabel}</th>
              <th className="py-3 px-2 pr-4 font-bold text-center">최근 5</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.teamId} className="border-b border-neutral-100 dark:border-white/[0.06] last:border-0 hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition">
                <td className="py-2.5 pl-4 pr-2 tabular-nums font-bold text-neutral-500">{r.rank}</td>
                <td className="py-2.5 px-2">
                  <Link href={`/teams/${r.teamId}`} className="flex items-center gap-2 font-semibold hover:text-rose-600 dark:hover:text-rose-400 transition">
                    <TeamBadge logoUrl={r.logoUrl} size={20} />
                    <span className="truncate">{r.name}</span>
                  </Link>
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums font-bold">{r.elo}</td>
                {cfg.againstLabel && (
                  <td className="py-2.5 px-2 text-right tabular-nums text-neutral-500 hidden sm:table-cell">
                    {r.against != null ? r.against.toFixed(cfg.againstDigits) : "—"}
                  </td>
                )}
                <td className="py-2.5 px-2 text-center hidden sm:table-cell">
                  {r.move == null || r.move === 0 ? (
                    <span className="text-neutral-300 dark:text-neutral-600">–</span>
                  ) : r.move > 0 ? (
                    <span className="text-emerald-600 dark:text-emerald-400 tabular-nums text-xs font-bold">▲{r.move}</span>
                  ) : (
                    <span className="text-rose-600 dark:text-rose-400 tabular-nums text-xs font-bold">▼{-r.move}</span>
                  )}
                </td>
                <td className="py-2.5 px-2 text-center tabular-nums text-neutral-500 hidden md:table-cell">{r.w}-{r.l}</td>
                <td className="py-2.5 px-2 text-center tabular-nums hidden lg:table-cell">
                  <span className={r.diff > 0 ? "text-emerald-600 dark:text-emerald-400" : r.diff < 0 ? "text-rose-600 dark:text-rose-400" : "text-neutral-500"}>
                    {r.diff > 0 ? `+${r.diff}` : r.diff}
                  </span>
                </td>
                <td className="py-2.5 px-2 pr-4">
                  <div className="flex items-center justify-center gap-1">
                    {r.form.length === 0 ? (
                      <span className="text-neutral-300 dark:text-neutral-600 text-xs">–</span>
                    ) : (
                      r.form.map((f, i) => (
                        <span key={i} className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${f === "W" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/15 text-rose-600 dark:text-rose-400"}`} title={f}>
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

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link href={`/predictions/${upper}`} className="inline-flex items-center gap-1.5 font-semibold text-rose-600 dark:text-rose-400 hover:opacity-80 transition">
          더 깊게 — {leagueName} 시즌 시뮬레이션(우승·순위 확률) <span aria-hidden>→</span>
        </Link>
        <Link href="/predictions/accuracy" className="inline-flex items-center gap-1.5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition">
          AI 적중률 보드 <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
