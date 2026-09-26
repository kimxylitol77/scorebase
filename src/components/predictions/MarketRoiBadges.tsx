// 마켓별(승부·핸디캡·오버언더) 모델 픽 수익률 배지 — /predictions/accuracy 수익률 섹션과 /value-bets 상단이 같이 쓴다.
// 어느 마켓 픽을 믿을지 한눈에 — 누적 수익률·표본 수·최근 30일을 나란히. 표본 미달 마켓은 숨기지 않고 "집계 중"으로.
import Link from "next/link";
import { fmtRoiPct } from "@/lib/predict/flat-roi";
import { MARKET_ROI_MIN_SAMPLE, type MarketRoiStat, type RoiMarket } from "@/lib/predict/model-vs-market";

const LABEL: Record<RoiMarket, string> = { "1X2": "승부", HANDICAP: "핸디캡", OU: "오버언더" };
const ORDER: RoiMarket[] = ["1X2", "HANDICAP", "OU"];

export default function MarketRoiBadges({ data, linkToBoard = false }: { data: MarketRoiStat; linkToBoard?: boolean }) {
  return (
    <div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {ORDER.map((mk) => {
          const { all, d30 } = data.markets[mk];
          const ready = all.evaluated >= MARKET_ROI_MIN_SAMPLE;
          return (
            <li key={mk} className="flex items-baseline justify-between gap-3 rounded-xl bg-neutral-50 px-4 py-3 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">{LABEL[mk]}</p>
                <p className="mt-0.5 text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">
                  {all.evaluated.toLocaleString()}경기
                  {ready && d30.evaluated > 0 && <> · 최근 30일 {fmtRoiPct(d30.roi)}</>}
                </p>
              </div>
              {ready ? (
                <span
                  className={`shrink-0 text-xl font-bold tabular-nums ${
                    all.roi >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-800 dark:text-neutral-100"
                  }`}
                >
                  {fmtRoiPct(all.roi)}
                </span>
              ) : (
                <span className="shrink-0 text-xs text-neutral-400">집계 중</span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-neutral-500 break-keep dark:text-neutral-400">
        모델 픽마다 1유닛을 걸었다고 가정한 누적 수익률(마진 포함 해외 평균 배당, 킥오프 직전 값). 핸디캡·오버언더는
        시장 기준선이 모델 기준선과 같은 경기만 셉니다. 표본 {MARKET_ROI_MIN_SAMPLE}경기 미만은 집계 중으로 표시합니다.
        {linkToBoard && (
          <>
            {" "}
            <Link href="/predictions/accuracy" className="text-blue-600 hover:underline dark:text-blue-400">
              적중률·수익률 보드
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
