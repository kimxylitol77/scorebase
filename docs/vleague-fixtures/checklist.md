# V-리그 남녀 일정 공백 — 체크리스트 (2026-10-03)

- [x] 2026-27 개막일·정규 일정 공개 확인 — KOVO `/stat/game-schedule?seasonCode=023` 남녀 각 126경기, 2026-10-31 ~ 2027-04-02
- [x] ts V-리그 id 변경 여부 — 그대로(`kn54qldhe9nrvy9` "Volleyball League", `d23xmvzhowyqg8n` "Volleyball League Women"), 10/31·11/1 각 1경기 확인
- [x] KOVO 시즌 일정 → Match 적재 잡 `src/jobs/collect-kovo-schedule.ts` (기본 dry-run, `--write`)
- [x] 일정 탭 주차 화면 연결 (`WEEKLY_VOLLEYBALL`)
- [x] dry-run — 남 126 / 여 126 신규, 매핑 누락·중복 0
- [x] 사용자 확인 후 운영 DB `--write` — 남 126·여 126 적재, 재실행 시 신규·갱신 0(멱등)
- [x] 로컬 렌더로 /leagues/V_LEAGUE·V_LEAGUE_W ?view=fixtures 확인 — 1~22주(10/31~4/2)
- [x] 정기 재실행 — 맥미니 daily-fa-cup.sh(매일 09:40 KST) sync-season-fixtures 다음 줄
