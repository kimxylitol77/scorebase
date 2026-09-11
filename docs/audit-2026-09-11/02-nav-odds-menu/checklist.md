# 체크리스트 — 과제 2 상단 네비 「배당」

## 구현
- [x] `nav-config.ts`: `ODDS_CATEGORY`(4항목) + `owns` + `isCategoryActive` + `ALL_CATEGORIES` 포함
- [x] `NavDropdown.tsx`: hover 유지 + aria-expanded 토글 버튼 + Escape/포커스 이탈 닫힘 + 활성 스타일
- [x] `Header.tsx`: 「배당」 렌더(기타종목 뒤) + NavDropdown 교체
- [x] `MobileMenu.tsx`: 그룹 라벨 활성 표시

## 검증
- [x] tsc 통과
- [x] eslint(변경 파일) 통과
- [x] 1024px·1280px 헤더 한 줄 유지
- [x] 키보드 Tab/Enter/Escape 동작 + aria-expanded 토글
- [x] 활성 표시: /value-bets · /predictions/accuracy · /odds?sport=betman
- [x] 모바일 메뉴에 「배당」 4항목

## 지시서 §2 수용 기준
- [x] 데스크톱·모바일 상단 1클릭으로 /value-bets · /predictions/accuracy · /odds?sport=betman 도달
- [x] 키보드(Tab/Enter)·스크린리더로 열고 닫힘
- [x] 하위 항목 페이지에서 「배당」 활성 표시

## 마무리
- [x] 지시서 §2 체크박스 갱신
- [x] 커밋 (브랜치 `audit/02-nav-odds-menu`)
