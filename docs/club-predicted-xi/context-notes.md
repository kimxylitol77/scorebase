# 클럽 예상 라인업 — 컨텍스트 노트

2026-08-16 시작. 사용자 요청 "라리가 개막 — 우리 데이터로 예상 라인업 + 부상자 결합". 범위 확정: 5대 리그 + K리그, 선수별 확률 % 포함.

## 왜 새로 안 만들고 WC 파이프라인을 일반화하나

`scripts/build-wc-predicted-xi.ts` → `data/wc-predicted-xi.json` → 라이브 페이지 로드 →
`SoccerNowBlock`(피치 + OUT 배지 + 부상 명단 + 확정 도착 시 자동 교체)가 이미 검증된 전체 파이프라인.
렌더 계층(SoccerLineupSvg·formation-layout)은 그대로 재사용하고 빌더와 로드 분기만 클럽용으로 추가한다.

## 핵심 결정

1. **팀 선정은 리그 라벨이 아니라 향후 14일 SCHEDULED 매치의 teamId.**
   Team.league 라벨은 승격·강등 롤오버가 수동이라 낡을 수 있다(메모리 team-league-label-rollover).
   예측이 필요한 팀 = 예정 매치가 있는 팀이므로 매치에서 역산하는 게 정확하고 라벨 무관.

2. **라인업 소스는 Match.lineupHome(이름만)이 아니라 TheSportsMatchCache.lineup.**
   선수 ts id·포지션·등번호·사진·평점까지 있어 부상 매칭(id 기반)과 렌더가 깨끗하다.
   실측(8/16): 프리시즌 CLUB_FRIENDLY confirmed 606건 — 승격팀(라싱 등)도 최근 5경기 보유.

3. **가중치 = 최근 감쇠 × 대회 계수.** Flashscore 공개 방법론(최근 가중 + 같은 대회 우대) 이식.
   자기 리그 1.0 / 다른 경쟁 대회(컵·직전 시즌 타리그) 0.75 / CLUB_FRIENDLY 0.5.
   시즌 초엔 친선이 유일한 재료라 0.5 로도 지배하고, 리그 경기가 쌓이면 자동으로 밀려난다.

4. **부상 제외는 빌드 타임(InjurySnapshot) + 렌더 타임 배지 이중.**
   빌드에서 최신 스냅샷(3일 이내)의 부상 선수를 후보에서 제외 → 백업이 자동 승격 (Flashscore 방식).
   렌더에서 스냅샷 명단을 다시 보여주고 XI 에 남은 부상자(스냅샷이 빌드보다 새 경우)는 OUT 배지.
   매칭: playerTsId 1순위, 없으면 성+이니셜(팀 내 유일할 때만) — af "A. Gonzalez" 축약 대응.
   **렌더 타임 af 직접 호출 금지** — /live 렌더의 af 호출이 쿼터 전소 사고 전례(af-quota-extras-incident).
   WC 는 af season injuries 를 호출하지만 클럽은 InjurySnapshot(DB)로 간다.

5. **afId 매칭(af squads 호출) 생략.** WC 빌더의 afId 는 부상 매칭·선수 링크용이었는데,
   클럽은 부상 매칭이 ts id 로 되고 예상 뷰 선수 링크는 원래 없음(SoccerNowBlock 이
   linkableIds 를 안 넘김). af 호출 6리그×20팀/일 을 아낄 수 있다.

6. **확률 % = 기존 confidence(가중 투표 점유율)를 그대로 표기.** 업계 조사(8/16) 결과
   선수별 확률을 다는 곳이 없음(Sportsmonks API 조차 값 없음) — 저비용 차별화.
   예상 뷰에서는 avgRating 배지 대신 confidence 칩을 보여준다(둘 다 달면 과밀).

7. **cron 은 기존 cron-wc-xi.sh(이 맥북 07:00, DB 만 읽으므로 ts 화이트리스트 무관)에 편승.**
   빌더 한 줄 + git add 경로 추가. 새 launchd 잡을 만들면 맥미니 git 락 충돌 리스크만 는다.

## 사이트 리서치 요약 (8/16, 서브에이전트)

- Flashscore 만 방법론 공개: 최근 경기 최빈 포메이션, 포지션별 선발 최다→출전시간·평점 타이브레이크, 최근 지수 가중, 같은 대회 우대, 부상·징계·이적 제외.
- 업계 현실 정확도 벤치마크 11명 중 8명 (Sportmonks 자인) → "예상" 라벨 + 갱신 시각 필수.
- 후속 아이디어(이번 범위 밖): 확정 후 "AI 예상 N/11 적중" 사후 배지, 매치데이 예상 라인업 SEO 인덱스 페이지(/lineups/{league} 류), 부상 의심 선수 출전확률 % (FFScout 식).

## 함정 기록

- lineup.confirmed=1 이어도 선발 미지정 사전 스쿼드인 케이스(2026-06-10 멕시코전) → starters>=10 게이트 유지.
- ts 캐시 lineup.home 이 배열일 수도 객체일 수도 있음 — Object.values 로 통일 (WC 빌더 동일).
- InjurySnapshot 은 부상 있는 팀만 row — 팀 수 부족은 정상이지 결손 아님.

## 구현 중 발견 (8/16)

- **InjurySnapshot.teamId 전부 null** — 수집기가 안 채움. 부상 join 은 teamName 정규화 매칭
  (`teamNameMatches`, club-xi-leagues.ts)이 유일 경로. 빌더·라이브 페이지 공용. 수집기 백필은 후속.
- 프리시즌 친선만으로는 빅클럽 XI 가 유스로 오염 (바르사 실측: 유스 4명) → 직전 시즌 리그 3경기
  w0.8 블렌드 + 잔류 게이트(스쿼드 파일 ∪ 최근 라인업 로스터 — 친선 미출전 주전 때문에 합집합 필수).
- cron-wc-xi.sh 는 **git 미추적** — 메인 체크아웃(/Users/kimss/scorebase/scripts/)에만 존재.
  worktree 에서 고쳐봤자 소용없고 메인 쪽 파일을 직접 수정해야 한다. 크론이 git pull 을 안 하므로
  배포 후 메인 체크아웃 pull 필요 (안 하면 다음날 빌더 파일 없어 skip).
