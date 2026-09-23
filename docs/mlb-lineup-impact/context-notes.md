# 컨텍스트 노트
- 09-23 사용자: databallr.com UI 를 가져올 수 있는 만큼 가져오되 1번(MLB)부터. 새 페이지가 아니라 기존 경기 페이지 탭으로 확정.
- databallr VPM 은 시즌 단위 임팩트(100포제션당, 요인 분해)이지 경기별 라인업 민감도가 아니다. 우리 1단계는 "라인업 기대득점 + 선수별 교체 Δ" 로 백로그 문구를 구현한다.
- 재료: 박스스코어 seasonStats.batting 에 wOBA 성분 전부 있음(9/22 gamePk 823543 실측). 리그 R/G 는 teams/stats 로 4.484(9/23). 추가 API 없음.
- 탭 자리는 MlbBoxscoreTabs(클라이언트 7탭)가 아니라 page.tsx MatchInsight tabs(불펜 피로도와 같은 SSR 자리). 이유: 서버에서 이미 받은 mlbBoxscore 로 계산해 JS 를 안 늘린다.
- 이 워크트리의 원래 브랜치는 main 보다 300+ 커밋 뒤라 origin/main 에서 feat/mlb-lineup-impact 를 새로 땄다.
