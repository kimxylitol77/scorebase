# /admin/stats 유입 채널 수치 교정 — 체크리스트

목표. "지난주 대비" 와 "어디서 들어왔나" 두 카드가 잘림 없이, 같은 봇·위장 스크레이퍼 규칙으로 센다.

- [x] traffic-filter `dailyCleanStats` 가 채널별 사람 랜딩(count·unique)도 반환
- [x] daily-traffic 저장·조회에 channels 포함
- [x] 스키마 `DailyTraffic.channels Json?` + 운영 DB ADD COLUMN (lock_timeout 3s, 장기 트랜잭션 확인 후)
- [x] 백필 `scripts/backfill-daily-traffic.ts` 전 기간 재실행 → 채널 채움, 방문자·PV 값 불변 확인
- [x] page.tsx 채널 막대·지난주 대비를 일별 저장값 합산으로 교체, 쓰이지 않게 된 쿼리·변수 제거
- [x] 검증: 새 합산값 vs 9/24 전량 계산 정답(5,304 / 3,707) 대조, tsc
- [x] 배포 후 사용자 Chrome 으로 화면 확인
