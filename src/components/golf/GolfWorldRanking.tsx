// 골프 세계랭킹(남자 OWGR) 표 — data/golf-world-rankings.json 정적 서빙.
// 여자(Rolex) 는 서버 접근 가능한 안정 소스 미확보로 "준비 중" 안내만.

import worldData from "../../../data/golf-world-rankings.json";

interface WorldPlayer {
  rank: number;
  isTied: boolean;
  name: string;
  nameKo: string | null;
  country: string;
  code2: string;
  lastWeekRank: number | null;
  pointsAverage: number | null;
}
const DATA = worldData as { updatedAt: string; source: string; men: WorldPlayer[] };

// 등장 국가 한글명 (top100 기준 21개국) — 없으면 영문 그대로.
const COUNTRY_KO: Record<string, string> = {
  "United States": "미국",
  "South Korea": "대한민국",
  Japan: "일본",
  England: "잉글랜드",
  Scotland: "스코틀랜드",
  "Northern Ireland": "북아일랜드",
  Ireland: "아일랜드",
  Spain: "스페인",
  Germany: "독일",
  Sweden: "스웨덴",
  Norway: "노르웨이",
  Denmark: "덴마크",
  Finland: "핀란드",
  Belgium: "벨기에",
  Austria: "오스트리아",
  Australia: "호주",
  "New Zealand": "뉴질랜드",
  Canada: "캐나다",
  "South Africa": "남아프리카공화국",
  Chile: "칠레",
  Colombia: "콜롬비아",
};

// 영국 구성국은 ISO2 가 없어 유니코드 지역기(subdivision) 로 별도 처리.
const SPECIAL_FLAG: Record<string, string> = {
  England: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  Scotland: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  Wales: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  "Northern Ireland": "🇬🇧",
};

function flagEmoji(code2: string, country: string): string {
  if (SPECIAL_FLAG[country]) return SPECIAL_FLAG[country];
  if (!/^[A-Za-z]{2}$/.test(code2)) return "🏳️";
  const cc = code2.toUpperCase();
  return String.fromCodePoint(
    ...[...cc].map((ch) => 0x1f1e6 + (ch.charCodeAt(0) - 65)),
  );
}

// 전주 대비 등락 — 양수=상승. lastWeekRank 없으면(신규 진입) null.
function movement(rank: number, lastWeek: number | null): number | null {
  if (lastWeek == null) return null;
  return lastWeek - rank;
}

export default function GolfWorldRanking() {
  const men = DATA.men;

  return (
    <div className="space-y-4">
      {/* 성별 탭 — 남자만 활성, 여자 준비 중 */}
      <div className="inline-flex rounded-full border border-neutral-200 bg-neutral-100/60 p-1 dark:border-neutral-800 dark:bg-white/[0.04]">
        <span className="rounded-full bg-white px-5 py-1.5 text-sm font-bold text-sky-600 shadow-sm dark:bg-white/10 dark:text-sky-300">
          남자 (OWGR)
        </span>
        <span
          className="rounded-full px-5 py-1.5 text-sm font-medium text-neutral-300 dark:text-neutral-600"
          title="여자 세계랭킹(Rolex)은 데이터 소스 준비 중입니다."
        >
          여자 · 준비 중
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <div className="grid grid-cols-[44px_1fr_56px] sm:grid-cols-[56px_1fr_72px] items-center gap-2 border-b border-neutral-100 px-3 sm:px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:border-neutral-800">
          <span className="text-center">순위</span>
          <span>선수</span>
          <span className="text-center">평균점</span>
        </div>
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {men.map((p) => {
            const kr = p.code2 === "KR";
            const mv = movement(p.rank, p.lastWeekRank);
            return (
              <li
                key={p.rank + p.name}
                className={`grid grid-cols-[44px_1fr_56px] sm:grid-cols-[56px_1fr_72px] items-center gap-2 px-3 sm:px-4 py-2.5 ${
                  kr ? "bg-rose-500/[0.06] dark:bg-rose-500/[0.08]" : ""
                }`}
              >
                <span className="flex flex-col items-center leading-none">
                  <span
                    className={`text-sm font-black tabular-nums ${
                      p.rank <= 3 ? "text-amber-500" : "text-neutral-700 dark:text-neutral-300"
                    }`}
                  >
                    {p.isTied ? "T" : ""}
                    {p.rank}
                  </span>
                  {mv != null && mv !== 0 && (
                    <span
                      className={`mt-0.5 text-[10px] font-bold tabular-nums ${
                        mv > 0 ? "text-emerald-500" : "text-red-400"
                      }`}
                    >
                      {mv > 0 ? `▲${mv}` : `▼${Math.abs(mv)}`}
                    </span>
                  )}
                  {mv == null && (
                    <span className="mt-0.5 text-[10px] font-bold text-sky-400">NEW</span>
                  )}
                </span>

                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="text-base leading-none" aria-hidden>
                      {flagEmoji(p.code2, p.country)}
                    </span>
                    <span
                      className={`truncate text-sm font-semibold ${
                        kr
                          ? "text-rose-600 dark:text-rose-300"
                          : "text-neutral-900 dark:text-white"
                      }`}
                    >
                      {p.nameKo ?? p.name}
                    </span>
                    {kr && (
                      <span className="shrink-0 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-300">
                        한국
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-[11px] text-neutral-400">
                    {p.nameKo ? `${p.name} · ` : ""}
                    {COUNTRY_KO[p.country] ?? p.country}
                  </span>
                </span>

                <span className="text-center text-sm tabular-nums text-neutral-600 dark:text-neutral-400">
                  {p.pointsAverage != null ? p.pointsAverage.toFixed(2) : "-"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-3 text-xs text-neutral-500 dark:border-neutral-700">
        여자 세계랭킹(Rolex Women&apos;s World Golf Rankings)은 공식 데이터 소스 확보 후 추가할
        예정입니다.
      </p>

      <footer className="text-[11px] text-neutral-400 leading-relaxed">
        공식 세계랭킹 출처 OWGR(Official World Golf Ranking). 등락은 전주 대비, NEW 는 신규 진입.
        마지막 갱신 {DATA.updatedAt.slice(0, 10)}.
      </footer>
    </div>
  );
}
