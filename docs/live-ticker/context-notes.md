# 라이브 티커 — 컨텍스트 노트

## 설계 결정

- **무상태 파생 뷰로 구현**. 탐색 단계에서는 LiveCommentary.eventComments(설계만 있고 미사용)
  채우는 파이프라인(크론/narrator 확장)을 검토했으나, 축구 폴링 API(/api/live/match)가 이미
  한글 선수명 SoccerEvent[] 를 반환하고 야구 linescore 는 그 자체가 전체 히스토리라
  "이벤트 → 한국어 문장" 순수 함수만 있으면 됨. 신규 API 0, 크론 0, DB 쓰기 0.
- **LLM 0**. 반응 느낌은 상황 꼬리말(선취골/동점/역전/추격/달아남)을 누적 스코어 연산으로
  결정론 생성. Claude 플레이버는 eventComments 스키마가 이미 있으므로 후속에서 층으로 추가 가능.
- **골 누적 스코어는 incident 원본값 사용**. ts 골 incident 의 home_score/away_score 를
  SoccerEvent 에 추가(옵션 필드). af fallback 이벤트에는 없음 → 빌더가 순차 카운트로 대체.
  자책골 귀속 모호성 때문에 원본값 우선.
- **축구 UI = 기존 MatchEventTabs 의 첫 탭 "중계"** — 새 레이아웃 없이 기존 골/이벤트/교체영향
  묶음에 편승. 야구 UI = 스코어보드 아래 피드.
- **교체 방향 함정**: tsIncidentsToEvents 가 이미 swap 교정 — event.playerName=실제 IN,
  assistName=실제 OUT. 티커도 이 계약을 따름.
- **K리그 커버 확인됨**: K_LEAGUE_1/2 모두 ts 매핑 존재 (league-id-mapping.json) — incidents
  2초 폴러로 적재 중. MLB 는 기존 "중계" 탭(ESPN pbp)이 있어 제외.
- **tsIncidentsToEvents 는 최신순 반환** — 빌더 내부에서 (minute, extra) 오름차순 재정렬 후
  누적 계산.

## 진행 로그
- 2026-07-18 설계 확정 (무상태 파생), 구현 시작.
