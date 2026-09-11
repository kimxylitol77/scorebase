# 경기 종료 후 30분 내 데이터 카드 쇼츠 자동 발행 — 계획 (2026-09-11)

## 목표
빅5 리그 경기가 끝나면 30분 안에 "스코어 + xG + 샷맵 애니메이션 + 핵심 인사이트 1~2문장" 45초 세로 쇼츠를 만들어 유튜브에 올리고 텔레그램으로 알린다.

## 실측으로 확정된 전제 (09-11)
- RECAP 자동 발행은 꺼져 있고(cron 제거·GENERATE_DISABLED), TACTICAL 은 월·목 배치(DRAFT). → 기사 파이프라인에 "이미지 단계 추가"로는 30분을 못 맞춘다. **쇼츠는 기사와 독립된 트리거로 만들고, 인사이트는 경기 데이터에서 직접 생성한다.**
- xG: DB fixtureStats 에는 종료 직후 xG 가 없다(최근 3경기 undefined). **TheStatsAPI 샷맵(슛별 expected_goals)이 유일한 즉시 xG 소스.** 26/27 종료 경기 4건 모두 `xg_available:true`, 슛 18~33개.
- 히트맵: 선수 터치 좌표는 주 1회(토) 배치 + canvas KDE 렌더 → v1 제외. v2 후보.
- FINISHED 감지: Vultr fast-poller(2초) → DB status. 지연 무시 가능.
- 렌더 호스트: MacBook 은 새벽에 잠든다. **맥미니**(arm64·24GB·node 26·339GB) 에 Remotion 설치 필요(ffmpeg·크롬 없음 → brew ffmpeg + Remotion 내장 크로미움).
- 유튜브 업로드: 구글 검수 전이라 API 업로드는 비공개로 잠김 → 검수 통과 전까지 "비공개 업로드 + 텔레그램 링크".

## 구조
```
맥미니 봇 match-shorts.js (5분 tick)
  1. DB: 빅5 FINISHED, 종료 ≤3h, state 파일에 없음
  2. TheStatsAPI: date+팀명 → 매치 id → xg_available 이면 shotmap (아니면 다음 tick, FT+90분까지)
  3. 인사이트: haiku 1콜 (스코어·xG·슛·득점 분·최다 슛 선수) → 2문장 한국어, 숫자 팩트 게이트
  4. props JSON → Remotion `MatchShotShort` 렌더 (45초, 1080×1920)
  5. youtube-upload.mts (private) + 텔레그램 링크 + (선택) 게시판
  6. state 파일에 matchId 기록
```

## 열린 결정 (사용자)
1. 렌더 호스트 = 맥미니 확정? (대안: MacBook 깨어 있을 때만 → 새벽 경기 못 맞춤)
2. 발행 시각: FT+30분 즉시(KST 새벽) vs 07:30 KST 일괄 공개 예약. 권장: 업로드는 즉시, 공개는 검수 후 예약 옵션.
3. 히트맵 v1 제외 동의?
4. 하루 상한(빅5 주말 20경기+) — 권장: 리그당 1편/일, xG 차이 큰 경기 우선.
