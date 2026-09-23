# 컨텍스트 노트
- 09-23 사용자: databallr.com UI 를 가져올 수 있는 만큼 가져오되 1번(MLB)부터. 새 페이지가 아니라 기존 경기 페이지 탭으로 확정.
- databallr VPM 은 시즌 단위 임팩트(100포제션당, 요인 분해)이지 경기별 라인업 민감도가 아니다. 우리 1단계는 "라인업 기대득점 + 선수별 교체 Δ" 로 백로그 문구를 구현한다.
- 재료: 박스스코어 seasonStats.batting 에 wOBA 성분 전부 있음(9/22 gamePk 823543 실측). 리그 R/G 는 teams/stats 로 4.484(9/23). 추가 API 없음.
- 탭 자리는 MlbBoxscoreTabs(클라이언트 7탭)가 아니라 page.tsx MatchInsight tabs(불펜 피로도와 같은 SSR 자리). 이유: 서버에서 이미 받은 mlbBoxscore 로 계산해 JS 를 안 늘린다.
- 이 워크트리의 원래 브랜치는 main 보다 300+ 커밋 뒤라 origin/main 에서 feat/mlb-lineup-impact 를 새로 땄다.
- 09-23 구현. 실측(로컬, 9/22 CIN@ATL 401817030): CIN xR 4.14 / ATL 4.21, 리그 4.48(30팀 합계 wOBA .318). 예정 경기(401817035)는 타순 미확정이라 탭 비활성으로 정상.
- 한글 선수명 맵은 pid 키(buildMlbPlayerNameKoMap) — 이름 키로 찾다가 영문으로 나온 것을 고침. 워터폴 누적 표시는 점선 원이 새로고침 아이콘처럼 보여 세로 눈금으로 교체.
- 단위 전환(경기당/타석당)만 클라이언트 상태. 계산은 page.tsx 서버에서 mlbBoxscore 로 끝냄.
- 09-23 2단계. statsapi 팀 스케줄이 hydrate=lineups 로 경기별 선발 9명 id 를 준다(ATL 종료 160경기 중 157 라인업 보유, 1.3MB) → 선수당 18콜 설계 폐기, 팀당 1콜·6h 캐시. 박스스코어 파서에 homeTeamId/awayTeamId 가산.
- WOWY 는 이 경기를 제외(종료 경기 결과가 "출전 평균" 에 섞이는 사후 편향 방지). 출전·결장 어느 쪽이든 10경기 미만이면 차이 대신 "표본 10G 미만".
- 카드 행은 이름 칸 1.7fr, 출전·결장 줄은 truncate 대신 줄바꿈(좁으면 3줄).

