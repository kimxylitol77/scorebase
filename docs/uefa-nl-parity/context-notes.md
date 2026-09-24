# 네이션스리그 5대 리그 급 — 결정 노트

## 발견 (2026-09-24 안도라-몰타 실측)
- 승부예측 홈/원정 2버튼, 마켓 탭 없음, 매치 인사이트 "데이터 누적 중 (0경기)", AI 확률 "—".
- 원인 1. 국대 판정이 "WORLD_CUP ‖ INTL_FRIENDLY" 로 4곳에 하드코딩 → UEFA_NL 은 클럽식 Elo(이력 0 → 전원 1500).
- 원인 2. 무승부 리그 목록(predictionEngine·MatchVoteCard·picks)에 UEFA_NL 없음.
- 원인 3. SPORT_PROFILE 에 없어 핸디·OU·BTTS 전부 null(getSportProfile null → 조용히 실패).
- 원인 4. 예측 이력을 리그 단위로 읽는데 UEFA_NL 종료 0건 — 같은 팀의 친선·월드컵 이력을 못 씀.

## 결정
- **Elo 는 기존 nationalElo 그대로.** eloratings.net 시드(월드컵 본선국) → FIFA 랭킹 환산(2050−250·log10 순위) → 1500.
  메모리엔 "환산은 모델링 결정 필요" 로 남아 있었지만 친선·월드컵에 이미 쓰는 공식이라 같은 기준을 확장한다.
  54개국 전원 값 있음(17 시드·37 환산). 한계: 환산값이 상위권을 낮게 잡는다(이탈리아 1756).
- **성인 국대 대회 전체에 적용**(WC_QUAL·EURO_QUAL·GULF_CUP·AFCON·CONCACAF_GOLD 포함). 같은 버그 부류라 한 번에.
  U20·U17·올림픽은 뺀다 — 국가명 Elo 는 성인 대표 전력이다.
- **이력 = A매치 전체**(historyLeaguesFor). 국대 Team row 는 대회와 무관하게 INTL_FRIENDLY 라벨 하나라 팀 id 로 이어진다.
- **마켓 프로파일은 A매치 종료 경기 실측**(UEFA_NL 자체 종료 0건). 친선 377·월드컵 104·골드컵 45·아프리카컵 12:
  총득점 약 2.8±1.75, 마진 약 0.53±1.97, 무 24%.

## 검증 (배포 전)
- 예정 10경기 compute-prediction: 전부 승·무·패 산출, 시장과 근접(안도라-몰타 34/31/35 vs 시장 27/35/38, 포르투갈-웨일스 80/13/7 vs 81/13/6).
- 핸디·OU 는 10경기 중 5경기만 — 나머지는 월드컵 본선국(포르투갈·노르웨이·오스트리아·네덜란드·독일) 경기.
  원인 = 같은 af id 로 Team row 가 둘(WORLD_CUP 라벨 행에 A매치 이력, INTL_FRIENDLY 라벨 행에 네이션스리그 경기).
- tsc 통과, npm test 387/387.

## 국대 Team row 중복 병합 (2026-09-24 적용)
- 원인: 9/23 국대 수집 재개 때 WC 행(#36xx~37xx)엔 api-football 대응표가 없어(thesports·world-cup 만) team-resolver
  3단계(cross-league 재사용)가 실패 → 4단계에서 INTL_FRIENDLY 라벨 새 행(#5996xx~5997xx) 생성. unique 가 (league, externalId)라 막히지 않았다.
  이후 네이션스리그·친선·걸프컵 경기가 새 행에 붙어 이력이 끊겼다(한국도 #3671 이력 / #599719 새 경기).
- 처리: canonical = WORLD_CUP 라벨 행. 경기 135 이동·TeamSourceId 67 재지정(충돌 0)·감독 보관 2·ts 매핑 JSON 2·빈 행 49 삭제, 한 트랜잭션.
  대응표를 옮겼으니 수집기는 1단계 직접 매핑으로 canonical 을 받는다 → 재발 없음.
- 백업: 세션 scratchpad nat-dedup-backup-apply.json (Team·경기 원래 팀 id·대응표·보관 행).
- 사라진 주소: /national-teams/5997xx (생긴 지 하루).
