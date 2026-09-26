// 팀 능력치 레이더 섹션 — 리그 안 순위 5축(공격·수비·전력·폼·원정)을 레이더 + 축별 막대로.
// 다음 경기 상대가 같은 리그면 겹쳐 그리고(예측 연동), 없으면 리그 중간(50)과 비교한다.
import Link from "next/link";
import { Radar } from "lucide-react";
import ComparePlayerRadar from "@/components/ComparePlayerRadar";
import { radarSummary, RADAR_MIN_PLAYED, type TeamRadar } from "@/lib/predict/team-radar";

export interface RadarOpponent {
  name: string;
  radar: TeamRadar;
  href: string;
  dateLabel: string;
}

const LEAGUE_MID = ["공격력", "수비력", "전력", "최근 폼", "원정"].map((axis) => ({ axis, value: 50, raw: "리그 중간" }));

export default function TeamRadarSection({
  teamName,
  radar,
  opponent,
  seasonNote,
}: {
  teamName: string;
  radar: TeamRadar | null;
  opponent: RadarOpponent | null;
  /** 지난 시즌 경기로 계산했을 때 그 사실 — 현재 값처럼 보이지 않게 */
  seasonNote: string | null;
}) {
  return (
    <section aria-labelledby="team-radar-h">
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-3 mb-5">
        <h2 id="team-radar-h" className="flex items-center gap-2 text-xl font-bold tracking-tight break-keep">
          <Radar className="h-5 w-5 text-rose-500" aria-hidden />
          팀 능력치
        </h2>
        <p className="text-xs text-neutral-500 mt-0.5 break-keep">
          같은 리그 팀들 사이 순위를 0~100으로 — 1위 100, 꼴찌 0
          {seasonNote && <> · {seasonNote}</>}
        </p>
      </div>
      {!radar ? (
        <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500 break-keep dark:border-neutral-700">
          리그 경기가 {RADAR_MIN_PLAYED}경기 이상 쌓이면 리그 안 공격·수비·전력·폼·원정 순위를 그립니다.
        </p>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
            <ComparePlayerRadar
              axesA={radar.axes}
              axesB={opponent ? opponent.radar.axes : LEAGUE_MID}
              nameA={teamName}
              nameB={opponent ? opponent.name : "리그 중간"}
            />
            {opponent && (
              <p className="mt-1 text-center text-xs text-neutral-500 break-keep">
                다음 경기 {opponent.dateLabel} vs {opponent.name} —{" "}
                <Link href={opponent.href} prefetch={false} className="font-semibold text-rose-600 hover:underline dark:text-rose-400">
                  경기 예측 보기
                </Link>
              </p>
            )}
          </div>
          <div>
            <ul className="space-y-3">
              {radar.rows.map((r, i) => {
                const opp = opponent?.radar.rows[i];
                return (
                  <li key={r.axis}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-semibold">{r.axis}</span>
                      <span className="text-xs tabular-nums text-neutral-500">
                        {r.rank != null ? `${r.of}팀 중 ${r.tied ? "공동 " : ""}${r.rank}위` : "순위 없음"}
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/10" aria-hidden>
                      <div className="h-full rounded-full bg-rose-500" style={{ width: `${r.value}%` }} />
                    </div>
                    <div className="mt-0.5 flex justify-between gap-2 text-[11px] tabular-nums text-neutral-500">
                      <span>{r.raw}</span>
                      {opp && (
                        <span className="text-cyan-700 dark:text-cyan-400">
                          상대 {opp.rank != null ? `${opp.tied ? "공동 " : ""}${opp.rank}위` : "—"}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-[11px] text-neutral-500 break-keep">
              {radarSummary(radar)}. 공격·수비는 경기당 득실, 전력은 Elo 레이팅, 최근 폼은 최근 5경기 승점, 원정은 원정
              경기당 승점(무승부 없는 종목은 승률) 기준입니다.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
