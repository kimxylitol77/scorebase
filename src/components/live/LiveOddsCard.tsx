// 라이브 odds 카드 — 1X2 / OVER-UNDER / 핸디캡 3가지 동시 표시.
// `/api/live/match` 응답의 liveOdds 필드 사용 (1분 캐시).
// hasDraw=true 일 때만 1X2 의 X (무승부) 칼럼 표시.

interface LiveOdds {
  h2h: { home: number; draw: number | null; away: number } | null;
  totals: { line: number; over: number; under: number } | null;
  spread: {
    line: number;
    pick: "HOME" | "AWAY";
    homeOdds: number;
    awayOdds: number;
  } | null;
  bookmakers: number;
  fetchedAt: number;
}

interface Props {
  odds: LiveOdds;
  homeNameKo: string;
  awayNameKo: string;
  hasDraw?: boolean;
}

function fmt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(2);
}

function timeAgo(epoch: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - epoch) / 1000));
  if (sec < 60) return `${sec}초 전`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  return `${Math.floor(min / 60)}시간 전`;
}

export default function LiveOddsCard({ odds, homeNameKo, awayNameKo, hasDraw }: Props) {
  const { h2h, totals, spread, bookmakers, fetchedAt } = odds;
  if (!h2h && !totals && !spread) return null;

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">
          라이브 배당 (1분 갱신)
        </div>
        <div className="text-[10px] text-neutral-400">
          {bookmakers}개 북메이커 평균 · {timeAgo(fetchedAt)}
        </div>
      </div>

      {/* 사이트 전반 home 좌측 통일 — 1X2 / 핸디캡 모두 home 이 좌측 칸 */}
      {h2h && (
        <div className="space-y-1">
          <div className="text-[10px] text-neutral-500">{hasDraw ? "승무패 (1X2)" : "승부 (머니라인)"}</div>
          <div className={`grid ${hasDraw && h2h.draw != null ? "grid-cols-3" : "grid-cols-2"} gap-2`}>
            <OddsCell label={homeNameKo} value={h2h.home} />
            {hasDraw && h2h.draw != null && <OddsCell label="무" value={h2h.draw} />}
            <OddsCell label={awayNameKo} value={h2h.away} />
          </div>
        </div>
      )}

      {totals && (
        <div className="space-y-1">
          <div className="text-[10px] text-neutral-500">총득점 OVER/UNDER (기준 {totals.line})</div>
          <div className="grid grid-cols-2 gap-2">
            <OddsCell label={`O ${totals.line}`} value={totals.over} />
            <OddsCell label={`U ${totals.line}`} value={totals.under} />
          </div>
        </div>
      )}

      {spread && (
        <div className="space-y-1">
          <div className="text-[10px] text-neutral-500">
            핸디캡 ({spread.pick === "HOME" ? homeNameKo : awayNameKo} -{spread.line})
          </div>
          <div className="grid grid-cols-2 gap-2">
            <OddsCell
              label={spread.pick === "HOME" ? `${homeNameKo} -${spread.line}` : `${homeNameKo} +${spread.line}`}
              value={spread.homeOdds}
            />
            <OddsCell
              label={spread.pick === "AWAY" ? `${awayNameKo} -${spread.line}` : `${awayNameKo} +${spread.line}`}
              value={spread.awayOdds}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function OddsCell({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="rounded-lg bg-neutral-50 dark:bg-neutral-900 px-3 py-2 flex flex-col items-center">
      <div className="text-[11px] text-neutral-500 truncate max-w-full">{label}</div>
      <div className="text-base font-bold tabular-nums">{fmt(value)}</div>
    </div>
  );
}
