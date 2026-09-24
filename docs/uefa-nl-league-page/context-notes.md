# 컨텍스트 노트 — UEFA 네이션스리그 페이지

## 2026-09-24 착수

**왜 지금인가.** 대회 개막일이 오늘이다(첫 경기 KST 9/25 01:45). 구조를 지금 만들어야
첫 라운드부터 데이터가 쌓인다.

**UEFA_NL 은 어제 처음 수집됐다.** `national-team-collect-gap` 메모리 참고 — collect 라우트
주석엔 "af 계속 사용"이라 적혀 있었지만 `ALL_LEAGUES` 에 없어 한 번도 수집된 적이 없었다.
9/23 에 등록돼 9/24~10/1 7일치 60경기가 처음 들어왔다.

**조별 표 렌더는 이미 있다.** `/standings/[league]/page.tsx:452` 가 ts 표를 group 번호로
갈라 A조·B조 섹션으로 그린다. 문제는 이 경로가 ts 전용이라는 것. af 는 소스 분기에 없다.
그래서 UEFA_NL 은 `source = "calc"` 로 떨어지고, DB 종료 0건이라 Team row 3개만 남는다.

**af 그룹 라벨이 길다.** `"UEFA Nations League , League A, Group 1"` 처럼 대회명이 접두로
붙고 쉼표 앞에 공백이 있다. 파싱할 때 대회명을 떼고 League/Group 만 뽑아야 한다.

**전수 조사에서 같은 증상은 UEFA_NL 뿐이었다.** AFCON 이 48팀 평면 표로 보여서 처음엔
같이 깨진 줄 알았는데, 실제로는 ts 조별 표 12개가 이미 있고 전부 0경기(2027 대회)라
"지난 시즌 최종 순위" 라벨을 달고 대기 중인 정상 동작이었다. 판단 전에 ts 표의 경기수
합계를 반드시 확인할 것 — 화면만 보면 오진한다.

**Team row 가 적은 건 UEFA_NL 만의 문제가 아니다.** AFC_CL 3개, COPA_SUD 2개, GULF_CUP 1개
등 컵 대회 전반이 낮다(`uefa-qualifier-team-mapping-gap`). 다만 이들은 ts 표가 있어 화면이
멀쩡하다. Team row 는 순위가 calc 로 떨어질 때만 표면화된다.
