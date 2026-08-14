// 베트맨(스포츠토토) 프로토 배당 패널 — /odds 하단. 해외 북메이커 흐름과 짝을 이루는 국내 배당.
//
// 이 패널의 존재 이유는 배당 자체보다 **국내 투표 분포**다. 해외 북메이커는 배당만 주지만
// 베트맨은 실제로 국내 구매자들이 어디에 얼마나 걸었는지를 준다 — 배당 내재확률과 어긋나는
// 지점이 곧 "여론이 시장보다 더/덜 미는 쪽" 이다.
//
// 서버 컴포넌트. 데이터 적재는 betman-odds-cron (KST 09:00·21:00) — reports/plans/betman-odds/.

import type { BetmanRow } from "@/lib/odds/betman";

/** 배당 → 마진 제거한 내재확률 (합=1). 투표 비율과 같은 축에서 비교하기 위함. */
function impliedPct(w: number | null, d: number | null, l: number | null) {
  const iw = w && w > 0 ? 1 / w : 0;
  const id = d && d > 0 ? 1 / d : 0;
  const il = l && l > 0 ? 1 / l : 0;
  const s = iw + id + il;
  if (s <= 0) return null;
  return { w: (iw / s) * 100, d: (id / s) * 100, l: (il / s) * 100 };
}

const fmtOdds = (v: number | null) => (v != null && v > 0 ? v.toFixed(2) : "-");

function VoteBar({ w, d, l }: { w: number; d: number; l: number }) {
  const total = w + d + l;
  if (total <= 0) return null;
  const pw = (w / total) * 100;
  const pd = (d / total) * 100;
  const pl = (l / total) * 100;
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
      <div style={{ width: `${pw}%` }} className="bg-rose-500" />
      <div style={{ width: `${pd}%` }} className="bg-neutral-400 dark:bg-neutral-500" />
      <div style={{ width: `${pl}%` }} className="bg-blue-500" />
    </div>
  );
}

export default function BetmanOddsPanel({
  rows,
  hasDraw,
}: {
  rows: BetmanRow[];
  hasDraw: boolean;
}) {
  if (rows.length === 0) return null;

  const kst = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return new Intl.DateTimeFormat("ko-KR", {
      month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
      hour12: false, timeZone: "Asia/Seoul",
    }).format(d);
  };

  return (
    <section className="mt-8">
      <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 className="text-2xl font-medium">베트맨 프로토 배당</h2>
        <span className="text-[11px] text-neutral-400">
          국내 배당 · 구매자 투표 분포 {rows[0]?.gmTs ? `· ${rows[0].gmTs} 회차` : ""}
        </span>
      </div>
      <p className="mb-3 text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">
        해외 북메이커 배당(위 흐름)과 달리, 국내 구매자들이 실제로 어느 쪽에 걸었는지가 함께
        나옵니다. 각 경기의 <strong className="font-semibold">투표</strong> 비율과 배당을 확률로
        바꾼 <strong className="font-semibold">배당</strong> 값을 나란히 뒀습니다 — 둘이 벌어진
        경기가 여론과 시장이 다르게 보는 경기입니다. 출처는 베트맨(스포츠토토).
      </p>

      <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
        <div className="hidden grid-cols-[86px_112px_1fr_56px_56px_56px_180px] items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-[11px] text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900/50 sm:grid">
          <div>경기 시각</div>
          <div>리그</div>
          <div>경기</div>
          <div className="text-center">승</div>
          <div className="text-center">{hasDraw ? "무" : "-"}</div>
          <div className="text-center">패</div>
          <div>국내 투표 분포</div>
        </div>

        {rows.map((r) => {
          const imp = impliedPct(r.winAllot, r.drawAllot, r.loseAllot);
          const votes =
            r.winVotes != null && r.loseVotes != null
              ? { w: r.winVotes, d: r.drawVotes ?? 0, l: r.loseVotes }
              : null;
          const total = votes ? votes.w + votes.d + votes.l : 0;
          const pct = votes && total > 0
            ? { w: (votes.w / total) * 100, d: (votes.d / total) * 100, l: (votes.l / total) * 100 }
            : null;
          return (
            <div
              key={r.id}
              className="grid grid-cols-2 gap-x-2 gap-y-1 border-b border-neutral-100 px-3 py-2.5 text-[13px] last:border-b-0 dark:border-neutral-800 sm:grid-cols-[86px_112px_1fr_56px_56px_56px_180px] sm:items-center sm:gap-2"
            >
              <div className="text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">
                {kst(r.gameDate)}
              </div>
              <div className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                {r.leagueName}
              </div>
              <div className="col-span-2 min-w-0 truncate sm:col-span-1">
                <span className="text-neutral-800 dark:text-neutral-100">{r.homeName}</span>
                <span className="mx-1.5 text-neutral-300 dark:text-neutral-600">vs</span>
                <span className="text-neutral-800 dark:text-neutral-100">{r.awayName}</span>
              </div>

              {/* 배당. 모바일은 헤더 행이 접히므로 셀마다 라벨을 붙인다(숫자만 있으면 뭔지 모른다). */}
              <div className="tabular-nums font-semibold text-rose-600 dark:text-rose-400 sm:text-center">
                <span className="mr-1 text-[10px] font-normal text-neutral-400 sm:hidden">승</span>
                {fmtOdds(r.winAllot)}
              </div>
              <div className="tabular-nums text-neutral-500 dark:text-neutral-400 sm:text-center">
                <span className="mr-1 text-[10px] font-normal text-neutral-400 sm:hidden">무</span>
                {hasDraw ? fmtOdds(r.drawAllot) : "-"}
              </div>
              <div className="tabular-nums font-semibold text-blue-600 dark:text-blue-400 sm:text-center">
                <span className="mr-1 text-[10px] font-normal text-neutral-400 sm:hidden">패</span>
                {fmtOdds(r.loseAllot)}
              </div>

              <div className="col-span-2 sm:col-span-1">
                {pct ? (
                  <div className="space-y-1">
                    <VoteBar w={votes!.w} d={votes!.d} l={votes!.l} />
                    {/* 투표 비율과 배당 내재확률을 같은 축에 나란히 — 어긋난 폭은 읽는 사람이 본다.
                        "쏠림" 배지를 달아 봤으나 무승부 쪽에 구조적으로 몰려(실측 82경기 중 53건)
                        기준선을 보정해도 절반 넘는 경기에 붙었다. 신호가 아니라 배경이라 뺐다. */}
                    <div className="flex gap-2 text-[10px] tabular-nums leading-tight text-neutral-400">
                      <span className="w-7 shrink-0">투표</span>
                      <span className="text-rose-500">{Math.round(pct.w)}</span>
                      {hasDraw && <span>{Math.round(pct.d)}</span>}
                      <span className="text-blue-500">{Math.round(pct.l)}</span>
                      {imp && (
                        <>
                          <span className="ml-2 w-7 shrink-0">배당</span>
                          <span>{Math.round(imp.w)}</span>
                          {hasDraw && <span>{Math.round(imp.d)}</span>}
                          <span>{Math.round(imp.l)}</span>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <span className="text-[10px] text-neutral-400">투표 집계 없음</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
