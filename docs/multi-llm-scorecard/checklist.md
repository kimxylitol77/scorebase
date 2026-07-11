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
- [ ] 내부 엔드포인트 `/api/internal/llm-panel` — GET: 예정경기+facts+라인 / POST: 픽 upsert
- [ ] `mac-mini-worker/llm-panelist-qwen.js` — consensus-crawler 패턴, Ollama qwen2.5:32b 호출
- [ ] `.env.example` 에 필요한 키 확인(OLLAMA_HOST·OLLAMA_MODEL 기존)
- [ ] Qwen 게이트 ON, `model` 문자열 확정(예: `qwen2.5-32b`)
- [ ] launchd plist + 스케줄 (기존 워커 관례 따름)
- [ ] 검증: `model=qwen2.5-32b` 행 저장 → 종료 경기 채점 확인

## P3 — OpenRouter 클라우드 패널
- [ ] OpenRouter 런타임 패널 3개 등록(Claude·Grok·Gemini), modelId 매핑
- [ ] `OPENROUTER_API_KEY` env, 각 패널 enabledEnv 기본 OFF
- [ ] 검증: 게이트 OFF 시 호출·저장 0, ON 시 해당 모델만
- [ ] 배포 후 Qwen 외 전부 OFF 확인 (비용 0)

## 배포
- [ ] scorebase-deploy 스킬로 마무리 (tsc + commit + push)
- [ ] 맥미니 워커 반영 (scorebase-macmini 스킬)
