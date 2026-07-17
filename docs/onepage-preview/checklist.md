# 원페이지 프리뷰 (A안 최소) — 체크리스트

목표. 프리뷰 글 페이지에서 분석 완결 — AI 확률·Elo(기존 MatchInsight)에 더해
H2H·순위 비교와 배당까지 한 페이지에서. SportMeridian 벤치마크.

- [x] 1. H2H·순위 위젯 — fetchMatchExtras + MatchHeadToHead (라이브 페이지 재사용).
      축구는 theSportsCache 탭에 이미 H2H 가 있어 캐시 탭 없을 때만 렌더(중복 방지)
- [x] 2. 배당(축구) — fetchFixtureOdds(10분 캐시) + MatchOddsTable. SCHEDULED + af numeric id 만
- [x] 3. 배당(야구) — loadBaseballOdds + 인라인 스트립(머니라인·런라인·토탈). SCHEDULED 만
- [x] 4. PREVIEW 타입 한정 — RECAP/ANALYSIS 글은 기존 그대로
- [x] 5. tsc + 로컬 검증 — MLB 프리뷰에서 상대전적·리그순위·시즌성적·승률·평균득실 위젯 렌더 확인.
      배당은 현재 전 경기 수집 전(TheSports ~3h 전 수집)이라 graceful 생략 경로 확인
- [ ] 6. 커밋 + push + 프로덕션 검증

## 검증 함정 기록
- "머니라인"·"리그 순위" grep 은 GNB 메뉴 텍스트와 충돌 — 위젯 존재 판정은 innerText
  블록("상대전적 | VS | 시즌성적")으로. 앞선 가짜 양성/음성 둘 다 이것 때문.

## 후속 (계획만)
- [ ] 시즌 평균 xG·슈팅·점유율 집계 (완성형 — 신규 쿼리 필요)
- [ ] 2~4주 후 GA 체류시간·글→매치상세 이탈률 전후 비교
