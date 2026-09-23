# 야구 선수 스탯 마스터 표 — 계획 (2026-09-23)

**무엇.** `/baseball/stats` 새 페이지. databallr /stats 문법(모든 지표에 리그 백분위, 열 묶음, 합계·경기당 전환, 팀·검색 필터, 정렬, 두 명 비교)을 KBO·MLB·NPB 시즌 기록에 적용.
**왜.** 야구 선수 시즌 기록(BaseballPlayerSeasonStats, 매일 갱신)은 있는데 "한 표에서 훑고 정렬하고 비교" 하는 화면이 없다. 랭킹 페이지는 종합 점수 순위만 보여준다.
**데이터.** BaseballPlayerSeasonStats 2026 (KBO 554·MLB 1,662·NPB 733). 추가 API 없음. 타자 G·AVG·H·HR·RBI·OPS, 투수 G·ERA·WHIP·IP·SO·W·L·SV + 파생(K/9, H/G·HR/G·RBI/G, IP/G).

## 규칙
- 백분위 = 리그·역할별 "규정 표본" 안에서 나보다 낮은 값의 비율(ERA·WHIP·L 은 낮을수록 좋으므로 반전). 규정 = 타자 시즌 최다 출장의 50% 이상, 투수 30이닝 이상(랭킹 페이지 POWER 기준과 동일). 미달 선수는 표에 남기되 백분위 대신 "—" 와 회색.
- 서버 렌더. 정렬·필터·페이지·비교(cmp=id,id)는 쿼리스트링. 클라이언트 JS 없음.
- 선수 링크·사진은 랭킹 페이지와 같은 규칙(externalId → /players/{id}?league=, kboPhotoUrl·mlbHeadshotUrl·npbPlayerPhoto).
- 색: 백분위 80+ rose 진하게, 60+ 연하게, 40 미만 회색. 다크 elevated.

## 화면
1. 헤더 eyebrow + 제목 "야구 선수 스탯" + 리그 필(KBO·MLB·NPB) + 역할 필(타자·투수) + 단위 필(합계·경기당) + 규정 토글.
2. 툴바: 팀 select(링크 칩), 검색(q), 결과 수.
3. 표: 고정 헤더, 열 클릭 정렬(↑↓), 셀 = 값 + 아래 작은 백분위, 선수 셀 = 사진·이름·팀·역할. 행 끝 "비교" 링크(cmp 에 담기, 최대 2).
4. 비교 바(cmp 2명일 때 상단 카드): 지표별 두 값과 백분위 막대 나란히.
5. 페이지 50행, 페이지네이션 pill.

## 산출물
- `src/lib/sports/baseball/stats-table.ts` 순수 계산(규정·백분위·파생·정렬) + 테스트
- `src/app/baseball/stats/page.tsx`
- 랭킹 페이지·야구 허브에 진입 링크, sitemap 등록 확인
- 후속: MLB statsapi 확장 지표(wOBA·BB%·K%), 축구 표

## 2차 (09-23) — databallr 인터페이스 이식 (야구·축구 표 공통)
- 열 묶음 헤더(PROFILE/COUNTING 식): 프로필·타격/투구·확장 / 출전·공격·수비·기타·GK.
- 용어·산식 설명(Stats Glossary): 접이식, 열 메타 desc 로 생성.
- 뷰 전환 필: 표 / 카드(Showcase 식 순위 배지·사진·헤드라인 3지표+백분위) / 리더(열별 상위 5) / 산점도(두 열 x·y, SVG, 규정 선수, 비교 선수 강조).
- 모바일: 선수 열 sticky.
- 공통 컴포넌트 `src/components/stats/`(StatsViewRow 입력). 클라이언트 JS 없음 유지.

