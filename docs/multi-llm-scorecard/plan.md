# 멀티 LLM 성적표 — 설계 (plan)

> `/predictions/scorecard` 를 "우리 vs GPT" 2자 비교에서 **N개 모델 리더보드**로 확장한다.
> 경쟁사 ScoreGPT(5개 LLM 컨센서스 + 모델별 정확도 공개)에 대응.

## 목표

같은 경기·같은 라인을 여러 AI가 경기 전 독립 예측하고, 결과로 채점해 **모델별 누적 적중률 리더보드**를 공개한다.
- 좌석: `scorebase(정량)` · `GPT` · `Claude` · `Grok` · `Gemini` · `로컬 Qwen`
- 우리 정량모델을 한 좌석으로 참전시켜 "AI들 vs 우리 통계모델" 구도 = ScoreGPT 대비 차별점
- 모든 외부 모델에 **동일 구조화 데이터 팩**(폼·H2H·순위·휴식일·라인)을 먹여 근거 기반 픽 유도

## 핵심 발견 — 백엔드는 이미 N-ready

- `AiPrediction` 테이블은 `@@unique([matchId, model, market])`, `model` 이 자유 문자열. **스키마 변경 0**.
- `runEvaluateAiPredictions` 는 `correct=null` 행을 모델 불문 채점. **채점 로직 변경 0**.
- 기존 GPT 호출이 `OpenAI` 클라이언트 `chat.completions.create` + `json_object` = OpenAI 호환 규격.
  - OpenRouter(Grok·Gemini·Claude)·Ollama(Qwen) 전부 이 규격 → `gptMarkets()` 하나를 일반화하면 다섯 모델 공용.

## 배포 아키텍처 (중요)

cron 은 **Vercel** 에서 실행(`vercel.json`, 매일 04:30 UTC). Vercel 서버리스는 맥미니 Ollama 에 못 닿음(Tailscale inbound 막힘).

| 패널 | 런타임 | 실행 위치 |
|---|---|---|
| scorebase | 결정론(무료) | Vercel 잡 안에서 계산 |
| GPT | OpenAI 직접 | Vercel cron (기존) |
| Claude·Grok·Gemini | OpenRouter | Vercel cron (P3, 게이트 OFF 시작) |
| 로컬 Qwen | Ollama `localhost:11434` | **맥미니 launchd 워커** (P2), 내부 API 경유 |

Qwen 은 `mac-mini-worker/consensus-crawler.js` 패턴 미러링 — 맥미니는 DB 직접 접근 안 하고 `/api/internal/*` (`INTERNAL_API_TOKEN`) 경유.

## 공정성 원칙 (설계 함정)

모델을 나중에 합류시키면 표본이 적어 단순 비교가 불공정.
- **헤드라인 순위 = 활성 모델 전부가 픽·채점한 공통 경기 집합(intersection) 기준**
- 각 모델 개별 누적 적중률은 보조 지표로 표본 수(n) 병기
- 저장은 모델별 독립(하나 실패해도 나머지 유지), 순위 계산만 공통 집합

## 단계

- **P1** (순수 TS): `panelists.ts` 레지스트리 + `llmMarkets()` 일반화 + 'both must pick' 결합 해제(독립 저장). 검증: GPT+scorebase 회귀 없음.
- **P2** (맥미니): 내부 엔드포인트(예정경기+facts+라인 제공 / 픽 저장) + `llm-panelist-qwen.js` 워커. Qwen 게이트 ON(무료). 검증: `model=qwen` 저장·채점.
- **P3** (Vercel): OpenRouter 패널(Claude·Grok·Gemini) 추가, 게이트 OFF 시작. 검증: 켠 모델만 호출.
- **P4** (페이지, 별도 승인): `scorecard/page.tsx` N자 리더보드 재작성. 데이터 쌓인 뒤 착수.
- **P5** (카피): 홈 쇼케이스·메타·JSON-LD·sitemap·nav 문구 손질.

현재 승인 범위: **P1~P3 (Qwen만 켜서 무료 데이터 축적)**. 페이지(P4~)는 데이터 축적 후 재논의.

## 비용

경기당 유료 호출 = 활성 유료 모델 수. scorebase·Qwen 무료. 유료는 Claude·Grok·Gemini(OpenRouter) → **모델별 env 게이트로 하나씩 ON**. 캡 `GPT_PREDICT_CAP`(기본 40) 재사용.
