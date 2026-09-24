// 녹아웃 컵 "대회 여정" — 지금 어느 라운드까지 왔는지, 빅클럽은 언제 합류하는지, 우승 기록, 라운드별 결과.
// 다가오는 경기가 없어도 의미가 있는 화면(빅매치 허브는 경기가 있어야 선다). 규칙은 lib/sports/cup-journey.
import { Flag as FlagIcon, Route, Trophy } from "lucide-react";
import { prisma } from "@/lib/db";
import { cupSeasonSlice } from "@/lib/predict/cup-bracket";
import { toKoreanTeamName } from "@/lib/team-names";
import { buildStages, championFact, currentSeasonMatches, currentStage, finalWinner, isFinalLabel, isStaleSeason, seasonLabel, stageLabelFromRaw } from "@/lib/sports/cup-journey";
import { kstKickoff } from "@/lib/sports/tournament-hub";
import championsData from "../../../../data/league-champions.json";
import CupStageResults, { type StageResultsView } from "./CupStageResults";

/** 대회별 확인된 사실 — 출처를 확인한 것만 둔다(FA컵: FA·Sportmonks, 2026-09-24). */
const ENTRY_FACTS: Record<string, { title: string; lines: string[]; coverage?: string }> = {
  FA_CUP: {
    title: "빅클럽 합류",
    lines: ["리그1·리그2 — 본선 1라운드", "프리미어리그·챔피언십 — 본선 3라운드"],
    coverage: "하부 예선 라운드는 일부 경기만 수집됩니다.",
  },
};

function penalty(raw: string | null): { home: number; away: number } | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as { score?: { penalty?: { home?: number | null; away?: number | null } }; home_scores?: number[]; away_scores?: number[] };
    const af = j.score?.penalty;
    if (af?.home != null && af?.away != null) return { home: af.home, away: af.away };
    // ts 경기 객체 — scores[6] 이 승부차기(0-0 이면 없음)
    const h = Number(j.home_scores?.[6]);
    const a = Number(j.away_scores?.[6]);
    return Number.isFinite(h) && Number.isFinite(a) && h + a > 0 ? { home: h, away: a } : null;
  } catch {
    return null;
  }
}

