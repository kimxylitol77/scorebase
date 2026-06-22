// 헤더(데스크탑 드롭다운) + 모바일 메뉴 공유 네비게이션 정의.
//
// 원칙: 종목 메뉴 = "그 종목의 우리 제품"(AI 프리뷰·예측·순위·선발 매치업) 묶음.
//   개별 리그(EPL·라리가·KBO 등) 직링크는 헤더에서 가치가 낮아 제거 — 라이브 스코어·
//   리그 순위·검색에 위임. 우리 차별점(AI 데이터)을 메뉴 전면에 노출하는 게 목적.
//   (이전엔 축구 ▼ 아래 리그 11개 나열 + 종목 무관 "경기 분석" 메뉴로 분산돼 있었음)
//
// Header.tsx(서버) · MobileMenu.tsx(클라이언트) 양쪽이 이 단일 정의를 import →
//   과거처럼 두 파일이 따로 놀던 불일치(데스크탑엔 K리그 있고 모바일엔 없던) 차단.

export interface NavSubItem {
  href: string;
  label: string;
  desc?: string;
}

export interface NavCategory {
  label: string;
  /** 종목명 자체 클릭 시 이동할 대표 페이지 (데스크탑 드롭다운 헤더) */
  href: string;
  items: NavSubItem[];
}

export const SPORT_CATEGORIES: NavCategory[] = [
  {
    label: "축구",
    href: "/soccer",
    items: [
      { href: "/soccer", label: "축구 허브", desc: "빅5 리그·순위·예측 한눈에" },
      { href: "/predictions", label: "시즌 예측", desc: "Monte Carlo 우승·강등 확률" },
      { href: "/world-cup", label: "FIFA 월드컵 2026", desc: "북중미 · 일정·우승 확률" },
      { href: "/standings", label: "리그 순위", desc: "EPL·라리가·K리그 등" },
      { href: "/transfers", label: "선수 몸값 랭킹", desc: "이적시장 · 시장가치" },
      { href: "/compare", label: "선수 비교", desc: "선수 head-to-head 스탯 비교" },
      { href: "/value-bets", label: "밸류 베트", desc: "Elo 예측 vs 배당 implied" },
    ],
  },
  {
    label: "야구",
    href: "/baseball",
    items: [
      { href: "/baseball", label: "야구 허브", desc: "오늘 경기·순위·예측·선수 한눈에" },
      { href: "/predictions/starters", label: "선발 매치업", desc: "선발 투수 맞대결 비교" },
      { href: "/predictions/KBO", label: "시즌 예측", desc: "KBO·MLB·NPB 우승 확률" },
      { href: "/standings", label: "리그 순위", desc: "KBO·MLB·NPB" },
      { href: "/salaries/kbo", label: "KBO 연봉 랭킹", desc: "국내 선수 연봉 순위" },
      { href: "/salaries/mlb", label: "MLB 연봉 랭킹", desc: "선수별 연봉·한화 환산" },
    ],
  },
  {
    label: "농구",
    href: "/leagues/NBA",
    items: [
      { href: "/leagues/NBA", label: "NBA 허브", desc: "순위·일정·예측·기록" },
      { href: "/standings", label: "리그 순위", desc: "NBA 컨퍼런스 순위" },
      { href: "/transactions/nba", label: "NBA 트랜잭션", desc: "트레이드·FA·방출" },
      { href: "/salaries/nba", label: "NBA 연봉 랭킹", desc: "선수별 연봉 순위" },
    ],
  },
  {
    label: "기타종목",
    href: "/scores",
    items: [
      { href: "/leagues/NHL", label: "NHL 아이스하키", desc: "북미 · 골리 매치업" },
      { href: "/leagues/LOL", label: "LCK", desc: "리그 오브 레전드 한국" },
      { href: "/standings", label: "리그 순위", desc: "NHL·LCK·LEC·LCS" },
    ],
  },
];

// 커뮤니티 — 콘텐츠·회원·랭킹 (+ 부상자 명단·AI 프리뷰 모음: 종목 무관 공통이라 여기로)
export const COMMUNITY_CATEGORY: NavCategory = {
  label: "커뮤니티",
  href: "/analysis",
  items: [
    { href: "/previews", label: "AI 프리뷰 모음", desc: "전 종목 경기 전 예측·분석" },
    { href: "/notices", label: "공지사항", desc: "사이트 공지 · 패치노트" },
    { href: "/blog", label: "블로그", desc: "스포츠 데이터 분석 인사이트" },
    { href: "/analysis", label: "스포츠 분석", desc: "회원 분석 글 · 예측 적중" },
    { href: "/experts", label: "예측 전문가", desc: "분석가 적중률 순위 · 프로필" },
    { href: "/injuries", label: "부상자 명단", desc: "리그별 부상자 · 치료·재활" },
  ],
};

/** 모바일 메뉴용 — 종목 4 + 커뮤니티 평면 리스트 */
export const ALL_CATEGORIES: NavCategory[] = [...SPORT_CATEGORIES, COMMUNITY_CATEGORY];
