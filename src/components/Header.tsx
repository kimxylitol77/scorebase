import Link from "next/link";
import Logo from "./Logo";
import MobileMenu from "./MobileMenu";
import ThemeToggle from "./ThemeToggle";
import SearchInput from "./SearchInput";
import AdminBadge from "./AdminBadge";
import UserBadge from "./UserBadge";

interface SubItem {
  href: string;
  label: string;
  desc?: string;
}

interface CategoryDef {
  label: string;
  /** 헤더 메뉴 본체 클릭 시 이동할 대표 페이지 */
  href: string;
  items: SubItem[];
}

const SOCCER_LEAGUES: SubItem[] = [
  { href: "/leagues/WORLD_CUP", label: "FIFA 월드컵 2026", desc: "북중미 · 6/11 개막" },
  { href: "/leagues/K_LEAGUE_1", label: "K리그 1", desc: "한국 1부" },
  { href: "/leagues/J1_LEAGUE", label: "J1 리그", desc: "일본 1부" },
  { href: "/leagues/AFC_CL", label: "AFC 챔피언스리그", desc: "아시아" },
  { href: "/leagues/EPL", label: "프리미어리그 (EPL)", desc: "잉글랜드" },
  { href: "/leagues/UCL", label: "챔피언스리그", desc: "유럽" },
  { href: "/leagues/LALIGA", label: "라리가", desc: "스페인" },
  { href: "/leagues/BUNDESLIGA", label: "분데스리가", desc: "독일" },
  { href: "/leagues/SERIE_A", label: "세리에 A", desc: "이탈리아" },
  { href: "/leagues/LIGUE_1", label: "리그 1", desc: "프랑스" },
  { href: "/leagues/MLS", label: "MLS", desc: "북미" },
];

const CATEGORIES: CategoryDef[] = [
  { label: "축구", href: "/leagues/EPL", items: SOCCER_LEAGUES },
  {
    label: "야구",
    href: "/leagues/KBO",
    items: [
      { href: "/leagues/KBO", label: "KBO 리그", desc: "한국 프로야구" },
      { href: "/leagues/NPB", label: "NPB 리그", desc: "일본 프로야구" },
      { href: "/leagues/MLB", label: "MLB", desc: "메이저리그" },
    ],
  },
  {
    label: "농구",
    href: "/leagues/NBA",
    items: [{ href: "/leagues/NBA", label: "NBA", desc: "미국" }],
  },
  {
    label: "기타종목",
    href: "/leagues/NHL",
    items: [
      { href: "/leagues/NHL", label: "NHL", desc: "북미 아이스하키" },
      { href: "/leagues/LOL", label: "LCK", desc: "리그 오브 레전드 한국" },
    ],
  },
];

// 경기 분석 — 경기 전 AI/데이터 도구
const MATCH_ITEMS: SubItem[] = [
  { href: "/previews", label: "프리뷰", desc: "경기 분석 · 예상" },
  { href: "/predictions", label: "예측", desc: "Monte Carlo 시즌 시뮬레이션" },
  { href: "/value-bets", label: "밸류 베트", desc: "Elo 예측 vs 배당사 implied" },
  { href: "/injuries", label: "부상자 명단", desc: "리그별 부상자 · 치료·재활" },
];
// 커뮤니티 — 콘텐츠 · 회원 · 랭킹
const COMMUNITY_ITEMS: SubItem[] = [
  { href: "/notices", label: "공지사항", desc: "사이트 공지 · 패치노트" },
  { href: "/blog", label: "블로그", desc: "스포츠 데이터 분석 인사이트" },
  { href: "/analysis", label: "스포츠 분석", desc: "회원 분석 글 · 예측 적중" },
  { href: "/experts", label: "🏆 예측 전문가", desc: "분석가 적중률 순위 · 프로필" },
  { href: "/transfers", label: "선수 몸값 랭킹", desc: "이적시장 · 시장가치" },
];

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200/80 dark:border-neutral-800/80 bg-white/80 dark:bg-neutral-950/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <Logo />

        {/* 데스크탑 메뉴 */}
        <nav className="hidden sm:flex items-center gap-1 lg:gap-2 text-sm">
          <Link
            href="/scores"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition whitespace-nowrap"
          >
            <span className="relative inline-flex w-1.5 h-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500" />
            </span>
            라이브 스코어
          </Link>
          {CATEGORIES.map((c) => (
            <CategoryDropdown key={c.label} {...c} />
          ))}
          <CategoryDropdown label="경기 분석" href="/previews" items={MATCH_ITEMS} />
          <CategoryDropdown label="커뮤니티" href="/analysis" items={COMMUNITY_ITEMS} />

          {/* 검색 + 다크모드 (데스크탑) */}
          <div className="hidden md:block ml-2">
            <SearchInput variant="compact" />
          </div>
          <div className="ml-1 flex items-center gap-2">
            <UserBadge />
            <AdminBadge />
            <ThemeToggle variant="icon" />
          </div>
        </nav>

        {/* 모바일 — admin 배지 + 햄버거 */}
        <div className="sm:hidden flex items-center gap-2">
          <UserBadge />
          <AdminBadge />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}

function CategoryDropdown({ label, href, items }: CategoryDef) {
  return (
    <div className="relative group">
      <Link
        href={href}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900 transition whitespace-nowrap"
      >
        {label}
        {items.length > 1 && (
          <svg
            className="w-3 h-3 opacity-50 group-hover:opacity-100 transition group-hover:rotate-180"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden
          >
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </Link>

      {items.length > 1 && (
        <div className="absolute left-0 top-full pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity duration-150">
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-xl shadow-neutral-900/10 dark:shadow-black/40 p-1.5 min-w-[220px]">
            {items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-900 transition"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-neutral-900 dark:text-white">
                    {it.label}
                  </span>
                  {it.desc && (
                    <span className="block text-[11px] text-neutral-500">
                      {it.desc}
                    </span>
                  )}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
