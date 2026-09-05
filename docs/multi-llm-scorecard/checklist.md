# 멀티 LLM 성적표 — 체크리스트

## P1 — 백엔드 일반화 (순수 TS) ✅ 완료
- [x] `src/lib/predict/panelists.ts` 신설 — 패널 레지스트리(key/label/accent/runtime/baseURL/apiKeyEnv/modelId/enabledEnv/location)
- [x] `gptMarkets()` → `llmMarkets(client, modelId, ...)` 일반화 (OpenAI 호환)
- [x] `storeMarkets` 결합 해제 — `storeAnchor`(scorebase 1회) + `storePanel`(각 패널 독립)
- [x] `runFetchGptPredictions` 패널 루프 (activePanelists("vercel"), 패널별 doneByPanel 재호출 방지)
- [x] 기존 GPT 는 `gpt` 패널로 등록해 하위호환 유지 (게이트 없음=항상 활성)
- [x] 검증: 게이팅 로직 tsx 검증 — 키만 있으면 gpt만(회귀X), 게이트+키 있어야 유료패널 활성, Qwen은 macmini only
- [x] `tsc --noEmit` 통과 (EXIT 0)
- 주의: scorebase 앵커가 이제 패널 실패와 무관하게 저장됨 → 고아 scorebase 행 생길 수 있으나 현 2자 페이지는 `sb&&gpt` 필터라 무시(안전), P4 intersection 의도된 동작

## P2 — 로컬 Qwen (맥미니)
- [x] `llmMarkets` 를 buildMarketsPrompt+parseMarketsResponse+얇은 llmMarkets 로 분리(프롬프트 단일소스)
- [x] `storePanel` 라인 배열로 디커플링, scorebasePick/scorebaseHcOu/storeAnchor export
- [x] `src/lib/predict/qwen-panel.ts` — getQwenTasks(앵커 자체계산=gpt 독립)+saveQwenPicks(DB기준 라인 재확인)
- [x] 내부 엔드포인트 `/api/internal/llm-panel` — GET: 프롬프트+라인 / POST: raw 파싱·저장 (isCronAuthorized)
- [x] `mac-mini-worker/llm-panelist-qwen.js` — 서버 프롬프트 받아 Ollama 전달만(파싱은 서버)
- [x] launchd plist `com.scorebase.qwen-panel.plist` (09:00·21:00 KST 2회)
- [x] `model` 키 확정 `qwen2.5-32b` (panelists.ts ↔ qwen-panel.ts 일치)
- [x] tsc 통과 + 워커 node --check OK
- [x] **배포1(Vercel)**: 엔드포인트 라이브 (c292e47+2c77c25). 게이트 실증(배포전 40태스크→배포후 0=OFF)
- [x] **배포2(맥미니)**: 워커+plist 설치·bootstrap(com.scorebase.qwen-panel, 09:00·21:00). env·axios·qwen2.5:32b·40태스크 GET 확인
- [x] Vercel env `PANEL_QWEN=1` 설정·재배포 (사용자, 2026-07-11)
- [x] 최종 검증 완료 — cap=2 실행: 대상 2경기→Ollama 2/2→저장 saved 2/failed 0. 전 구간 실증
- 채점은 evaluate cron 이 종료 경기에서 자동(model 불문) — 별도 작업 불요

## P2 완료 (2026-07-11). Qwen 무료 데이터 축적 시작 — 09:00·21:00 KST 자동.

