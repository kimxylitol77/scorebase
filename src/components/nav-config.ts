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
      { href: "/soccer/korea", label: "해외파 한국 선수", desc: "유럽·MLS 시즌 성적 · 다음 경기" },
      { href: "/transfers", label: "몸값·가치 랭킹", desc: "선수 이적가치 · 가성비 구단" },
      { href: "/odds?sport=soccer", label: "배당 흐름", desc: "밸류 베트 · 시장 움직임 실시간" },
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
      { href: "/salaries/kbo", label: "연봉 랭킹", desc: "KBO·MLB 선수 연봉 (페이지 탭 전환)" },
      { href: "/odds?sport=baseball", label: "배당 흐름", desc: "머니라인이 움직이는 방향" },
    ],
  },
  {
    label: "농구",
    href: "/basketball",
    items: [
      { href: "/basketball", label: "농구 허브", desc: "NBA·WNBA·KBL 순위·예측·기록 한눈에" },
      { href: "/predictions/NBA", label: "시즌 예측", desc: "NBA·WNBA 우승·플레이오프 확률" },
      { href: "/standings", label: "리그 순위", desc: "NBA·WNBA 컨퍼런스 순위" },
      { href: "/transactions/nba", label: "NBA 트랜잭션", desc: "트레이드·FA·방출" },
      { href: "/salaries/nba", label: "NBA 연봉 랭킹", desc: "선수별 연봉 순위" },
      { href: "/odds?sport=basketball", label: "배당 흐름", desc: "머니라인이 움직이는 방향" },
    ],
  },
  {
    label: "기타종목",
    href: "/other",
    items: [
      { href: "/other", label: "기타 종목 허브", desc: "하키·배구·e스포츠·테니스·골프·F1 한눈에" },
      { href: "/hockey", label: "하키 허브", desc: "NHL·세계선수권 순위·선수·예측" },
      { href: "/scores?sport=volleyball", label: "배구", desc: "VNL 발리볼 네이션스리그" },
      { href: "/standings/LOL", label: "LCK", desc: "리그 오브 레전드 한국 · 순위·선수" },
      { href: "/rankings/tennis", label: "테니스 세계랭킹", desc: "ATP·WTA 150위 · 한국어 선수명" },
      { href: "/golf/korea", label: "골프 한국 선수", desc: "PGA·LPGA 우승·톱10 시즌 집계" },
      { href: "/rankings/f1", label: "F1 챔피언십", desc: "드라이버·컨스트럭터 포인트" },
      { href: "/standings", label: "리그 순위", desc: "NHL·VNL·LCK 등 전 종목" },
    ],
  },
];

// 커뮤니티 — 콘텐츠·회원·랭킹 (+ 부상자 명단·AI 프리뷰 모음: 종목 무관 공통이라 여기로)
export const COMMUNITY_CATEGORY: NavCategory = {
  label: "커뮤니티",
  href: "/analysis",
  items: [
    // 게시판 통합(BoardTabs) — 분석·자유·블로그·공지가 한 탭 바로 묶여 메뉴도 1개
    { href: "/analysis", label: "게시판", desc: "분석·자유·블로그·공지 한 곳에" },
    // 해외 뉴스는 봇 발행 전용이라 성격이 달라 메뉴에 따로 노출 (BoardTabs 로도 오갈 수 있음)
    { href: "/news", label: "해외 뉴스", desc: "BBC·Athletic·ESPN 등 공신력 소스 한국어 브리핑" },
    { href: "/picks", label: "승부예측", desc: "원클릭 투표 · 나 vs AI 적중 대결" },
    { href: "/picks/strong", label: "고확신 픽", desc: "AI가 자신 있어 하는 경기만 · 회원 공개" },
    { href: "/previews", label: "AI 프리뷰 모음", desc: "전 종목 경기 전 예측·분석" },
    { href: "/predictions/scorecard", label: "AI 예측 성적표", desc: "우리 AI vs GPT-5.6 적중률 대결" },
    { href: "/lab", label: "커스텀 봇", desc: "손잡이 5개로 나만의 예측 봇 · 즉석 백테스트" },
    { href: "/dream-team", label: "드림팀 빌더", desc: "나만의 스쿼드 빌드 · 봇 대전" },
    { href: "/lineup", label: "라인업 전술판", desc: "포메이션에 선수 배치 · 이미지 공유" },
    { href: "/injuries", label: "부상자 명단", desc: "리그별 부상자 · 치료·재활" },
  ],
};

/** 모바일 메뉴용 — 종목 4 + 커뮤니티 평면 리스트 */
export const ALL_CATEGORIES: NavCategory[] = [...SPORT_CATEGORIES, COMMUNITY_CATEGORY];
