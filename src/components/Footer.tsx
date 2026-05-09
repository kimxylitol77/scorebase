import Link from "next/link";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-20 border-t border-neutral-200 dark:border-neutral-800">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-1 sm:grid-cols-3 gap-8 text-sm">
        <div>
          <div className="text-lg font-black tracking-tight">Scorebase</div>
          <p className="mt-2 text-neutral-500 leading-relaxed">
            매일 정리되는 글로벌 스포츠.<br />EPL · NBA · NHL · MLB.
          </p>
        </div>

        <div>
          <div className="font-semibold text-neutral-700 dark:text-neutral-200 mb-2">
            카테고리
          </div>
          <ul className="space-y-1.5 text-neutral-500 grid grid-cols-2 gap-x-3">
            <li><Link href="/leagues/EPL" className="hover:text-neutral-900 dark:hover:text-white transition">EPL</Link></li>
            <li><Link href="/leagues/LALIGA" className="hover:text-neutral-900 dark:hover:text-white transition">라리가</Link></li>
            <li><Link href="/leagues/BUNDESLIGA" className="hover:text-neutral-900 dark:hover:text-white transition">분데스리가</Link></li>
            <li><Link href="/leagues/SERIE_A" className="hover:text-neutral-900 dark:hover:text-white transition">세리에 A</Link></li>
            <li><Link href="/leagues/LIGUE_1" className="hover:text-neutral-900 dark:hover:text-white transition">리그 1</Link></li>
            <li><Link href="/leagues/MLS" className="hover:text-neutral-900 dark:hover:text-white transition">MLS</Link></li>
            <li><Link href="/leagues/UCL" className="hover:text-neutral-900 dark:hover:text-white transition">챔스</Link></li>
            <li><Link href="/leagues/NBA" className="hover:text-neutral-900 dark:hover:text-white transition">NBA</Link></li>
            <li><Link href="/leagues/MLB" className="hover:text-neutral-900 dark:hover:text-white transition">MLB</Link></li>
            <li><Link href="/leagues/NHL" className="hover:text-neutral-900 dark:hover:text-white transition">NHL</Link></li>
          </ul>
        </div>

        <div>
          <div className="font-semibold text-neutral-700 dark:text-neutral-200 mb-2">
            안내
          </div>
          <div className="space-y-2 text-[11px] leading-relaxed text-neutral-500">
            <p>
              본 사이트는 스포츠 정보 제공을 목적으로 하는 미디어이며,{" "}
              <strong className="text-neutral-700 dark:text-neutral-300">
                도박·베팅과 무관
              </strong>
              합니다.
            </p>
            <p>
              경기 결과·통계는 외부 데이터 출처(football-data.org, ESPN 등)를
              정규화하여 표시하며, 시즌 시뮬레이션과 승률 추정치는 통계 모델
              기반의 참고용 정보입니다. 실제 경기 결과와 다를 수 있습니다.
            </p>
            <p>
              본 사이트의 모든 기사·이미지·통계 분석·예측 콘텐츠는{" "}
              <strong className="text-neutral-700 dark:text-neutral-300">
                저작권법
              </strong>
              에 의해 보호됩니다.
            </p>
            <p className="text-rose-600/80 dark:text-rose-400/80 font-medium">
              ⚠ 사전 서면 동의 없는 <strong>무단 전재·복제·재배포·상업적 이용</strong>을
              엄격히 금지합니다.
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-neutral-200 dark:border-neutral-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-neutral-500">
          <div>
            © {year} Scorebase. All rights reserved.
            <span className="hidden sm:inline ml-2 text-neutral-400">
              · 무단 전재·재배포 금지
            </span>
          </div>
          <div>Built with Next.js · Powered by Gemini</div>
        </div>
      </div>
    </footer>
  );
}