export default async function CupJourney({ league, leagueName }: { league: string; leagueName: string }) {
  const all = await prisma.match.findMany({
    where: { league },
    orderBy: { startTime: "asc" },
    select: {
      id: true, externalId: true, status: true, startTime: true, homeScore: true, awayScore: true, raw: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });
  // 300일 창으로 먼저 줄이고, 직전 결승을 경계로 이번 시즌만 남긴다(창만 쓰면 두 시즌이 섞인다 — 스위스컵).
  const season = currentSeasonMatches(
    cupSeasonSlice(all)
      .map((m) => ({ ...m, stage: stageLabelFromRaw(m.raw) }))
      .filter((m): m is typeof m & { stage: string } => m.stage != null),
  );
  if (season.length === 0) return null;

  const stages = buildStages(season);
  const cur = currentStage(stages);
  const record = (championsData as Record<string, { champions?: { season: string; ko: string }[] }>)[league]?.champions?.[0];
  const label = seasonLabel(stages[0].first, record ? /^\d{4}$/.test(record.season) : false);
  const upcoming = stages.find((s) => s.scheduled > 0 && s !== cur) ?? (cur && cur.scheduled > 0 ? cur : null);
  const finished = cur ? isFinalLabel(cur.label) && cur.scheduled === 0 : false;
  // 끝난 시즌은 결승 결과가 우승팀(DB 판정). 기록 파일은 늦게 갱신되거나(CONCACAF 2024 에 멈춤) 비어 있다.
  const finalRows = finished
    ? season
        .filter((m) => m.stage === cur!.label)
        .map((m) => ({
          status: m.status, homeScore: m.homeScore, awayScore: m.awayScore, pk: penalty(m.raw),
          home: toKoreanTeamName(m.homeTeam.name, league) || m.homeTeam.name,
          away: toKoreanTeamName(m.awayTeam.name, league) || m.awayTeam.name,
        }))
    : [];
  const winner = finalWinner(finalRows);
  // 결승이 끝났는데 승자를 못 정하면(동점 + 승부차기 미수집) 옛 기록 대신 결승 결과를 그대로 보여준다.
  const lone = finalRows.length === 1 ? finalRows[0] : null;
  const champ = winner
    ? { label: "우승", main: winner, sub: `${label} 결승 결과` }
    : finished && lone && lone.homeScore != null
      ? { label: "결승", main: `${lone.home} ${lone.homeScore}-${lone.awayScore} ${lone.away}`, sub: "승부차기 결과는 수집되지 않았습니다" }
      : championFact(record, label);
  // 렌더 시각 기준 — 새 경기도 예정도 없이 오래됐으면 "진행"이 아니라 "여기까지 수집"(스위스컵 2025-26).
  const stale = isStaleSeason(stages, finished, new Date());
  const facts = ENTRY_FACTS[league];
  const played = stages.reduce((n, s) => n + s.finished, 0);
  const nextMatch = upcoming ? season.find((m) => m.stage === upcoming.label && m.status === "SCHEDULED" && m.startTime.getTime() > Date.now() - 86400_000) : null;

  const results: StageResultsView[] = stages
    .filter((s) => s.finished > 0)
    .map((s) => ({
      key: s.label,
      label: s.ko,
      rows: season
        .filter((m) => m.stage === s.label && m.status === "FINISHED" && m.homeScore != null && m.awayScore != null)
        .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
        .map((m) => ({
          id: m.id,
          href: `/live/${league}/${m.externalId}`,
          when: kstKickoff(m.startTime).replace(/ \(.\)/, ""),
          home: toKoreanTeamName(m.homeTeam.name, league) || m.homeTeam.name,
          away: toKoreanTeamName(m.awayTeam.name, league) || m.awayTeam.name,
          homeScore: m.homeScore!,
          awayScore: m.awayScore!,
          pk: penalty(m.raw),
        })),
    }));

  const lastPlayed = new Date(Math.max(...stages.map((s) => s.last.getTime())));
  const headline = finished
    ? "결승까지 모두 끝났습니다"
    : stale && cur
      ? `${cur.ko}까지 수집됨`
      : cur
        ? `${cur.ko}까지 진행`
        : "아직 경기 전입니다";

  return (
    <section aria-labelledby="cup-journey" className="relative space-y-8">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-24 h-[320px] w-[min(760px,100%)] -translate-x-1/2 rounded-full bg-rose-300/25 blur-3xl dark:bg-rose-500/[0.12]" />
      <div className="relative overflow-hidden rounded-[2rem] bg-white p-6 shadow-[0_28px_70px_-34px_rgba(15,23,30,0.35)] ring-1 ring-black/5 dark:bg-white/[0.05] dark:shadow-none dark:ring-white/10 sm:p-8">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-600 dark:text-rose-400">
          <Route className="h-3.5 w-3.5" aria-hidden />
          대회 여정 · {label}
        </p>
        <h2 id="cup-journey" className="mt-2 text-3xl font-black tracking-[-0.03em] text-zinc-950 break-keep dark:text-white sm:text-4xl">
          {headline}
        </h2>
        <p className="mt-2 text-sm text-zinc-500 break-keep dark:text-white/55">
          {finished
            ? `${leagueName} ${label} 시즌이 끝났습니다.`
            : stale
              ? `이후 라운드는 수집되지 않았습니다. 마지막 경기 ${lastPlayed.toISOString().slice(0, 10)}.`
              : nextMatch
              ? `다음 ${upcoming!.ko} 첫 경기 ${kstKickoff(nextMatch.startTime)} (한국시간)`
              : "다음 라운드 일정은 아직 나오지 않았습니다."}
        </p>

        {/* 라운드 트랙 — 데이터에 있는 라운드만, 첫 경기 날짜 순. 공식 체계에 끼워 맞추지 않는다. */}
        <ol className="mt-6 flex flex-wrap items-center gap-x-1.5 gap-y-2" aria-label="라운드 진행">
          {stages.map((s, i) => {
            const now = s === cur;
            const done = !now && s.finished > 0 && s.scheduled === 0;
            return (
              <li key={s.label} className="flex items-center gap-1.5">
                {i > 0 && <span className="h-px w-3 bg-zinc-300 dark:bg-white/15" aria-hidden />}
                <span
                  aria-current={now ? "step" : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold ring-1 ${
                    now
                      ? "bg-rose-500 text-white ring-rose-500 shadow-[0_6px_16px_-8px_rgba(244,63,94,0.7)]"
                      : done
                        ? "bg-zinc-100 text-zinc-700 ring-black/5 dark:bg-white/[0.07] dark:text-white/80 dark:ring-white/10"
                        : "bg-white text-zinc-500 ring-zinc-200 dark:bg-transparent dark:text-white/55 dark:ring-white/15"
                  }`}
                >
                  {s.ko}
                  <span className={`tabular-nums ${now ? "text-white/80" : "text-zinc-400 dark:text-white/40"}`}>{s.total}</span>
                </span>
              </li>
            );
          })}
          {!finished && !upcoming && !stale && (
            <li className="flex items-center gap-1.5">
              <span className="h-px w-3 bg-zinc-300 dark:bg-white/15" aria-hidden />
              <span className="inline-flex rounded-full border border-dashed border-zinc-300 px-3 py-1.5 text-[12px] font-semibold text-zinc-400 dark:border-white/20 dark:text-white/40">
                다음 라운드 · 일정 미정
              </span>
            </li>
          )}
        </ol>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {champ && (
            <Fact icon={<Trophy className="h-4 w-4" aria-hidden />} label={champ.label} main={champ.main} sub={champ.sub} />
          )}
          {facts && (
            <Fact icon={<FlagIcon className="h-4 w-4" aria-hidden />} label={facts.title} main={facts.lines[0]} sub={facts.lines.slice(1).join(" · ")} />
          )}
          <Fact
            icon={<Route className="h-4 w-4" aria-hidden />}
            label="지금까지"
            main={`${stages.length}개 라운드 · ${played.toLocaleString("ko-KR")}경기 종료`}
            sub="스코어베이스가 수집한 경기 기준"
          />
        </div>
        {facts?.coverage && <p className="mt-3 text-[12px] text-zinc-400 break-keep dark:text-white/40">{facts.coverage}</p>}
      </div>

      {results.length > 0 && <CupStageResults stages={results} initial={cur && cur.finished > 0 ? cur.label : results[results.length - 1].key} />}
    </section>
  );
}

function Fact({ icon, label, main, sub }: { icon: React.ReactNode; label: string; main: string; sub: string }) {
  return (
    <div className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
      <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500 dark:text-white/50">
        <span className="text-rose-500 dark:text-rose-400">{icon}</span>
        {label}
      </p>
      <p className="mt-1.5 text-[15px] font-bold text-zinc-950 break-keep dark:text-white">{main}</p>
      {sub && <p className="mt-0.5 text-[12px] text-zinc-500 break-keep dark:text-white/50">{sub}</p>}
    </div>
  );
}
