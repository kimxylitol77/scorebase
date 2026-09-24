# 영어판 LoL 팀명 — 체크리스트

- [x] 1. 영어판 LoL 노출 화면 전수 조사 (선수 4·순위 5·팀 4·스코어)
- [x] 2. 빌더를 순위 JSON 4종까지 확장 — `data/lol-teams.json` 36 → 45팀 (미해결 0)
- [x] 3. `/en/standings/LEC`·`/LCS` — `lolTeamNameEn(teamId)` 경유
- [x] 4. `/en/standings/LPL` — 그룹 중첩 동일 처리
- [x] 5. `/en/standings/EWC` — `TEAM_NAME_EN` 5팀 보충(ts 공식 영문명)
- [x] 6. 오역 교정 — "카르민 코프" Kapfenberger SV → Karmine Corp
- [x] 7. en-mirror 형제 파일 되돌림 (standings/page·leaderboard-categories·en/hockey)
- [x] 8. tsc exit=0
- [x] 9. dev 렌더 검증

| 화면 | 전 | 후 |
|---|---|---|
| `/en/standings/LEC` | 한글 10팀 | 0 |
| `/en/standings/LCS` | 한글 10팀 | 0 |
| `/en/standings/LPL` | 한글 13팀 | 0 (그룹명만 잔존) |
| `/en/standings/EWC` | 한글 5팀 | 0 |
| `/en/teams/609377` 제목 | **Kapfenberger SV** | Karmine Corp |
| `/en/scores?sport=esports&date=2026-09-20` | Kapfenberger ×8 | Karmine ×8 |

- [x] 10. commit → `git push origin HEAD:main` → 운영 확인

## 남긴 것
`docs/lol-en-team-names/context-notes.md` 의 "남긴 것" 4건 참고.
1순위는 `/en/standings/LOL` 영어판 컴포넌트 신설.
