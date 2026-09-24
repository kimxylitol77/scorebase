# 일정 누락 전수 대조 (2026-09-24) — 체크리스트

범위: 2026-09-10 ~ 10-01, 전 리그. 권위 소스와 DB 대조 → 원인 → 복구.

## 완료
- [x] NHL 스플릿 스쿼드 dedup 수정·복구 (9ef176bb, 배포·13:01 cron 후 재검증)
- [x] 역방향 병합 흔적 전 리그 검사 — 종료 28,922건 raw↔DB 점수, SWAP 0
- [x] dup-cleanup 이 역방향 짝을 지우지 않는지 확인 (NHL dry-run 0그룹)
- [x] 축구 af 날짜별 전 세계 fixtures(22콜) vs DB 대조 — 142리그 2,628경기
- [x] VIETNAM_VL1 오매핑 — Cong An Ha Noi → CAND(#290185): JSON(99446cc3) + DB TeamSourceId + 기존 3경기 팀 교정
- [x] 컵 팀 매핑 갭 — UEL 8·AFC_CL 7·AFC_CL_TWO 14팀은 af 경기 브리지로 기존 팀 행에 매핑, DB 부재 12팀만 신규. 검증 POST skippedNoTeam 0
- [x] UEFA_U21_Q — Ireland U21 수동 매핑 + 표준 도구, 241경기 skippedNoTeam 0
- [x] "연기" 고착 88경기 — 원인(thesports-cache 킥오프 누락 + POSTPONED 무시 가드) 수정·안전망(939179c9), af 기준 종료 65·재편성 25 복구
- [x] 복구 후 af 대조 재실행 — 수집 리그 잔여는 설계상 제외(유소년 A매치 필터·ts 전용 친선)와 소스 간 일정 불일치 1건뿐
- [x] 비축구 ts diary 대조 — 농구·배구 0, 야구 3(창 끝 10/01), 하키 정규 리그는 전부 9/29~30 미래(수집 sweep 전)

## 남은 것
- [ ] 배포(push) — thesports-cache 수정·재확인 안전망은 배포돼야 재발이 막힌다
- [ ] 보류 7건 — 쌍둥이 3건(CSL #302955·BOLIVIA #314289·LALIGA #1221374)은 배포 후 cron 흡수, KAZAKHSTAN_PL 4건은 10/17 옛 행과 겹침(사람 확인)

## 결정 필요 (사용자)
- [ ] 노출 중이나 DB 수집 없는 12개 리그(af orphan 카드 전용) — 수집 온보딩 여부
- [ ] HOCKEY_FRIENDLY 소규모 클럽 친선 40경기 — 팀 매핑 없음(프리시즌 종료)

## 보고만 (범위 밖)
- 크로스소스 중복 행: CHAMPIONSHIP Cardiff 2건(팀 행 중복 #600015/#610511), CYPRUS_1D Aris, ECUADOR_LP 7/05
- raw≠DB 점수 18건(raw 스냅샷 정체·승부차기 포함 차이로 추정)
- UEFA_U21_Q 산마리노-스페인: ts 9/29 16:00 vs af 10/01 18:15
