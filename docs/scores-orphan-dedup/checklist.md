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
- [x] 커밋 · main push (a3a5505)
- [x] 배포 후 프로덕션 확인 — 중국 리그투 **8장 → 6장**, 러시아 중복 소멸, 영문 잔존 카드 0
  - 중국은 DB(TeamSourceId) 변경이라 배포 전에 이미 반영됐고, 러시아는 코드라 배포 후 반영

## 2차 (사용자 "전부 다") — 사각지대 전수 처리

- [x] 8/12~8/23 감사로 사각지대 전수 수집 → 5개 리그
  - 과거 날짜(오늘-3 이전)는 af 조회 창 밖이라 af 건수가 급감 — 감사 의미 없음
- [x] `scripts/backfill-af-teamids-by-league.ts` 신설 — CHINA_3 처방을 리그 단위로 일반화
  - 자동 등록은 exact → substr → city 3단계, **양방향 1:1 일 때만**. 나머지는 [보류] 출력만
  - 약어·별명·연고이전은 `MANUAL` 에 근거와 함께 명시(자동 규칙이 먼저 소비하지 않도록 우선 처리)
- [x] 4개 리그 76건 등록 — ARG_PRIMERA_NACIONAL 36 · MEXICO_2 16 · UZBEKISTAN_SL 16 · WK_LEAGUE 8
  - WK리그 연고이전 3건은 8/21 경기 대조로 확정(보은→문경 상무, 구미→세종 스포츠토토, 창녕→강진 스완스)
  - [x] 검증: 8/17·8/20·8/21 사각지대 0개 리그
- [x] COLOMBIA_PA 는 성격이 달랐다 — 매핑 20/20 완비인데도 남음. 원인은 **af 일정 오류**
  - af 는 Junior vs Once Caldas 를 8/23 01:15Z, 우리(ts)는 8/24 01:15Z. 현지 8/23 20:15 이 정답이라 **우리가 맞다**
  - [x] 경보에 "양팀 매핑 있음: 일정(날짜) 불일치 의심" 태그 추가 — 이름 유형과 처방이 갈리므로
  - [x] `crossDay` 판정 추가 — 같은 팀 쌍(**방향 동일**)의 DB 매치가 ±2일에 있으면 같은 경기
    - 방향을 강제해 컵 2차전은 살린다
    - [x] 오탐 측정: 8/16·8/22·8/23 에서 7건 제거, **전부 DB 짝이 정확히 1건**씩 확인
    - 부수효과 — 킥오프가 KST 날짜 경계에 걸쳐 그날 판정에서 빠지던 건도 함께 구제
- [x] tsc 통과

## 후속 (경보가 새로 찾아낸 중복 — 1차 범위 밖, 2차에서 처리 완료)

8/15·8/17 감사에서 `[사각지대]` 가 3건 추가 검출. 전부 실제 중복으로 확인됐고, 새 이름 유형이라
규칙 보강이 따로 필요하다.

| 리그 | af 표기 | DB 표기 | 어긋난 이유 |
|---|---|---|---|
| ARG_PRIMERA_NACIONAL | Racing Cordoba vs San Martin S.J. | Racing de Cordoba vs San Martin San Juan | 전치사 `de` 삽입 · 약어 `S.J.`↔`San Juan` |
| MEXICO_2 | Leones Negros UDG vs CDS Tampico Madero | Leones Negros de la U. de G. vs Club Jaiba Brava | 약어 `UDG`↔`U. de G.` · **별명**(Tampico Madero = Jaiba Brava) |
| WK_LEAGUE | Changnyeong W vs Incheon Red Angels W | Gangjin Swans Women vs Incheon Hyundai Steel Red Angels Women | 홈팀 표기 상이(확인 필요) · 원정은 부분명 |

별명(Jaiba Brava)은 이름 규칙으로 못 잡는다 — CHINA_3 처럼 af 팀 ID 매핑이 맞는 해법.
