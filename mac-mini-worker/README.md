# Mac mini Worker — Ollama 라이브 코멘터리

Mac mini 에서 24/7 돌면서 scorebase 라이브 매치의 **AI 코멘터리** 를 생성하는 Node.js 워커.

## 구성

| 워커 | 주기 | 역할 |
|---|---|---|
| `match-narrator.js` | 5분 | 매치 진행 상황 3-4문장 박스 (라이브 페이지 다이아몬드 옆) |
| `event-commentator.js` (TODO) | 1분 | 이벤트별 1줄 자연어 (홈런/카드/교체 등) |

## 셋업 (Mac mini 에서)

```bash
# 1. 코드 가져오기 — scorebase repo 가 이미 clone 되어 있다는 가정
cd ~/scorebase
git pull origin main
cd mac-mini-worker

# 2. 의존성
npm install

# 3. 환경변수
cp .env.example .env
vi .env
#   INTERNAL_API_TOKEN= ← Vercel env 와 동일 값 필수

# 4. Ollama 동작 확인
curl http://localhost:11434/api/tags | head
# qwen2.5:14b 가 모델 리스트에 있는지 확인

# 5. 실행 (수동 테스트)
npm run narrator
# 또는 백그라운드:
nohup node match-narrator.js > narrator.log 2>&1 &
```

## 동작 검증

워커 시작 후:
1. **로그**: 5분마다 cycle 진행 — `live 매치: N건` + 각 매치 처리 결과
2. **DB 확인**: scorebase `/admin` (혹은 prisma studio) 에서 `LiveCommentary` 테이블에 row 생성됐는지
3. **사이트 확인**: `/live/kbo/[gameId]` 라이브 매치 페이지에서 다이아몬드 옆 AI 박스 표시
4. **알림**: 워커가 정상이면 `bot-heartbeat-check` cron 으로부터 텔레그램 알림 없음

## Fault tolerance

- Mac mini 다운 시 → 사이트 코멘터리 **10분 후 자동 숨김** (LiveCommentaryBox 가 stale 처리)
- 30분 무응답 시 → 텔레그램 알림 (`/api/cron/bot-heartbeat-check`)
- Worker 재시작 시 → `notifiedAt` reset, 다음 다운 시 다시 알림 받음

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `INTERNAL_API_TOKEN` | 필수 | scorebase Vercel env 와 동일 값. Bearer 인증 |
| `SITE_URL` | `https://www.scorebase.kr` | scorebase 호스트 |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama 서버 |
| `OLLAMA_MODEL` | `qwen2.5:14b` | 모델 이름 |
| `LEAGUES` | `KBO` | 대상 리그 (콤마 구분, ex: `KBO,NPB`) |

## 다음 단계

- **PR 6**: `launchd` 등록 → 부팅 시 자동 시작 + 크래시 시 자동 재시작
- **PR 4**: `event-commentator.js` 추가 (이벤트별 1줄)
- **확장**: NPB / MLB / 축구 / NBA / NHL / LoL 점진 적용
