# 라이브 한국어 텍스트 티커 — 체크리스트

> 계획: 라이브 상세 페이지에 FotMob Live Ticker 대응 한국어 반응 스트림.
> 핵심 단순화: 축구는 /api/live/match 가 이미 한글화 soccerEvents 를 폴링 반환,
> 야구는 linescore 배열이 전체 히스토리 → 티커 = 클라이언트 순수 변환 (신규 API·크론·상태 0).
> LLM 0 — 상황 꼬리말(선취/동점/역전/추격/달아남)도 스코어 연산으로 결정론 생성.

## 구현
- [x] `src/lib/live/ticker.ts` — soccerTickerLines·baseballTickerLines 순수 빌더
- [x] `live-scores.ts` tsIncidentsToEvents — 골 incident 의 home_score/away_score 를 SoccerEvent 에 추가 (누적 스코어 원본값)
- [x] `src/components/live/LiveTickerFeed.tsx` — 최신순 스트림 렌더 (표시 전용)
- [x] `SportLiveDetail.tsx` — 이벤트 탭 묶음에 "중계" 탭 추가 (첫 탭)
- [x] `BaseballLiveDetail.tsx` — 스코어보드 아래 티커 피드 (KBO·NPB·CPBL 등 공용)

## 검증
- [x] `npx tsc --noEmit` 통과
- [x] 빌더 단위 검증 — 가상 이벤트/이닝 입력 → 문장·상황 꼬리말·키 유일성
- [x] 실데이터 검증 — 종료/LIVE 매치의 detailLive.incidents 로 축구 라인 생성 확인

## 후속 (계획만)
- [ ] Claude 플레이버 코멘트 — LiveCommentary.eventComments + narrator 확장 (env 게이트, 비용 결정 필요)
- [ ] /scores 리스트 카드에 최신 티커 1줄 노출
