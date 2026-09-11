# 체크리스트 — match-shorts

## 0. 측정 (진행 중)
- [ ] FT→xg_available 지연 실측 (09-11 밤 우니온 v 샬케, scratchpad/ft-xg-latency.log)

## 1. 데이터 (scorebase 저장소)
- [x] scripts/shorts/build-match-short.ts — matchId → TheStatsAPI 샷맵 → 인사이트(haiku) → data/match-short-{id}.json + 로고 다운로드
- [x] 숫자 팩트 게이트 (weekly-xi checkWeeklyXiFacts 방식)
- [x] 후보 선정 로직 — 리그당 1편/일(먼저 끝난 경기 우선). xG 격차 가중은 v2

## 2. 렌더 (scorebase-shorts)
- [x] src/MatchShotShort.tsx — 훅(스코어·xG) → 샷맵 분 순서 애니메이션(골 플래시) → 인사이트 카드 → CTA
- [x] Root 등록 + 스틸·전체 렌더 검증

## 3. 맥미니 배포
- [x] brew ffmpeg, scorebase-shorts rsync(178MB), npm ci, Remotion 크로미움 1회 다운로드
- [x] mac-mini-worker/match-shorts.js + launchd plist + bot-registry 등록
- [x] .env 에 THESTATSAPI_KEY·ANTHROPIC·TELEGRAM·YOUTUBE 토큰 (사용자 직접)

## 4. 발행
- [x] youtube-upload.mts 호출 + 텔레그램 + state 파일
- [x] 맥미니 E2E(--once, 엘체 v 소시에다드): 빌드+렌더 37초. launchd 가동 09-11 21:32 KST
- [ ] 실전 1회: 09-12 새벽 우니온 v 샬케(FT ≈ 05:25 KST) — 텔레그램 링크·FT+N분 확인

## 5. 마무리
- [x] 메모리·MEMORY.md 갱신
- [ ] 임시 프로브 스크립트 삭제 (scorebase/scripts/tmp-ft-xg-latency-probe.mts, 프로브 종료 후)