## P3 — 클라우드 패널
- [x] **Grok = xAI 직접** (OpenRouter 아님) — 무료크레딧 유리. runtime "xai", modelId grok-4-1-fast-non-reasoning
- [x] llmMarkets 토큰 파라미터 런타임 분기(openai=max_completion_tokens, xai=max_tokens)
- [x] 진단 엔드포인트 `/api/internal/panel-status`(gateOn·keyPresent·active)
- [x] Grok LIVE 검증(2026-07-11) — cron targeted40/stored40/storedMarkets116/failed0, 한국어 근거 정상
- [x] 함정 기록: env 추가 후 **재배포 필수**(Ready Stale=env 미반영). PANEL_GROK gateOn=false 원인이 이것
- [x] Claude·Gemini = OpenRouter LIVE(2026-07-11). modelId claude-haiku-4.5 / gemini-2.5-flash(카탈로그 검증)
- [x] Claude 함정: Anthropic 은 OpenRouter 에서 response_format:json_object 미지원 → 전건 실패(0저장).
      해결=Panelist.jsonMode:false + 파서가 ```json 펜스·프로즈 감싼 JSON 첫 {…} 추출. ?test=claude 로 실증
- [x] 진단 확장: /api/internal/panel-status?test=<model> — 단건 호출로 실제 에러·원문·파싱 확인
- 현재 LIVE 6모델: scorebase·gpt·grok·gemini·qwen·claude

## P4 — 페이지 N자 리더보드 ✅ 완료 (2026-07-11)
- [x] scorecard/page.tsx 재작성 — 2자 하드코딩 → 데이터 존재 모델 자동 리더보드(순위+막대+채점대기 칩)
- [x] "AI 원탁": 예정 경기 전 모델 1X2 나란히 + 컨센서스(만장일치/의견갈림 배지)
- [x] 시장별 성적(모델 자동)·경기별 피드(모델별 적중/실패 배지)
- [x] gpt-5.5/5.6 → "GPT-5.6 Sol" 통합 표기(9c2d719). accent=panelists.ts 일치, Tailwind 정적 클래스
- [x] 프로덕션 렌더 확인(리더보드 GPT 59.6% 1위·스코어베이스 57.6% 2위·대기 칩 3모델)
- 남은 것(P5): 홈 쇼케이스·sitemap·nav 카피는 기존 2자 문구 유지 중 — 별도 손질

## 배포
- [ ] scorebase-deploy 스킬로 마무리 (tsc + commit + push)
- [ ] 맥미니 워커 반영 (scorebase-macmini 스킬)

## P6 — 배구·LoL 편입 (2026-07-11 완료)
- [x] MAJOR_LEAGUES 20리그 확장 — 배구 4(VNL/VNL_W/EGL_W/AVC_NATIONS_W)+LoL 3(LOL/LPL/LEC)
- [x] 배구 앵커 = Match.predHome(배구 Elo+시장, 백테스트 83.3%) 재사용 (VB_ANCHOR_LEAGUES 분기)
- [x] LoL 백테스트: LCK 70.0%·LPL 65.1%·LEC 58.3% (일반 Elo 그대로). LCS·LCK_CL 제외
- [x] 배구·LoL 은 1X2만 (SPORT_PROFILE 없음 = 의도)
- [x] 검증: 배구 픽 5모델 라이브(11~12경기). Qwen 은 21:00 자동 합류, LoL 은 72h 창 진입 시 자동

## P7 — 성적표 페이지 개선 (2026-09-05)
- [x] 데이터 오염: 종료 아닌 경기(POSTPONED·SCHEDULED)에 채점값이 남은 43행 → correct=null 리셋(1회) + evaluate 잡 자가치유(매 실행 리셋)
- [x] 페이지 방어: 경기 상태가 FINISHED 가 아니거나 점수 null 이면 채점값 무시(피드 "-:-" 노출 차단)
- [x] 쿼리 경량화: 렌더에 안 쓰는 `reason` 컬럼 select 제거
- [x] 첫 화면 KPI 스트립: 선두 모델·채점 건수·어제 합산·최근 7일 합산 (진화 선언 섹션은 상단 유지 — 3b59101 결정 존중)
- [x] 리더보드 카드: 11px 두 줄 → 최근100·어제·7일·14일·30일 스탯 그리드 + 7일 추세 배지 + 상위 격차 "사실상 동률" 캡션(동적)
- [x] 원탁 카드: 다수 픽·동의 수·평균 확신 요약 줄 추가
- [x] tsc 통과 + dev 실렌더 확인(데스크톱·375px 넘침 없음) + 커밋 — 1회 리셋은 배포 후 22:00 evaluate cron 자가치유에 맡김(51행, 미발행 8행 포함)
