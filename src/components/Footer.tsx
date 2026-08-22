// 사이트 공통 푸터 — 홈 애플 카드 톤(라이트/다크 반응형) + 종목별 리그·바로가기·커뮤니티 사이트맵.
import Link from "next/link";
import Image from "next/image";
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
      { code: "UEL", label: "유로파리그" },
      { code: "UECL", label: "컨퍼런스리그" },
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
  { href: "/rankings/value-clubs", label: "가성비 구단 랭킹" },
  { href: "/salaries/mlb", label: "연봉 랭킹" },
  { href: "/injuries", label: "부상자 명단" },
];

// 탐색 · 커뮤니티 — 허브·콘텐츠·회사 정보 (신규 페이지 포함)
const COMMUNITY: Array<{ href: string; label: string }> = [
  { href: "/app", label: "앱 설치 (홈 화면에 추가)" },
  { href: "/ai-sports-prediction", label: "AI 스포츠 분석·예측" },
  { href: "/compare/live-score-apps", label: "라이브스코어 앱 비교" },
  { href: "/baseball", label: "야구 허브" },
  { href: "/basketball", label: "농구 허브" },
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

// 공개 텔레그램 채널 — env 미설정이면 렌더 안 함 (채널 개설 전 죽은 링크 금지)
const TELEGRAM_CHANNEL_URL = process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_URL;

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
              MLB · NBA · NHL · LCK
            </p>
            {/* 앱 설치 배너 — 앱 아이콘 이미지로 눈에 띄게 (클릭 시 /app 설치 안내) */}
            <Link
              href="/app"
              className="mt-4 flex items-center gap-3 rounded-2xl border border-blue-500/20 bg-gradient-to-r from-blue-500/10 to-purple-500/10 p-3 transition hover:from-blue-500/15 hover:to-purple-500/15"
            >
              <Image
                src="/icon-192.png"
                alt="스코어베이스 앱 아이콘"
                width={44}
                height={44}
                className="rounded-xl shadow-sm"
              />
              <span className="flex min-w-0 flex-col">
                <span className="whitespace-nowrap text-[13px] font-bold text-zinc-950 dark:text-white">
                  스코어베이스 앱 설치
                </span>
                <span className="whitespace-nowrap text-[11px] text-neutral-500 dark:text-white/50">
                  홈 화면에 추가 · 무료
                </span>
              </span>
            </Link>
            {TELEGRAM_CHANNEL_URL && (
              <a
                href={TELEGRAM_CHANNEL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2.5 inline-flex items-center rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:bg-rose-50 hover:text-rose-700 dark:bg-white/[0.06] dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
              >
                텔레그램 채널 구독
              </a>
            )}
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
          {/* 포지셔닝 — 배당·밸류베트를 다루면서 "베팅과 무관"이라 쓰면 스스로 충돌한다(2026-08-22 리뷰 T3).
              회피 대신 명시: 베팅 서비스 아님 + 권유 아님 + 합법 사업자 외 미지원 + 책임·절제 안내. */}
          <p>
            본 사이트는 스포츠 정보와 통계 분석을 제공하는 미디어이며,{" "}
            <strong className="text-neutral-700 dark:text-white/85">
              베팅 서비스를 직접 제공하지 않고 베팅을 권유하지 않습니다
            </strong>
            . 배당·확률 정보는 스포츠 분석 참고용이며, AI 예측은 경기 결과를 보장하지 않습니다.
          </p>
          <p>
            실제 베팅은 이용자 본인의 책임이며, 합법적으로 허가된 사업자(국민체육진흥공단 스포츠토토)와
            규제 환경 안에서만 이용해야 합니다. 국내법상 불법 사설 베팅 이용을 지원하지 않습니다.{" "}
            <strong className="text-neutral-700 dark:text-white/85">만 19세 미만 이용 불가.</strong>{" "}
            과도한 이용과 손실을 피하시고, 도박 문제로 어려움을 겪고 있다면{" "}
            <a
              href="https://www.kcgp.or.kr"
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="underline underline-offset-2 hover:text-neutral-700 dark:hover:text-white/85"
            >
              한국도박문제예방치유원 상담전화 1336
            </a>
            (연중무휴)으로 연락하세요.
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
          {/* 브랜드 정의 — 동명의 타 서비스와 혼동 방지. AI 검색·LLM 이 브랜드 질의에
              인용할 수 있는 명시적 한 문장 (GEO Brand 병목 대응). */}
          <p>
            <strong className="text-neutral-700 dark:text-white/85">
              스코어베이스(Scorebase)
            </strong>
            는 scorebase.kr 에서 운영되는 AI 스포츠 데이터 분석·라이브스코어
            미디어이며, 동명의 야구 기록 앱·체조 채점 시스템 등 다른 서비스와는
            무관한 독립 서비스입니다.
          </p>
        </div>

        {/* 하단 — 좌우 */}
        <div className="mt-6 flex flex-col gap-2 border-t border-black/5 pt-5 text-xs text-neutral-400 dark:border-white/10 dark:text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              © 2026 스코어베이스 (Scorebase). All rights reserved. · 무단
              전재·재배포 금지
            </span>
            <Link href="/terms" className="hover:underline">이용약관</Link>
            <Link href="/privacy" className="font-semibold hover:underline">개인정보처리방침</Link>
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
