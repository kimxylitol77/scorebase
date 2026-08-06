# 전술판 야구·농구 확장 (/lineup?sport=)

사용자 확정 2026-08-06. TacticalPad 조사에서 나온 격차 중 "다종목" 실행.

## 데이터 (실측 완료)

| 종목 | 후보 풀 소스 | 사진 | 포지션 |
|---|---|---|---|
| NBA | data/nba-players.json 545명 (한글명·팀·등번호) | ESPN O | G/F/C |
| KBO·NPB | data/baseball-rosters.json (Team.id 키, 22팀) | X | P/B |
| MLB | BaseballPlayerSeasonStats (externalId→midfield) | O | 투/타 |

## 설계 원칙

- 공유 코드 하위호환: wire 에 `sp` 필드 추가(없으면 축구). POS_CODES 는 **append-only**.
- 좌표계 재사용: 선수 자유좌표(x,y%) + 프리셋은 좌표 액션 — 종목 무관 동일.
- 그리기·undo·벤치·커스텀 선수·공유·게시판 첨부 전부 그대로.

## 체크리스트

- [x] lib/lineup/sports.ts — 종목 정의(포지션 세트·프리셋·보드 배경 키)
- [x] 농구: PG/SG/SF/PF/C(표시), 풀 pos G/F/C. 프리셋 4종(기본·3아웃2인·5아웃·수비)
- [x] 야구: P/C/1B/2B/3B/SS/LF/CF/RF. 프리셋 4종(기본·내야 시프트 좌/우·번트 대비)
- [x] lineup-state.ts — wire sp + POS_CODES 확장 + 왕복 테스트
- [x] Pitch.tsx — 농구 코트·야구 다이아몬드 마킹(SVG, 축구와 같은 방식)
- [x] page.tsx — ?sport 파싱 + 풀 로더(NBA json·KBO/NPB json·MLB DB)
- [x] LineupBuilder — sport prop, 프리셋·포지션 칩 종목화, 종목 전환 UI
- [x] og/lineup — 수정 불필요 (kit 그라데이션만 사용, court/diamond 키가 KIT_BY_KEY 에 등록돼 자동)
- [x] 검증: 종목별 보드 생성→공유 왕복→og→게시판 첨부
- [ ] 커밋·배포

## 검증 결과 (2026-08-06 로컬 실브라우저)

- 농구: 탭·코트 마킹·프리셋 4종, 골든스테이트 로드 → 커리(30)·버틀러·그린 사진 5명 배치
- 야구: KBO 10·MLB 30·NPB 12팀, 다이아몬드 SVG, 두산 로드 9인 수비
- 공유 왕복: 코드 sp="bs" → ?sport 없이 열어도 야구 보드+선수 복원
- 축구 회귀: 4-3-3 11마커·축구 라인·기존 그대로. sp 없는 옛 코드 = soccer (하위호환)
