// 야구 AI 파워랭킹 — 팀 Elo(전력) + 팀 투수력(ERA·WHIP). MLB·KBO·NPB 공용.
// Elo 로 줄세우고 팀 시즌 ERA/WHIP 을 함께 노출. 매 경기 후 자동 갱신.
// 소스: 우리 Elo(경기 결과) + BaseballTeamSeasonStats(era/whip — MLB statsapi·KBO/NPB 시즌스탯 잡).
import Link from "next/link";
import { TrendingUp, Info } from "lucide-react";
import { prisma } from "@/lib/db";
import { calcEloTable, STARTING_ELO } from "@/lib/predict/elo";
import type { PredictMatch } from "@/lib/predict/types";
import { currentSeasonStart, previousSeasonStart } from "@/lib/predict/season-window";
import { toKoreanTeamName } from "@/lib/team-names";
import { isAllStarMatchRow, isBaseballAllStarTeam } from "@/lib/sports/baseball/allstar";
import TeamBadge from "@/components/TeamBadge";
import CollapseSection from "@/components/CollapseSection";

const matchSelect = {
  id: true, league: true, status: true,
  homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, startTime: true,
} as const;

type FormChip = "W" | "L";
interface Row {
  teamId: number; name: string; logoUrl: string | null; elo: number; rank: number;
  move: number | null; played: number; w: number; l: number; rd: number;
  era: number | null; whip: number | null; form: FormChip[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");

function rankMap(elo: Map<number, number>): Map<number, number> {
  const sorted = [...elo.entries()].sort((a, b) => b[1] - a[1]);
  const m = new Map<number, number>();
  sorted.forEach(([id], i) => m.set(id, i + 1));
  return m;
}

/** BaseballTeamSeasonStats(league) 의 era/whip 을 정규화 팀명 키로. 최신 시즌 우선. */
async function fetchTeamEra(league: string): Promise<{ norm: string; era: number; whip: number | null }[]> {
  const rows = await prisma.$queryRaw<{ teamName: string; era: number | null; whip: number | null }[]>`
    SELECT "teamName", era, whip FROM "BaseballTeamSeasonStats"
    WHERE league = ${league} AND season = (
      SELECT MAX(season) FROM "BaseballTeamSeasonStats" WHERE league = ${league}
    )`;
  return rows
    .filter((r) => r.era != null)
    .map((r) => ({ norm: norm(r.teamName), era: Number(r.era), whip: r.whip != null ? Number(r.whip) : null }));
}

/** 우리 팀명(영문+한글) ↔ 스탯 팀명(약칭) 매칭 — 정확/부분(약칭 포함). */
function eraFor(
  stats: { norm: string; era: number; whip: number | null }[],
  cands: string[],
): { era: number; whip: number | null } | null {
  const cs = cands.filter(Boolean);
  // 정확 일치 우선
  for (const s of stats) if (cs.includes(s.norm)) return { era: s.era, whip: s.whip };
  // 약칭 포함(예: 스탯 "nc" ⊂ 우리 "nc다이노스")
  for (const s of stats) if (s.norm.length >= 2 && cs.some((c) => c.includes(s.norm) || s.norm.includes(c))) return { era: s.era, whip: s.whip };
  return null;
}

export default async function BaseballPowerRanking({ league, leagueName }: { league: string; leagueName: string }) {
  const upper = league.toUpperCase();
  const seasonStart = currentSeasonStart(upper);
  let dbMatches = await prisma.match.findMany({
    where: { league: upper, ...(seasonStart ? { startTime: { gte: seasonStart } } : {}) },
    select: matchSelect,
  });
  // 전환기(완료 <10)엔 직전 시즌 폴백 — 문구는 지난 시즌 기준으로, 표는 접이식 아카이브.
  let prevSeasonMode = false;
  if (seasonStart && dbMatches.filter((m) => m.status === "FINISHED").length < 10) {
    prevSeasonMode = true;
    dbMatches = await prisma.match.findMany({
      where: { league: upper, startTime: { gte: previousSeasonStart(seasonStart), lt: seasonStart } },
      select: matchSelect,
    });
  }
  // 올스타전은 정규 전력이 아니라 Elo·전적을 오염시킨다 → 집계 자체에서 제외
  const matches: PredictMatch[] = dbMatches.filter((m) => !isAllStarMatchRow(m)).map((m) => ({ ...m }));

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

  // 서버 컴포넌트 — 요청(또는 revalidate)마다 1회 렌더라 클라이언트 렌더 순수성 규칙 대상이 아니다.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const cutoff = new Date(nowMs - 7 * 24 * 60 * 60 * 1000);
  // 시즌 창이 아직 안 넘어갔어도 잔여 일정이 없고 마지막 경기가 30일 지났으면
  // 오프시즌 — 지난 시즌 폴백과 동일하게 아카이브(접이식) 취급.
  const lastFinishedMs = matches.reduce(
    (mx, m) => (m.status === "FINISHED" ? Math.max(mx, m.startTime.getTime()) : mx),
    0,
  );
  const hasUpcoming = matches.some((m) => m.startTime.getTime() > nowMs);
  const archiveMode =
    prevSeasonMode ||
    (!hasUpcoming && lastFinishedMs > 0 && nowMs - lastFinishedMs > 30 * 24 * 60 * 60 * 1000);
  const priorRank = rankMap(calcEloTable(matches.filter((m) => m.startTime <= cutoff)).ratings);
  const currRank = rankMap(elo.ratings);

  const [teams, eraStats] = await Promise.all([
    prisma.team.findMany({ where: { id: { in: [...elo.ratings.keys()] } }, select: { id: true, name: true, logoUrl: true } }),
    fetchTeamEra(upper),
  ]);
  const nameById = new Map(teams.map((t) => [t.id, t.name] as const));
  const logoById = new Map(teams.map((t) => [t.id, t.logoUrl ?? null] as const));

  const agg = new Map<number, { w: number; l: number; rf: number; ra: number; form: { r: FormChip; t: number }[] }>();
  const get = (id: number) => {
    let a = agg.get(id);
    if (!a) { a = { w: 0, l: 0, rf: 0, ra: 0, form: [] }; agg.set(id, a); }
    return a;
  };
  const finished = matches
    .filter((m) => m.status === "FINISHED" && m.homeScore != null && m.awayScore != null)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  for (const m of finished) {
    const hs = m.homeScore as number, as_ = m.awayScore as number;
    const h = get(m.homeTeamId), a = get(m.awayTeamId);
    h.rf += hs; h.ra += as_; a.rf += as_; a.ra += hs;
    const t = m.startTime.getTime();
    if (hs > as_) { h.w++; a.l++; h.form.push({ r: "W", t }); a.form.push({ r: "L", t }); }
    else if (hs < as_) { h.l++; a.w++; h.form.push({ r: "L", t }); a.form.push({ r: "W", t }); }
  }

  const rows: Row[] = [...elo.ratings.entries()]
    .map(([teamId, rating]): Row => {
      const a = agg.get(teamId);
      const en = nameById.get(teamId) ?? String(teamId);
      const ko = toKoreanTeamName(en, upper) ?? en;
      const p = eraFor(eraStats, [norm(en), norm(ko)]);
      const pr = priorRank.get(teamId);
      return {
        teamId, name: ko, logoUrl: logoById.get(teamId) ?? null,
        elo: Math.round(rating), rank: currRank.get(teamId) ?? 0,
        move: pr != null ? pr - (currRank.get(teamId) ?? 0) : null,
        played: (a?.w ?? 0) + (a?.l ?? 0), w: a?.w ?? 0, l: a?.l ?? 0,
        rd: (a?.rf ?? 0) - (a?.ra ?? 0),
        era: p?.era ?? null, whip: p?.whip ?? null,
        form: (a?.form ?? []).slice(-5).map((f) => f.r),
      };
    })
    // 정규팀만 — 올스타/친선 제외 (수집에서 걸러도 과거 데이터 방어용으로 유지)
    .filter((r) => r.played > 0 && !isBaseballAllStarTeam(nameById.get(r.teamId)))
    .sort((a, b) => b.elo - a.elo)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const top = rows[0];

  const rankingBody = (
    <div className="space-y-4">
        {top && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {archiveMode ? "지난 시즌 최종 기준 " : "현재 "}
            <strong className="text-neutral-900 dark:text-white">{top.name}</strong> 이(가) Elo{" "}
            <strong className="text-rose-600 dark:text-rose-400 tabular-nums">{top.elo}</strong>
            {top.era != null && <> · ERA <strong className="tabular-nums">{top.era.toFixed(2)}</strong></>} 로 리그 최강
            전력{archiveMode ? "이었습니다" : "입니다"}.
          </p>
        )}

        <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.03] text-left text-xs uppercase tracking-wider text-neutral-500">
                <th className="py-3 pl-4 pr-2 font-bold">#</th>
                <th className="py-3 px-2 font-bold">팀</th>
                <th className="py-3 px-2 font-bold text-right">Elo</th>
                <th className="py-3 px-2 font-bold text-right">ERA</th>
                <th className="py-3 px-2 font-bold text-right hidden sm:table-cell">WHIP</th>
                <th className="py-3 px-2 font-bold text-center hidden sm:table-cell">변동</th>
                <th className="py-3 px-2 font-bold text-center hidden md:table-cell">승-패</th>
                <th className="py-3 px-2 font-bold text-center hidden lg:table-cell">득실</th>
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
                  <td className="py-2.5 px-2 text-right tabular-nums">{r.era != null ? r.era.toFixed(2) : "—"}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums text-neutral-500 hidden sm:table-cell">{r.whip != null && r.whip > 0 ? r.whip.toFixed(2) : "—"}</td>
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
                    <span className={r.rd > 0 ? "text-emerald-600 dark:text-emerald-400" : r.rd < 0 ? "text-rose-600 dark:text-rose-400" : "text-neutral-500"}>
                      {r.rd > 0 ? `+${r.rd}` : r.rd}
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
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-rose-500" aria-hidden />
          <h2 className="text-xl font-black tracking-tight">{leagueName} AI 파워랭킹</h2>
        </div>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed max-w-2xl">
          우리 AI 모델이 {archiveMode ? "지난 시즌" : "시즌"} 전 경기 결과로 계산한 <strong>Elo 레이팅</strong> 기준 팀 전력 순위에,
          <strong> 팀 투수력(ERA·WHIP)</strong>을 함께 보여줍니다.{" "}
          {archiveMode ? "새 시즌 경기가 쌓이면 자동으로 실시간 랭킹으로 전환됩니다." : "매 경기 후 자동 갱신됩니다."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.04] p-4">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-neutral-500">
            <Info className="h-3.5 w-3.5" aria-hidden /> 어떻게 읽나요
          </div>
          <ul className="mt-2 space-y-1.5 text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
            <li><strong className="text-neutral-900 dark:text-white">Elo</strong> — 현재 전력. 평균 {STARTING_ELO}, 강팀을 이기면 크게 오릅니다.</li>
            <li><strong className="text-neutral-900 dark:text-white">ERA·WHIP</strong> — 팀 투수력(낮을수록 강함). 팀 시즌 스탯.</li>
            <li><strong className="text-emerald-600 dark:text-emerald-400">▲</strong>/<strong className="text-rose-600 dark:text-rose-400">▼</strong> 최근 7일 순위 변동 · <strong>최근 5</strong> 마지막 5경기.</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.04] p-4">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-neutral-500">
            <Info className="h-3.5 w-3.5" aria-hidden /> 왜 순위표와 다른가요
          </div>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
            순위표는 <strong>승패</strong>만 셉니다. 파워랭킹은 <strong>상대의 강함</strong>까지 반영해 강팀 상대 선전을 구분하고,
            투수력(ERA)을 곁들여 “지금 진짜 누가 센가”를 보여줍니다.{" "}
            <Link href="/predictions/accuracy" className="text-rose-600 dark:text-rose-400 underline underline-offset-2 hover:opacity-80">
              적중률로 검증된
            </Link>{" "}
            같은 모델이 산출합니다.
          </p>
        </div>
      </div>

      {/* 랭킹 본문 — 전환기(지난 시즌 폴백)엔 접이식 아카이브 */}
      {archiveMode ? (
        <CollapseSection title="지난 시즌 최종 파워랭킹" meta="(새 시즌 개막 후 자동 갱신)">
          {rankingBody}
        </CollapseSection>
      ) : (
        rankingBody
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link href={`/predictions/${upper}`} className="inline-flex items-center gap-1.5 font-semibold text-rose-600 dark:text-rose-400 hover:opacity-80 transition">
          더 깊게 — {leagueName} 시즌 시뮬레이션(우승·순위 확률) <span aria-hidden>→</span>
        </Link>
        <Link href={`/standings/${upper}`} className="inline-flex items-center gap-1.5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition">
          정규 순위표 <span aria-hidden>→</span>
        </Link>
      </div>
      <p className="text-[11px] text-neutral-400">ERA·WHIP = 팀 시즌 투수 스탯 · Elo·전적 = 스코어베이스 (경기 결과 기반).</p>
    </div>
  );
}
