// 사이트 공통 푸터 — 홈 애플 카드 톤(라이트/다크 반응형) + 종목별 리그·바로가기·커뮤니티 사이트맵.
import Link from "next/link";
import { Mark } from "./Logo";

// 카테고리 = 헤더 메뉴 방향(종목 그룹)에 맞춤. 리그 직링크는 내부링크·SEO 가치라 칩으로 보존.
const LEAGUE_GROUPS: Array<{ sport: string; leagues: Array<{ code: string; label: string }> }> = [
  {
    sport: "축구",
    leagues: [
      { code: "WORLD_CUP", label: "월드컵 2026" },
      { code: "EPL", label: "EPL" },
      { code: "LALIGA", label: "라리가" },
      { code: "BUNDESLIGA", label: "분데스리가" },
      { code: "SERIE_A", label: "세리에 A" },
      { code: "LIGUE_1", label: "리그 1" },
      { code: "UCL", label: "챔피언스리그" },
      { code: "MLS", label: "MLS" },
    ],
  },
  {
    sport: "야구",
    leagues: [
      { code: "KBO", label: "KBO" },
      { code: "NPB", label: "NPB" },
      { code: "MLB", label: "MLB" },
    ],
  },
  {
    sport: "농구 · 하키 · e스포츠",
    leagues: [
      { code: "NBA", label: "NBA" },
      { code: "NHL", label: "NHL" },
      { code: "LOL", label: "LCK" },
    ],
  },
];

// 바로가기 — AI·데이터 핵심 도구 (신규 페이지 포함)
const TOOLS: Array<{ href: string; label: string }> = [
  { href: "/scores", label: "라이브 스코어" },
  { href: "/predictions", label: "시즌 예측 대시보드" },
  { href: "/predictions/accuracy", label: "적중률 보드" },
  { href: "/predictions/scorecard", label: "AI 예측 성적표" },
  { href: "/predictions/starters", label: "선발 매치업" },
  { href: "/value-bets", label: "밸류 베트" },
  { href: "/transfers", label: "이적시장 · 몸값" },
  { href: "/salaries/mlb", label: "연봉 랭킹" },
  { href: "/injuries", label: "부상자 명단" },
];

// 탐색 · 커뮤니티 — 허브·콘텐츠·회사 정보 (신규 페이지 포함)
const COMMUNITY: Array<{ href: string; label: string }> = [
  { href: "/ai-sports-prediction", label: "AI 스포츠 분석·예측" },
  { href: "/baseball", label: "야구 허브" },
  { href: "/world-cup", label: "FIFA 월드컵 2026" },
  { href: "/blog", label: "블로그" },
  { href: "/analysis", label: "스포츠 분석" },
  { href: "/experts", label: "예측 전문가" },
  { href: "/notices", label: "공지 · 패치노트" },
  { href: "/blog/about-scorebase", label: "스코어베이스 소개" },
  { href: "/about", label: "방법론 · 데이터 흐름" },
];

// 카드 공통 톤 — 홈 UpdateCard/FeaturesSection 과 동일 (라이트=흰 카드 ring+shadow, 다크=elevated)
const CARD =
  "rounded-[1.5rem] sm:rounded-[2rem] bg-white p-5 sm:p-6 shadow-sm ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none";
const CARD_HEADING = "text-[13px] font-semibold tracking-tight text-zinc-950 dark:text-white";
const NAV_LINK =
  "text-[13px] text-neutral-500 transition hover:text-rose-600 dark:text-white/55 dark:hover:text-white";

export default function Footer() {
  return (
    <footer className="mt-20 break-keep border-t border-black/5 bg-neutral-50 dark:border-white/10 dark:bg-transparent">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-14">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
          {/* 카드 1 — 브랜드 */}
          <div className={CARD}>
            <Link href="/" className="flex items-center gap-2">
              <Mark size={28} />
              <span className="text-lg font-black tracking-tight text-zinc-950 dark:text-white">
                스코어베이스
              </span>
            </Link>
            <p className="mt-4 text-[13px] font-medium text-zinc-700 dark:text-white/70">
              통계 기반 AI 스포츠 분석
            </p>
            <p className="mt-2 text-xs leading-relaxed text-neutral-500 dark:text-white/45">
              EPL · 라리가 · 분데스 · 세리에 A · 리그 1 · UCL · MLS · KBO · NPB ·
              MLB · NBA · NHL · FIFA 월드컵 2026 · LCK
            </p>
          </div>

          {/* 카드 2 — 카테고리(종목별 리그) */}
          <div className={CARD}>
            <h3 className={CARD_HEADING}>리그</h3>
            <div className="mt-4 space-y-4">
              {LEAGUE_GROUPS.map((g) => (
                <div key={g.sport}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-white/40">
                    {g.sport}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {g.leagues.map((l) => (
                      <Link
                        key={l.code}
                        href={`/leagues/${l.code}`}
                        className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700 transition hover:bg-rose-50 hover:text-rose-700 dark:bg-white/[0.06] dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
                      >
                        {l.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 카드 3 — 바로가기(AI·데이터 도구) */}
          <div className={CARD}>
            <h3 className={CARD_HEADING}>AI · 데이터</h3>
            <ul className="mt-4 space-y-2.5">
              {TOOLS.map((s) => (
                <li key={s.href}>
                  <Link href={s.href} className={NAV_LINK}>
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 카드 4 — 탐색·커뮤니티 */}
          <div className={CARD}>
            <h3 className={CARD_HEADING}>탐색 · 커뮤니티</h3>
            <ul className="mt-4 space-y-2.5">
              {COMMUNITY.map((s) => (
                <li key={s.href}>
                  <Link href={s.href} className={NAV_LINK}>
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 안내 영역 — 면책·저작권 */}
        <div className="mt-8 space-y-2 border-t border-black/5 pt-6 text-[12px] leading-relaxed text-neutral-500 dark:border-white/10 dark:text-white/55">
          <p>
            본 사이트는 스포츠 정보 제공을 목적으로 하는 미디어이며,{" "}
            <strong className="text-neutral-700 dark:text-white/85">
              도박·베팅과 무관
            </strong>
            합니다.
          </p>
          <p>
            외부 데이터 출처(football-data.org · ESPN · MLB Stats · NHL API 등)를
            정규화하여 표시하며, 시즌 시뮬레이션·승률 추정치·Value Bet 표시는{" "}
            <strong className="text-neutral-700 dark:text-white/85">
              통계 모델 기반의 참고용 정보
            </strong>
            입니다. 실제 경기 결과와 다를 수 있습니다.
          </p>
          <p>
            본 사이트의 모든 기사·이미지·통계 분석·예측 콘텐츠는 저작권법에 의해
            보호되며, 사전 서면 동의 없는{" "}
            <strong className="text-rose-600 dark:text-rose-300/90">
              무단 전재·복제·재배포·상업적 이용
            </strong>
            을 엄격히 금지합니다.
          </p>
        </div>

        {/* 하단 — 좌우 */}
        <div className="mt-6 flex flex-col gap-2 border-t border-black/5 pt-5 text-xs text-neutral-400 dark:border-white/10 dark:text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <div>
            © 2026 스코어베이스 (Scorebase). All rights reserved. · 무단
            전재·재배포 금지
          </div>
          <div>
            Built with{" "}
            <strong className="text-neutral-600 dark:text-white/80">
              Claude Code
            </strong>{" "}
            · Powered by{" "}
            <strong className="text-neutral-600 dark:text-white/80">
              Claude Fable 5 + Gemini + ChatGPT
            </strong>{" "}
            · Next.js
          </div>
        </div>
      </div>
    </footer>
  );
}
