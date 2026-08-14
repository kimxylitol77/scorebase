# 베트맨 배당 수집 — 체크리스트

목표. 매일 자동으로 프로토 승부식 배당·투표분포가 DB 에 들어오고, 들어왔는지 확인 가능할 것.
노출(UI)은 이번 범위 밖.

## 1. DB
- [ ] `BetmanOdds` 모델 추가 (자연키 `{gmTs}-{matchSeq}`)
- [ ] `npx prisma db push --skip-generate && npx prisma generate`
- [ ] 검증: 테이블 생성 확인

## 2. 적재 API
- [ ] `POST /api/internal/betman-odds` — Bearer INTERNAL_API_TOKEN
- [ ] 컬럼형(keys/datas) 해석 + voteStatus 결합 + drawAllot 0→null 정규화
- [ ] 검증: 로컬에서 실제 페이로드로 호출 → upserted 수 확인

## 3. 워커
- [ ] `lightsail-worker/betman-odds-cron.js` — 회차 목록 조회 → 발매중 + 직전 1회차 수집 → POST
- [ ] heartbeat `lightsail-betman-odds`
- [ ] systemd service + timer (1일 2회: KST 09:00·21:00)
- [ ] 검증: `node --check`

## 4. 배포·등록
- [ ] Vultr 배포 (`/home/ubuntu/scorebase-worker/src/`, chown ubuntu)
- [ ] timer enable + start
- [ ] `src/lib/bot-registry.ts` 등록 (heartbeat 감시)
- [ ] `src/lib/cron-registry.ts` 등록 여부 확인 (해당되면)

## 5. 검증 (이번 단계의 본론)
- [ ] 수동 1회 실행 → DB row 수·리그 분포 확인
- [ ] 배당·투표분포가 실제 값인지 눈으로 대조 (베트맨 화면 vs DB)
- [ ] 다음 정기 실행 후 재확인 — **매일 들어오는지**가 목표
- [ ] heartbeat 정상 기록 확인

## 6. 마무리
- [ ] tsc + eslint
- [ ] 커밋 + main push
- [ ] context-notes 갱신 (실측 결과)
