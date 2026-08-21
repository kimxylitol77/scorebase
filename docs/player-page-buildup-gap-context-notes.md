# 선수 페이지 buildup 갭 — 컨텍스트 노트

## 왜 이 작업인가

2026-08-21 buildup `/players/855`(칸셀루)·`/players/636`(베르나르두 실바) 4탭 전부와
우리 `/transfers/{tsId}` 를 실렌더 대조한 결과, 그들에게만 있는 것 8종 중
비용 0 으로 즉시 메울 수 있는 3종을 먼저 잡기로 사용자가 결정.

## 결정과 근거

**af 응답을 버리고 있었다.** `parseFixturePlayers`(api-football-pro.ts) 가
`/fixtures/players` 응답에서 `games·goals·cards` 만 읽고 `shots·passes·tackles·
duels·dribbles·fouls·penalty` 를 통째로 폐기하고 있었다. buildup 이 경기 행마다
`키패스 2 · 태클 4 · 인터셉트 1` 칩을 붙일 수 있는 건 같은 소스를 다 읽기 때문.
따라서 이 갭은 **신규 API 호출 0건**으로 메워진다 — af 쿼터 압박이 잦은 우리 사정상
이게 결정적이었다.

**컬럼을 넉넉히 잡는다.** 화면에 당장 안 쓰는 필드(경합·드리블 시도)도 함께 적재한다.
사용자 방향이 "가진 데이터는 축적하고 맥락 붙여 노출"이고, 나중에 다시 백필하는 비용이
지금 컬럼 추가 비용보다 훨씬 크기 때문. nullable Int 라 기존 행은 그대로 둔다.

**국가대표 로그는 소스가 다르다.** 클럽 로그 = af `PlayerMatchLog`,
국가대표 로그 = `TheSportsMatchCache.playerStats`(ts). ts 는 필드가 훨씬 풍부하다
(`key_passes·tackles_succ·interceptions·duels_won·dribble_succ·big_chance_created` 등 50여 개).
두 소스를 같은 `MatchLogRow` 형태로 정규화해서 UI 는 하나만 알게 한다.

**필터는 클라이언트지만 SSR 전량 렌더.** `PlayerTabs` 가 전 탭 SSR + CSS hidden 으로
SEO 를 지키는 것과 같은 이유. 행을 클라이언트에서 잘라내면 HTML 에는 전부 남아 있어
색인에 영향이 없다.

## 함정

- **prod DDL** — nullable 컬럼 추가라도 ACCESS EXCLUSIVE 락이 필요하다.
  맥미니 pg_dump 가 hang 중이면 ALTER 뒤로 모든 읽기가 줄을 선다(2026-07-04 사고).
  장기 트랜잭션 확인 → `lock_timeout 3s` 순서를 반드시 지킬 것.
- **prisma generate 후 dev 서버 재시작** — 안 하면 Unknown field.
- **worktree stale** — 작업 시작 시 origin/main 보다 40커밋 behind 였다. rebase 후 진행.
  (이미 고쳐진 걸 중복 수정하는 사고 방지 — 2026-06-22 교훈)
- **Capology 경로** — 리그마다 URL 구조가 달라 추측 금지. 실제 status 로 검증.

## 진행 로그

- 2026-08-21 시작. worktree rebase(40커밋) 완료.
