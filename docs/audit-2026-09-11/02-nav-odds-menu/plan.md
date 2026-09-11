# 감사 과제 2 [P0] — 상단 네비에 「배당」 메뉴 신설

> 지시서: `docs/SCOREBASE_AUDIT_2026-09-11.md` §2. 브랜치 `audit/02-nav-odds-menu`.

## 무엇을
헤더(데스크톱 드롭다운)와 모바일 메뉴에 「배당」 카테고리를 추가한다. 하위 4개는 지시서 표 그대로
(배당 흐름 `/odds?sport=soccer` · 밸류 베트 `/value-bets` · 베트맨 승부식 `/odds?sport=betman` · 수익률 보드 `/predictions/accuracy`).

## 왜
밸류 베트·수익률 보드가 푸터에서만 닿고, 베트맨은 /odds 4번째 탭에 숨어 있다. 네비가 종목 기준이라
"배당을 보러 온" 사용자가 도달하지 못한다(3회 연속 지적).

## 어떻게
1. `src/components/nav-config.ts` — `ODDS_CATEGORY` 추가(단일 정의라 데스크톱·모바일이 같이 받는다).
   종목 드롭다운의 「배당 흐름」은 그대로 둔다. 활성 판정용 `owns`(이 메뉴가 정본인 경로 접두) 와
   `isCategoryActive(cat, pathname)` 순수 헬퍼를 둔다 — `/odds*` 는 축구·야구·농구에도 같은 링크가 있어
   「배당」만 켜지게 하려면 정본 표시가 필요하다.
2. `src/components/NavDropdown.tsx`(신규, 클라이언트) — Header 의 `CategoryDropdown`(CSS hover 전용)을 대체.
   hover 는 CSS 그대로, 키보드·스크린리더용으로 라벨 옆 화살표를 `button[aria-expanded][aria-controls]` 로
   만들어 Enter/Space 로 열고 닫고, Escape 로 닫고, 포커스가 밖으로 나가면 닫는다. `usePathname` 으로
   현재 페이지가 하위 항목이면 라벨을 활성 스타일로.
3. `src/components/Header.tsx` — 기타종목 뒤·커뮤니티 앞에 「배당」 렌더, 드롭다운을 NavDropdown 으로.
4. `src/components/MobileMenu.tsx` — `ALL_CATEGORIES` 에 배당이 들어가 자동 노출. 그룹 라벨도 활성 표시.
5. 영어판 헤더(`en/EnHeader.tsx`)는 드롭다운 없는 린 목록이고 지시서 범위 밖 — 건드리지 않는다.

## 검증
- tsc · eslint(변경 파일).
- dev 렌더: 1024px(lg 경계)·1280px 에서 헤더가 한 줄에 들어가는지(8번째 항목 추가로 넘침 여부).
- 키보드: Tab 으로 화살표 버튼 도달 → Enter 열림(aria-expanded=true) → Tab 으로 항목 4개 순회 → Escape 닫힘.
- 활성: `/value-bets`·`/predictions/accuracy`·`/odds?sport=betman` 에서 「배당」만 활성, 축구는 비활성.
- 모바일(375px): 메뉴 열면 「배당」 그룹 4항목, 1클릭 도달.
- 지시서 §2 수용 기준 3개 체크 후 지시서 체크박스 갱신.
