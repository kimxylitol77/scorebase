# 원페이지 프리뷰 — 컨텍스트 노트

## 2026-07-17 설계 결정

- **A안(글 페이지에 위젯 추가) 채택, B안(매치 상세 재배치) 기각.** 매치 상세는 1,713줄
  조건 분기라 회귀 리스크. 글 페이지는 이미 MatchInsight(AI 확률+Elo+축구 캐시 탭)·
  투표·부상·이닝차트가 있어 실제 갭은 H2H 위젯(비축구)과 배당뿐.
- **H2H = fetchMatchExtras + MatchHeadToHead 재사용.** 라이브 페이지와 동일 데이터 경로.
  축구는 buildSoccerCacheTabs 가 MatchInsight 탭에 H2H 를 이미 넣으므로 캐시 탭이
  없을 때(soccerTabs 비었을 때)만 MatchHeadToHead 렌더 — 중복 방지.
- **배당 소스 분리.** 축구=fetchFixtureOdds(api-football, fetch 10분 캐시)+MatchOddsTable.
  야구=loadBaseballOdds(TheSports tsBaseballOddsHistory)+인라인 스트립(전용 카드가
  BaseballBoxscoreTabs 안에만 있어 소형 스트립 신규 — 머니라인/런라인/토탈 3칩).
- **PREVIEW && match.status=SCHEDULED 만 배당 렌더.** 종료 경기 프리뷰에 낡은 배당은 소음.
  H2H·순위는 상태 무관 유지(리뷰 가치).
- **페이지 ISR 600s** — 배당 신선도 최대 10+10분 지연 허용 범위.
- 측정 = 배포 전후 GA 체류시간·글→매치상세 이탈률 2~4주 비교 (A/B 인프라 없음).
