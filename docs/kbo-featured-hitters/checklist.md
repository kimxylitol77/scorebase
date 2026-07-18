# KBO 오늘의 주목 타자 Top 3 — 체크리스트

> 계획: 매일 KST 12:15, 오늘 KBO 경기별 주목 타자 Top 3 를 선정해 ANALYSIS 글 1편 자동 발행.
> 선정 = 시즌 OPS × 상대 선발 보정(FIP 우선, ERA fallback). 파크팩터는 근거 문구 맥락용.
> LLM 0 (결정론) — MLB 주간 베스트에서 확인된 "LLM 숫자 대조 불안정" 회피, 비용 0.

## 구현
- [x] `src/lib/sports/baseball/kbo-featured-hitters.ts` — 오늘 매치 + 타자 풀 + 스코어링 + 근거 문구 빌더
- [x] `src/jobs/generate-kbo-featured-hitters.ts` — 일간 멱등 slug + 마크다운 조립 + Article 발행 + CLI(--dry)
- [x] `src/app/api/cron/kbo-featured-hitters/route.ts` — baseball-weekly 게이트 패턴 (cron-auth + GENERATE_DISABLED)
- [x] `vercel.json` crons 에 `15 3 * * *` (KST 12:15 — baseball-starters 02:30·03:00 UTC 이후)
- [x] `package.json` 에 `job:kbo-featured-hitters`

## 검증
- [x] `npx tsc --noEmit` 통과
- [x] `--dry` 로 오늘 데이터 실측 — 경기별 3명 + 근거 문구 눈검사 (수치=DB 일치)
- [ ] 발행 시 slug 재실행 스킵 확인

## 후속 (계획만)
- [ ] Threads 큐(kind 추가) + OG 카드 라우트 — X·카카오 배포 최적화는 별도 결정 필요
- [ ] 타순(라인업) 소스 확보 시 "선발 라인업 확정자" 필터 추가
