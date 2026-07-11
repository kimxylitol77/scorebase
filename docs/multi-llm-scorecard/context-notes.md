# 멀티 LLM 성적표 — 컨텍스트 노트 (결정 + 근거)

작업 중 내린 결정을 계속 덧붙인다. 다음 세션이 재도출 없이 이어가기 위함.

## 발단 (2026-07-11)
경쟁사 ScoreGPT(scoregpt.app)가 5개 LLM 독립 실행 → 컨센서스 픽 + 경기 후 모델별 정확도 리더보드. 우리엔 없음. `/predictions/scorecard` 를 확장하기로.

## 결정 로그

- **기존 페이지 확장 O, 신규 페이지 X** — scorecard 가 이미 "모델 vs 모델" 성적표. 좌석만 늘림.
- **로스터** — Claude·Grok·Gemini·로컬 Qwen 추가. 기존 scorebase·GPT 유지. 총 6좌석. (사용자 확정)
- **외부 접근 = OpenRouter 단일 키** — 키 1개로 Grok·Gemini·Claude. 관리·과금 단일화. (사용자 확정)
- **Grok 은 xAI 직접으로 변경** (2026-07-11) — console.x.ai 무료 크레딧($25 프로모 + 데이터공유 시 월 $175)이 더 유리해 grok 패널만 xai 런타임(baseURL api.x.ai/v1, XAI_API_KEY, modelId grok-4-1-fast-non-reasoning). Claude·Gemini 는 여전히 OpenRouter 예정. 함정: xAI 는 max_tokens, 신형 OpenAI 는 max_completion_tokens → llmMarkets 런타임별 분기.
- **헤드라인 = 모델별 리더보드** — "합의 vs 우리 정량"은 보조. (사용자 확정)
- **착수 순서 = 백엔드 P1~3 먼저, Qwen만 켜서 무료 데이터 축적** → 페이지(P4)는 나중. (사용자 확정)

## 아키텍처 근거

- `AiPrediction.model` 이 자유 문자열 + 채점이 모델 불문 → **DB·채점 변경 0**. 새 모델 = model 문자열 추가일 뿐.
- 기존 GPT 호출이 OpenAI 호환 → OpenRouter·Ollama 동일 인터페이스 → `gptMarkets` 하나 일반화로 전 모델 공용.
- **cron 은 Vercel 실행** → Ollama 못 닿음 → Qwen 은 맥미니 워커로 분리. `consensus-crawler.js` 가 검증된 미러 패턴(로컬 Ollama qwen2.5:32b + 내부 API `INTERNAL_API_TOKEN`).
- 맥미니 워커는 DB 직접 접근 안 함(hermes 봇만 예외) → 내부 API 경유가 표준.

## 함정 / 주의

- **공정성**: 나중 합류 모델은 표본 적음 → 리더보드 헤드라인은 "활성 모델 전부 픽·채점한 공통 경기" 기준. 개별 누적률은 n 병기 보조.
- **결합 해제 필수**: 기존 `storeMarkets` 는 scorebase+GPT 둘 다 픽해야 저장. N개로 늘리면 한 모델 실패가 전체를 막음 → 모델별 독립 저장으로 전환.
- **Qwen 한국어 약함**([feedback_qwen_korean_limits]) — 픽(숫자)은 언어무관이라 OK, `reason` 텍스트만 짧게/생략. consensus-crawler 에 가나 제거 헬퍼 있음(참고).
- **비용 게이트**([feedback_deploy_gate_cost]) — 유료 패널 enabledEnv 기본 OFF. Qwen(무료) 먼저, 유료는 하나씩 ON.
- **Qwen 모델 실제값** = `qwen2.5:32b` (메모리엔 14b 로 적혀있으나 실 워커는 32b).

## 기준점(라인) 설계 — 사용자 질문으로 재확인 (2026-07-11)

- 라인은 **종목/리그별로 다르게** SPORT_PROFILE 에 고정: 축구 OU2.5/핸디0.5, NBA 220.5/5.5, NHL 5.5/1.5, MLB·NPB 8.5/1.5, KBO 9.5/1.5.
- 같은 경기에서는 6모델 전부 **같은 라인으로 채점** = 공정 비교 유지(설계 의도).
- 한계: 리그 단위 고정(flat)이라 경기별 시장 라인과 다름 → 화력 좋은 매치업은 전 모델 같은 픽(변별력 저하).
- 시장 라인 전환은 보류. 근거: (1) 72h 선행 예측 시점에 시장 OU 라인 부재 다수(야구 ts 배당 ~3h 전), (2) 누적 900 데이터포인트 연속성, (3) 스키마는 이미 행별 line 저장·채점이라 나중에 소스만 교체 가능.
- 백로그: "시장 라인 있으면 시장 라인, 없으면 플랫" 하이브리드.

## 만장일치 히어로 (2026-07-11)

- 5개+ 모델 전원 같은 1X2 픽 경기의 채점 성적을 페이지 최상단 히어로로 — 채점 0이면 미렌더(첫 채점부터 자동 등장).
- 과거 2모델 합의 기준 57.0%(135/237), 갈림 36.5% — 만장일치=강신호 가설의 근거.

## 블라스트 반경 (P4~5 에서 손댈 곳)
`scorecard/page.tsx`(2자 하드코딩), `HomeAiScorecardShowcase`, `/predictions/accuracy`, `AiMatchupCard`, `gpt-scorecard-model.ts`, 메타/JSON-LD, sitemap, nav 문구.

## 관련 파일
- 파이프라인: `src/jobs/fetch-gpt-predictions.ts`
- 페이지: `src/app/predictions/scorecard/page.tsx`
- 모델 라벨: `src/lib/predict/gpt-scorecard-model.ts`
- cron: `src/app/api/cron/gpt-predictions/route.ts` + `vercel.json`
- Qwen 미러 패턴: `mac-mini-worker/consensus-crawler.js`, `src/app/api/internal/consensus-pick`
