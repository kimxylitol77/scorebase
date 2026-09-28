# KBO 경기 상세 라인업 (네이버형) 체크리스트

> 목표. /live/kbo/{id} 의 "오늘의 선발 매치업" 바로 아래에 네이버 라인업 탭과 같은 양 팀 2열 라인업을 넣는다.
> 선발투수 → 타순 1~9(사진·포지션·타석) → 후보 야수 → 불펜 투수. 근거는 context-notes.md.

## 계획

1. KBO 공식 데이터 3종을 묶는 lib → 검증: 9/27 한화-롯데(확정)·9/29 한화-삼성(발표 전) 양 팀 결과 출력.
2. 2열 카드 컴포넌트 + MatchInsight 선발 매치업 아래 배선 → 검증: 로컬 렌더 375px·다크·라이트.
3. tsc·테스트 → 커밋.

## A. 데이터 (src/lib/sports/kbo-lineup.ts)

- [x] GetKboGameList(날짜) → 팀명으로 G_ID·팀코드·선발투수 id 찾기
- [x] GetLineUpAnalysis(G_ID) → 팀별 타순·포지션·이름·WAR, LINEUP_CK(확정 여부)
- [x] Register.aspx 포스트백(팀·날짜) → 1군 등록 선수 id·등번호·투타·구분
- [x] 합치기: 타순↔등록 이름 매칭(사진·타석), 후보 야수=등록 야수−선발, 불펜=등록 투수−선발투수
- [x] unstable_cache 10분

## B. 화면

- [x] KboLineupCard — 양 팀 2열, 선발 배지, 타순 번호, 사진, "유격수, 우타"
- [x] 발표 전 "예상 · 최근 라인업 기준" / 발표 후 "확정" 라벨
- [x] MatchInsight 에 lineupContent prop → 선발 매치업 아래

## C. 검증

- [x] 스크립트로 두 경기 결과 확인
- [x] 로컬 렌더 확인
- [x] tsc · npm test
