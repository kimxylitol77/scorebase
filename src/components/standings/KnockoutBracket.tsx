// 조별→녹아웃 대회의 대진표 — knockout-derive 유도 결과를 라운드 열로 렌더.
// 모바일은 1열 스택, sm+ 는 라운드별 열. 승자는 굵게 + 세트 스코어 강조.
import type { KnockoutBracketData, KnockoutTie } from "@/lib/sports/knockout-derive";

interface TeamInfo {
  name: string;
  logoUrl: string | null;
}

interface Props {
  data: KnockoutBracketData;
  /** teamId → { 표시명(한글), 로고 } */
  teamInfo: Map<number, TeamInfo>;
}

function TieCard({ tie, teamInfo }: { tie: KnockoutTie; teamInfo: Map<number, TeamInfo> }) {
  const h = teamInfo.get(tie.homeTeamId);
  const a = teamInfo.get(tie.awayTeamId);
  const done = tie.status === "FINISHED" && tie.homeScore != null && tie.awayScore != null;
  const hWin = done && tie.homeScore! > tie.awayScore!;
  const aWin = done && tie.awayScore! > tie.homeScore!;
  const kst = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(tie.startTime);

  const row = (info: TeamInfo | undefined, score: number | null, win: boolean) => (
    <div className={`flex items-center gap-2 ${win ? "font-bold" : done ? "text-neutral-400 dark:text-neutral-500" : ""}`}>
      {info?.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={info.logoUrl} alt="" className="h-4 w-4 shrink-0 object-contain" loading="lazy" />
      ) : (
        <span className="h-4 w-4 shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate text-[13px]">{info?.name ?? "-"}</span>
      <span className={`shrink-0 text-[13px] tabular-nums ${win ? "text-rose-600 dark:text-rose-400" : ""}`}>
        {score ?? "-"}
      </span>
    </div>
  );

  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 space-y-1.5 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex items-center justify-between text-[10px] text-neutral-400">
        <span>{tie.thirdPlace ? "3·4위전" : ""}</span>
        <span>{tie.status === "FINISHED" ? "종료" : kst}</span>
      </div>
      {row(h, tie.homeScore, hWin)}
      {row(a, tie.awayScore, aWin)}
    </div>
  );
}

export default function KnockoutBracket({ data, teamInfo }: Props) {
  if (data.rounds.length === 0) return null;
  const cols = Math.min(data.rounds.length, 3);
  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-white/10 p-4">
      <h2 className="text-sm font-black mb-3">토너먼트 대진표</h2>
      <div className={`grid gap-3 ${cols >= 3 ? "sm:grid-cols-3" : cols === 2 ? "sm:grid-cols-2" : ""}`}>
        {data.rounds.map((r) => (
          <div key={r.round} className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-500">
              {r.label}
            </h3>
            {r.ties.map((t, i) => (
              <TieCard key={`${r.round}-${i}`} tie={t} teamInfo={teamInfo} />
            ))}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-neutral-400 break-keep">
        대진은 경기 일정 기준 자동 구성 · 다음 라운드는 일정 확정 시 추가됩니다.
      </p>
    </section>
  );
}
