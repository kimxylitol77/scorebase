# 테니스·골프 탭 — 컨텍스트 노트

## 왜 ESPN 직접 fetch 인가
- TheSports 는 tennis/badminton/table-tennis/snooker 등 전부 미인가 (2026-07-23 실측, 영업문의=유료).
- ESPN unofficial 은 이미 NBA·NHL·MLB 라이브에 사용 중인 검증된 패턴. tennis/atp·wta, golf/pga·lpga scoreboard 실측 OK.
- DB 수집(Team=선수 rows·collector·cron) 온보딩은 대공사 + 선수 개인전은 Match/Team 스키마와 안 맞음 → 1차는 표시 전용.

## 구조 결정
- /scores 의 sport 탭에 tennis·golf 추가하되, leagues 기반 DB 파이프라인(normalized)은 두 종목에서 비어 있음.
  sport==="tennis"|"golf" 일 때 전용 섹션 렌더 + 기존 "경기 없음" 빈 상태를 건너뜀.
- ESPN scoreboard 는 ?dates=YYYYMMDD 지원 → 날짜 슬라이더와 연동.
- 테니스 이벤트 구조: events[] = 대회, event.competitions[] = 개별 매치(선수 2, linescores=세트).
- 골프는 리더보드형: events[0].competitions[0].competitors[] = 선수+순위+토탈. 한국 선수 강조(국기 KOR).

## 주의
- ESPN unofficial 이라 스키마 변동 리스크 — 실패 시 빈 배열 graceful (라이브스코어 페이지가 죽으면 안 됨).
- 즐겨찾기 별표·PiP 는 1차 제외 (라이브 API /api/live/scores 에 테니스 없음 — 붙이면 PiP 에 안 떠서 혼란).
