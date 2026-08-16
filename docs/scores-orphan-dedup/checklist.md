# /scores 카드 중복 — 이름 사각지대 3종 처리 (2026-08-16)

발단. 사용자가 중국 리그투 카드에서 같은 경기가 두 번 보인다고 지적. 실제 6경기인데 8장 렌더.

- [x] 진단 — /scores 는 DB(ts) + af 날짜조회 orphan 두 소스 합성. 이름이 양쪽 다 어긋나면 카드 2장
- [x] CHINA_3 원인 확정 — af 가 구 팀명 유지(연고이전·개명), af 팀 매핑 0건이라 ID 축도 불발
- [x] RPL 원인 확정 — 슬라브 로마자 i↔y 갈림 (Krylia/Krylya, Dinamo/Dynamo)
- [x] 전수 스캔 — 오늘 확정 중복 3건(중국 2·러시아 1), 나머지 살아남은 orphan 43건은 정상
- [x] ① CHINA_3 24팀 af team id 를 TeamSourceId 에 backfill (`scripts/backfill-china3-af-teamids.ts --apply`)
  - [x] dry-run 24건 확인 → apply 24건 · 충돌 0
  - [x] 검증: 감사 [중복제거] 266 → 268, CHINA_3 6건 전부 `[teamId]` 근거로 전환
- [x] ② `romanizeTeamName` 에 y→i 흡수
  - [x] 오매칭 사전 측정: 전체 5002팀 리그 내 새 키 충돌 **0건**
  - [x] 단위 검증 8/8 (RPL 실측 쌍 일치 · Lyon/Lorient·Bayern/Bayer·Young Boys/Yeovil 불일치 유지)
  - [x] af 회복 후 전체 감사에서 RPL 1건 `[roman]` 근거로 제거 확인
- [x] ③ 감사 스크립트에 `[사각지대]` 경보 추가 — af 경기수 ≤ DB 경기수인데 orphan 이 남는 리그
  - [x] 수정 전 CHINA_3·RPL 검출 → 수정 후 8/16 0개 리그
  - [x] `pairedDbMatch` 에 팀 ID 축 추가 — teamId 로 판정된 건이 "짝 특정 실패"로 뜨던 것 해소
- [x] 최종 감사 8/16 — [중복제거] 266 → **269**(+3 = 중국 2 + 러시아 1), [잔여의심] 0, [사각지대] 0
- [x] tsc 통과 (exit 0)
- [ ] 커밋 · main push
- [ ] 배포 후 프로덕션 /scores 중국 리그투 6장 확인

## 후속 (경보가 새로 찾아낸 중복 — 이번 범위 밖)

8/15·8/17 감사에서 `[사각지대]` 가 3건 추가 검출. 전부 실제 중복으로 확인됐고, 새 이름 유형이라
규칙 보강이 따로 필요하다.

| 리그 | af 표기 | DB 표기 | 어긋난 이유 |
|---|---|---|---|
| ARG_PRIMERA_NACIONAL | Racing Cordoba vs San Martin S.J. | Racing de Cordoba vs San Martin San Juan | 전치사 `de` 삽입 · 약어 `S.J.`↔`San Juan` |
| MEXICO_2 | Leones Negros UDG vs CDS Tampico Madero | Leones Negros de la U. de G. vs Club Jaiba Brava | 약어 `UDG`↔`U. de G.` · **별명**(Tampico Madero = Jaiba Brava) |
| WK_LEAGUE | Changnyeong W vs Incheon Red Angels W | Gangjin Swans Women vs Incheon Hyundai Steel Red Angels Women | 홈팀 표기 상이(확인 필요) · 원정은 부분명 |

별명(Jaiba Brava)은 이름 규칙으로 못 잡는다 — CHINA_3 처럼 af 팀 ID 매핑이 맞는 해법.
