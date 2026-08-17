# 컵↔자국 중복 Team row 정리 — 컨텍스트 노트

## 왜 스킬의 금지 조항을 넘어서는가

`scorebase-team-dedup` 스킬은 "컵 리그(UCL/UEL/UECL 등) row 를 정규 리그 row 와 합치지 말 것 —
의도된 별도 row 구조" 라고 못박고 있다. 이번엔 그 반대로 간다. 근거는 코드다.

- `src/jobs/collect-fa-cup.ts` 의 `seedTeamMappings` 는 이미 **"컵 행 자체와 친선 행은 canonical 아님
  — 도메스틱 리그 행 우선"** 정책으로 `(FA_CUP, thesports, tsId) → 도메스틱 teamId` 를 선등록한다.
  즉 컵 네임스페이스 Team row 는 "설계"가 아니라 **매핑이 없을 때 생기는 폴백 부산물**이다.
- `src/app/api/internal/thesports-matches/route.ts` 의 JSON 폴백은 `tsId → ourId` 가 **유일할 때만**
  (`unambiguous`) 매치를 붙인다. 한 tsId 가 두 ourId 를 가리키면 대항전 매치가 조용히 skip 된다.
- `standings-helper.ts` 는 `ourLeague` 별로 Map 을 나눠 쓰므로, 매핑 entry 의 `ourLeague` 를 그대로
  두고 `ourId` 만 자국 row 로 바꿔도 순위 표시는 그대로 동작한다.

## 판정은 이름이 아니라 TheSports 원본으로

첫 시도(이름 NFKD 정규화 비교)는 **양방향으로 틀렸다**.

- 거짓 병합 — `Barcelona`(LALIGA) 와 `Barcelona SC`(COPA_LIB, 에콰도르 클럽)가 "같은 이름"으로 통과.
- 거짓 차단 — `Bayern München` vs `Bayern Munich`, `Olympiakos` vs `Olympiacos` 가 다른 팀으로 분류.

그래서 판정 근거를 바꿨다. **각 Team row 의 "실제 ts 정체"** = 그 row 자신의
`TeamSourceId(source=thesports).externalId` 로 ts 팀을 조회한 결과(없으면 매핑 tsId). 두 row 의 ts
정체가 국가나 이름에서 어긋나면 BLOCK. 이 방법으로 사용자가 못 본 오매핑이 더 나왔다.

```
Platense   ARGENTINA_PL ↔ COPA_LIB row 의 ts 정체 = Platense/Honduras
Junior     COLOMBIA_PA  ↔ COPA_LIB row 의 ts 정체 = Atletico Junior/Honduras
Al Shorta  IRAQ_SL(Iraq) ↔ AFC_CL row 의 ts 정체 = Al Shorta/Syria
U. Catolica CHILE_PD ↔ COPA_LIB row 의 ts 정체 = CD Universidad Católica/Ecuador
```

한 Team row 가 서로 다른 두 tsId 그룹에 등장하면(병합 상대가 갈림) 무조건 BLOCK 이다.
단, 두 그룹의 row 집합이 **완전히 같으면**(매핑 json 에 tsId 만 둘) 병합 방향이 갈리지 않으므로 통과시킨다.

결과: **MERGE 194그룹(196 row) · BLOCK 15그룹.** 사용자 브리핑의 "충돌 26건" 은 이 규칙 완화 전 수치와 일치했다.

## 병합이 안전하다는 근거 (적용 전 실측)

- 병합 후 self-match(home==away) **0건** — 두 row 의 매치 집합이 대회로 갈려 있어 겹치지 않는다.
- 같은 (날짜, 상대) 매치가 양쪽에 있는 경우 **0건** — 같은 경기가 두 번 들어간 게 아니다.
- `Team.eloRating` 은 전 팀 1500 — 예측에 쓰이지 않으므로 병합으로 인한 레이팅 오염이 없다.
- 로고 손실 0건. 한글명은 canonical 에만 없는 경우가 28건이라 **삭제 전 승계**하도록 스크립트에 넣었다.

## 부가 참조 처리 원칙

| 테이블 | 처리 | 이유 |
|---|---|---|
| `Match.home/awayTeamId` | canonical 로 이전 | 본체 |
| `TeamSourceId` | canonical 로 이전, 충돌 시 폐기 | 컵 네임스페이스 소스행이 canonical 을 가리켜야 재생성이 안 된다 |
| `TeamSeasonStatArchive` | 이전, `(teamId, seasonLabel)` 충돌 시 컵 쪽 폐기 | unique 제약. 매일 upsert 로 재도출됨 |
| `CoachTenureArchive` | 이전, canonical 에 현직(endedAt null) 있으면 컵 쪽 폐기 | 팀당 현직 1행 규칙. 두 행이 열려 있으면 영구 오표시 |
| `InjurySnapshot` / `User.favoriteTeam` | 이전 | 실측 0건이지만 방어 |

## 남는 한계 — dedup 만으로 95% 는 안 된다

`verify-football-season` 의 `team-mapping-rate` 는 `ourLeague === <컵>` 인 매핑 entry 의 tsId 집합만
센다. dedup 은 entry 의 `ourId` 만 바꾸므로 **매핑률 자체는 그대로다**. 올리려면 dedup 이후에
"자국 row 만 있는 참가팀"에 대해 컵 네임스페이스 entry 를 추가 생성해야 한다 — dedup 은 그 작업의
**전제**(한 tsId 에 ourId 가 하나여야 무엇을 쓸지 정해진다)이지 그 자체가 아니다.
게다가 8월 diary 창은 예선 라운드라 참가팀 모수가 부풀어 있다. 리그페이즈(9~10월) 이후 재측정이 정확하다.

## 참고

- 메모리 `cup-domestic-duplicate-team-rows` · `uefa-qualifier-team-mapping-gap` · `ts-competition-id-mismatch`
- 스크립트 `scripts/dedup-cup-domestic-teams.mjs` (dry-run 기본)
