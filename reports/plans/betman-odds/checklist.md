# 베트맨 배당 수집 — 체크리스트

목표. 매일 자동으로 프로토 승부식 배당·투표분포가 DB 에 들어오고, 들어왔는지 확인 가능할 것.
(노출은 후속으로 진행 — 7번 참조.)

## 1. DB
- [x] `BetmanOdds` 모델 추가 (자연키 `{gmTs}-{matchSeq}`)
- [x] `npx prisma db push --skip-generate && npx prisma generate` — 14.1s 완료
- [x] 검증: 테이블 생성 확인 (850행 적재 성공으로 확인)

## 2. 적재 API
- [x] `POST /api/internal/betman-odds` — Bearer INTERNAL_API_TOKEN
- [x] 컬럼형(keys/datas) 해석 + voteStatus 결합 + drawAllot 0→null 정규화
- [x] 검증: 로컬 실제 페이로드 850행 → `upserted 850 / skipped 0` (11.9s)
- [x] 성능: row 단위 upsert 는 180s 초과 → 다중 VALUES + ON CONFLICT 로 교체

## 3. 워커
- [x] `lightsail-worker/betman-odds-cron.js`
- [x] heartbeat `vultr-betman-odds`
- [x] systemd service + timer (UTC 00:00·12:00 = KST 09:00·21:00)
- [x] `node --check` 통과

## 4. 배포·등록
- [x] main push (883835b) → Vercel API 배포 확인 (200)
- [x] Vultr 배포 (`/home/ubuntu/scorebase-worker/src/`, chown ubuntu)
- [x] timer enable + start — 다음 실행 2026-08-14 12:00 UTC
- [x] `src/lib/bot-registry.ts` 등록 (`vultr-betman-odds`, 12h)
- [x] cron-registry — 해당 없음 (Vercel cron 이 아니라 systemd timer)

## 5. 검증
- [x] 수동 1회 실행 → **회차 2 / 1,303행 / upserted 1,303 / skipped 0 / exit 0**
      (260096 발매중 850행 + 260095 직전회차 453행)
- [x] 배당·투표분포 실값 대조 — 로컬 적재분에서 확인
      (MLB LA다저스 2.14/3.35/2.6 · 투표 51/31/18% 등, 승무패+투표 결합 210건)
- [ ] **다음 정기 실행(2026-08-14 12:00 UTC = 21:00 KST) 후 재확인** ← 남은 것
      - 회차 행수 증가/갱신 여부
      - heartbeat `vultr-betman-odds` lastAt 갱신
      - ECONNRESET 재시도가 매번 나는지 (1회차 실행에서 1건 발생)
- [ ] 하루 뒤 재확인 — 매일 들어오는지

## 6. 마무리
- [x] tsc + eslint
- [x] 커밋 + main push (883835b)
- [x] context-notes 갱신

## 알려진 이슈

- **베트맨 연결이 간헐적으로 끊긴다.** 첫 수동 실행에서 `read ECONNRESET` 1회 → 30s 후
  재시도로 성공(자가치유 정상 동작). 다만 재시도는 main() 전체를 다시 도므로 회차를
  통째로 다시 받는다. 매 실행마다 난다면 요청 단위 재시도로 바꿀 것.
- **로컬 → Neon 직접 접속이 막힐 수 있다.** 이번 작업 중 tsx 스크립트를 연달아 돌린 뒤
  로컬에서만 "Can't reach database server" 가 지속됐다(TCP 5432 는 열림, 운영은 정상).
  메모리 `no-burst-from-worker-ip` 와 같은 계열. 로컬 검증 스크립트를 연타하지 말 것.

## 7. 노출 — /odds 패널 (2026-08-14 추가)

- [x] `lib/odds/betman.ts` + `components/odds/BetmanOddsPanel.tsx` → /odds 세 탭 하단
- [x] 경기 단위 dedup(최신 회차 유지) + 배당 미정 행 제외
- [x] 데스크탑 7열 / 모바일 2열, 가로 오버플로 0, 모바일 배당 라벨
- [x] main push (8ba165e)
- [ ] 운영 반영 확인

**"여론 쏠림" 배지는 넣었다가 뺐다.** 투표가 배당 내재확률보다 10%p 이상 높은 쪽에 배지를
달았더니 82경기 중 70건(85%)에 붙었고 그중 53건이 무승부였다. 프로토 구매자가 무를
구조적으로 많이 고르기 때문이다. 결과별 평균 편차로 기준선을 보정해도 임계 15%p 에서
51%가 남았다 — 신호가 아니라 배경이다. 투표 %와 배당 내재확률 %를 나란히 두는 것으로 대체.

**함정 추가.** `unstable_cache` 는 반환값을 JSON 직렬화한다 → Date 가 문자열이 되어
렌더에서 "Invalid time value" 로 터진다. 또한 캐시가 살아 있으면 조회 함수를 고쳐도
화면이 안 바뀐다(이번에 dedup·필터 수정이 반영 안 된 것으로 오인해 한참 헤맸다).
dev 검증 시 `.next/dev/cache` 삭제 + 서버 재시작이 필요하다.
