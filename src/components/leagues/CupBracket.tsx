// 컵 대회 대진표 — 라운드별 세로 컬럼, 가로 스크롤. tie 단위 카드(2차전은 합산 표시).
// 라운드 구성이 대회마다 달라(1라운드~결승 / 128강~결승) 컬럼 수는 데이터가 정한다.

import Link from "next/link";
import type { CupRound, CupTie } from "@/lib/predict/cup-bracket";
import { toKoreanTeamName } from "@/lib/team-names";

export default function CupBracket({
  rounds,
  league,
}: {
  rounds: CupRound[];
  league: string;
}) {
  if (rounds.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center space-y-2">
        <div className="text-3xl">🏆</div>
        <h3 className="text-base font-bold">대진표 준비 중</h3>
        <p className="text-sm text-neutral-500 max-w-md mx-auto break-keep">
          녹아웃 라운드가 시작되면 자동으로 채워집니다. 조별리그 단계이거나 아직 대진이 확정되지
          않았습니다.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {/* 기둥이 하나면 트리로 안 보인다 — 왜 한 줄 목록인지 말해준다(DFB 포칼 1라운드 32경기, 2026-08-22). */}
      {rounds.length === 1 && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400 break-keep px-1">
          {rounds[0].ko} 진행 중 · 다음 라운드 대진이 정해지면 오른쪽에 이어 붙어 트리가 됩니다.
        </p>
      )}
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <div className="px-4 sm:px-0 flex gap-3 sm:gap-4 min-w-max">
        {rounds.map((r) => (
          <div key={r.label} className="flex flex-col min-w-[210px] sm:min-w-[240px]">
            <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-neutral-500 dark:text-neutral-400 mb-3 pl-1">
              {r.ko}{" "}
              <span className="text-neutral-400 dark:text-neutral-600">
                · {r.ties.length}경기
              </span>
            </div>
            <div className="flex-1 flex flex-col justify-around gap-3">
              {r.ties.map((t) => (
                <TieCard key={t.key} tie={t} league={league} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
    </div>
  );
}

function TieCard({ tie, league }: { tie: CupTie; league: string }) {
  const t1Won = tie.winnerTeamId === tie.team1.id;
  const t2Won = tie.winnerTeamId === tie.team2.id;
  const decided = tie.winnerTeamId !== null;
  // 단판이면 그 경기 점수, 2차전 이상이면 합산
  const single = tie.legs.length === 1 ? tie.legs[0] : null;
  const s1 = single
    ? single.homeTeamId === tie.team1.id
      ? single.homeScore
      : single.awayScore
    : (tie.aggregate?.team1 ?? null);
  const s2 = single
    ? single.homeTeamId === tie.team1.id
      ? single.awayScore
      : single.homeScore
    : (tie.aggregate?.team2 ?? null);
  const pen = single?.penalty ?? null;
  const p1 = pen
    ? single!.homeTeamId === tie.team1.id
      ? pen.home
      : pen.away
    : null;
  const p2 = pen
    ? single!.homeTeamId === tie.team1.id
      ? pen.away
      : pen.home
    : null;

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 overflow-hidden text-sm">
      <TeamRow team={tie.team1} won={t1Won} score={s1} pen={p1} decided={decided} completed={tie.completed} />
      <div className="border-t border-neutral-100 dark:border-neutral-800" />
      <TeamRow team={tie.team2} won={t2Won} score={s2} pen={p2} decided={decided} completed={tie.completed} />
      <TieFooter tie={tie} league={league} />
    </div>
  );
}

function TeamRow({
  team,
  won,
  score,
  pen,
  decided,
  completed,
}: {
  team: { id: number; name: string; logoUrl: string | null };
  won: boolean;
  score: number | null;
  pen: number | null;
  decided: boolean;
  completed: boolean;
}) {
  const dim = completed && decided && !won;
  return (
    <div className={`flex items-center gap-2 px-3 py-2 ${won ? "bg-cyan-50 dark:bg-cyan-500/10" : ""}`}>
      {team.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={team.logoUrl}
          alt=""
          className={`w-5 h-5 object-contain shrink-0 ${dim ? "opacity-50" : ""}`}
          loading="lazy"
        />
      ) : (
        <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700 text-[9px] font-bold text-neutral-500 shrink-0">
          {team.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span
        className={`flex-1 truncate ${
          won ? "font-bold text-cyan-700 dark:text-cyan-300" : dim ? "text-neutral-400" : "font-medium"
        }`}
      >
        {toKoreanTeamName(team.name)}
      </span>
      {pen != null && (
        <span className="text-[10px] tabular-nums text-neutral-400 shrink-0">({pen})</span>
      )}
      <span
        className={`tabular-nums font-bold shrink-0 ${
          won ? "text-cyan-700 dark:text-cyan-300" : dim ? "text-neutral-400" : ""
        }`}
      >
        {score ?? "-"}
      </span>
    </div>
  );
}

function TieFooter({ tie, league }: { tie: CupTie; league: string }) {
  const first = tie.legs[0];
  if (!first) return null;
  const date = first.startTime.toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Seoul",
  });
  const twoLeg = tie.legs.length > 1;
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-t border-neutral-100 dark:border-neutral-800 text-[11px] text-neutral-400">
      <span>
        {date}
        {twoLeg && ` · ${tie.legs.length}차전 합산`}
      </span>
      <Link
        href={`/live/${league}/${first.matchId}`}
        className="hover:text-rose-500 transition-colors"
      >
        경기 →
      </Link>
    </div>
  );
}
