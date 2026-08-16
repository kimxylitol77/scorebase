# 유럽 하키 리그 9개 온보딩 체크리스트

목표. 9월 개막 유럽 하키 정규시즌·컵을 `/scores` 하키 탭에 수집·노출.
클럽 친선 온보딩(`docs/hockey-friendly/`)에서 249팀을 시드해둔 덕에 신규 팀은 32개뿐이다.

실측 근거 (2026-08-16, ts diary 7/17~9/16 ±30일 전 구간 sweep).
대회명은 추정이 아니라 ts `unique_tournament/list` 공식값.

| 리그 코드 | ts utid | 공식명 | 경기 | 팀 | 기시드 | 신규 |
|---|---|---|---|---|---|---|
| `KHL` | `9vjxm87bywlr6od` | Kontinental Hockey League | 50 | 22 | 20 | 2 |
| `CHL_HOCKEY` | `d23xmv0b7wlrg8n` | Champions Hockey League | 48 | 24 | 16 | 8 |
| `LIIGA` | `4zp5rzyb825q82w` | Liiga (핀란드) | 31 | 17 | 16 | 1 |
| `SWISS_NL` | `l965mknbpg0m1ge` | National League (스위스) | 7 | 14 | 8 | 6 |
| `CZECH_EXTRALIGA` | `jednm95b1doryox` | Extraliga (체코) | 5 | 10 | 9 | 1 |
| `SLOVAK_EXTRALIGA` | `kdj2ry0b8x2q1zp` | Tipos Extraliga | 6 | 12 | 12 | 0 |
| `DENMARK_METAL` | `z8yomodbn49q0j6` | Metal Ligaen | 15 | 9 | 3 | 6 |
| `KAZAKHSTAN_CUP` | `8yomodb7o17q0j6` | Kazakhstan Cup | 20 | 10 | 2 | 8 |
| `BELARUS_SALEI_CUP` | `p4jwq2lblzyr0ve` | Salei Cup (벨라루시) | 42 | 14 | 9 | 5 |

합계 — 고유 팀 122 (친선 시드 90 재사용 + 신규 32), 매치 223건.

- [x] types.ts — League union 9건
- [x] sport-leagues.ts — ALL_LEAGUES / SPORTS.hockey.leagues / LEAGUE_DISPLAY / LEAGUE_ORDER / COUNTRY_BY_LEAGUE
- [x] sports/index.ts — collectors no-op 9건 + teamSourceFor
- [x] predictionEngine.ts — HOCKEY_LEAGUES
- [x] analysis/matches.ts — 리그 라벨
- [x] hockey/page.tsx — HOCKEY 배열
- [x] DB — Team 신규 32 · `Team.league` 라벨 갱신 68(HOCKEY_FRIENDLY → 정규리그) · TeamSourceId 132
- [x] 매핑 JSON 두 사본 — 312 → 444행 (리그별 키라 (tsId, 리그) 쌍 중복 0)
- [x] ice-hockey-match-collector.js — COMP_TO_LEAGUE 9건
- [x] tsc → commit(490af4a·490eeef) → main push
- [x] Vultr — scp → chown → node --check → systemctl restart
- [x] 검증 — 워커 `312 → 344 mapped teams`, 수집 172 → 212건, skippedNoTeam=0
- [x] 검증 — /scores 하키 탭에 살레이컵·카자흐스탄컵 카드+칩 노출, 컵 상세 200 (리그순위·순위표 링크 없음)
- [x] 검증 — 팀명 전수 스캔에서 오적용 2건 발견·수정 (오버라이드를 친선 한 리그에만 넣어 CHL·슬로바키아에서 재발)
- [x] 후속 — Team.name 앞뒤 공백 1건 정리 (하키 344팀 전수 확인)
- [x] 후속 — 하키 허브 메타·안내 문구를 새 리그 반영해 갱신

## 지금 상태 (2026-08-16)

매치가 들어오는 건 컵 2개(각 20건)뿐이고 정규리그 7개는 개막 전이라 0건이다.
collector 가 ±5일 sweep 이라 **개막 5일 전부터 자동으로 채워진다** — 조치 불필요.

- 리그 필터 칩은 매치 유무와 무관하게 전 리그를 나열하는 기존 동작이라, 9월까지 빈 칩이 보인다
  (NHL·세계선수권도 비시즌에 같은 상태였다). 하키 칩이 14개로 길어진 건 그 결과.
- 하키 허브의 리그 카드(LEAGUE_BLOCKS)에는 KHL 등을 아직 안 넣었다. 지금 넣으면
  "순위 데이터 준비 중"만 뜬다 — 9월 데이터가 쌓인 뒤가 맞다.

## 제외 (의도)

같은 sweep 에 잡혔지만 안 붙인 대회. 이유는 J3 제외 선례(3부는 관심이 낮은데 수집이 붙다 말아 반쪽이 된다)와 같다.

- **2부 리그** — Chance Liga(체코 2부, 24경기) · Mestis(핀란드 2부, 10) · Slovak 1. Liga(1)
- **유스** — Swiss U21 Elit(7) · U20 Friendly Games(14)
- **여자** — SDHL(스웨덴 1부, 5) · Euro Hockey Tour Women(6). 한국 수요가 사실상 없고 표본도 얇다
- **SHL(스웨덴)·DEL(독일)** — 9/17 이후 개막이라 diary(±30일 창) 밖. 일정이 들어오면 utid 한 줄로 추가
