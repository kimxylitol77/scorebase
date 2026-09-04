# 임베드 위젯 2종 확장 — 컨텍스트 노트 (2026-09-04)

## 왜

구매한 프로필 백링크 250개 실측 결과 실제 가치가 거의 없었다(reports 없음, 세션 기록).
링크를 "사는" 대신 남이 붙여 가는 물건을 만들기로 — 기존 `/embed/*` + `/widgets` 엔진
(2026-06-27, 메모리 embed-widget-backlinks) 위에 리그 단위 위젯 2종을 얹는다.
복사 코드 안의 출처 `<a>` 가 백링크 본체라는 구조는 그대로.

## 위젯

1. `/embed/standings?league=EPL&rows=10&theme=light|dark` — 리그 순위표.
   데이터는 `getStandingsState(league)`(af→ts 폴백, 개막 전/소스 없음 상태 포함).
   **축구 리그만** — 야구·농구 순위는 다른 헬퍼(소스 이중화)라 이번 범위 밖.
2. `/embed/fixtures?league=EPL&days=7&limit=10&theme=` — 향후 경기 + AI 승률.
   Match SCHEDULED, 킥오프 -3h~+days, predHome/Draw/Away 를 막대로. 전 리그 가능.

## 결정

- 갤러리(/widgets)는 리그 선택 `<select>` 가 있어야 붙여 가는 사람이 자기 리그 코드를 만든다 →
  클라이언트 카드 `LeagueWidgetCard` 신설(iframe 미리보기 + 코드 즉시 갱신). 기존 정적 2종은 그대로.
- 위젯 안 하단 "제공: 스코어베이스" 링크는 iframe 내부라 SEO 링크는 아니고 클릭 유도용.
  SEO 링크는 복사 코드의 `<p>출처: <a>` 뿐 — 이 구조를 바꾸지 말 것.
- 시간 표기는 KST 고정(Intl, Asia/Seoul). 위젯은 한국 블로그·카페 대상.
- 팀명은 `toKoreanTeamName(name, league)`, 로고는 `TeamBadge`(공용).
- revalidate: 순위 600s · 경기 300s. embed 페이지는 noindex.

## 함정 (기존 메모리에서)

- `/embed/*` 만 X-Frame-Options 예외(middleware). 새 경로도 `/embed/` 아래면 자동.
- 사이트 chrome 은 `usePathname` 으로 `/embed` 에서 숨김 — 새 페이지도 자동.
- 빌드 프리렌더 중 Neon 실패 대비: DB 조회는 try/catch 로 감싸 빈 상태 렌더(wc-bracket 과 동일).
