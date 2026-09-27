# 농구 블라인드 드래프트 — 체크리스트

## 0. 준비
- [x] SixRings 한 판 완주하며 규칙 실측
- [x] 우리 농구 데이터 조사 (NBA 1994~, KBL 1997~ 백필 가능 확인)
- [x] 사용자 결정 3건 확인
- [x] 작업 브랜치를 origin/main 으로 맞춤

## 1. 데이터
- [ ] `scripts/build-draft-pool.ts` — NBA(ESPN byathlete) 수집
- [ ] KBL(공식 API) 수집 + 구단 계보 매핑 + 포지션
- [ ] 기여도(공격/수비) 산식 + 시즌 내 표준화
- [ ] `data/draft-pool-nba.json`, `data/draft-pool-kbl.json` 생성·검증
- [ ] NBA 옛 선수 한글 이름

## 2. 엔진
- [ ] 타입·시드 난수·판 생성
- [ ] 슬롯 배치 규칙
- [ ] 찬스 7종
- [ ] 채점·보너스·반지
- [ ] 단위 테스트

## 3. 저장·API
- [ ] `DraftGame` 모델 (prod 테이블 생성은 사용자 확인 후)
- [ ] `/api/draft` 라우트
- [ ] 응답에 미공개 수치 누출 없음 확인

## 4. 화면
- [ ] 로비 + 게임 화면 (`/basketball/draft`)
- [ ] 결과·공유 페이지 + OG 카드
- [ ] 리더보드 (오늘·역대, 회원만 등재)
- [ ] 모바일 375px 확인

## 5. 동선·마무리
- [ ] 농구 허브·네비·sitemap 연결
- [ ] `npm test`, `tsc`
- [ ] 로컬 완주 검증
