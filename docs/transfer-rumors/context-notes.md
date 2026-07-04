# 이적 루머 부활 — 컨텍스트 노트

## 2026-07-04 설계 결정

- **별도 cron 안 만듦** — fetch-news-briefing(2h)에 통합. 이유: RSS 소스·dedup·
  화이트리스트·탭로이드 차단이 동일하고, 수집을 두 번 하면 낭비. 루머 추출 실패가
  브리핑을 막지 않도록 try/catch 격리.
- **rumorOnly 소스 플래그** — 풋볼리스트(국내)는 루머 피드에만 공급. 한국어 기사를
  브리핑으로 "재구성"하면 한국어→한국어라 번역이 아니라 표절 위험 → 브리핑 후보에서
  제외 필수. KO_KEYWORDS(오피셜·이적 임박·히위고 등) 프리필터로 haiku 비용 절감.
- **stage 클램프는 코드 정규식** — LLM 판정 신뢰 안 함. HERE_WE_GO=/here we go|히위고/,
  OFFICIAL=오피셜 태그(구단 공식 피드) 또는 완료 문구, MEDICAL=/medical|메디컬/.
  클램프는 하향만 (승급 조작 방지).
- **sonnet 검증은 강한 주장만** — TALKS 오류는 피해가 작고 볼륨이 커서 전수 검증은
  비용 낭비. HERE_WE_GO/OFFICIAL 만 헤드라인 대조 (선수·이적 방향·단계). 불합격 = 드롭.
- **동성 병합 fix(8ae70d9) 원형 유지** — namesCompatible(짧은 표기 ⊆ 긴 표기) +
  14일 내 기존 행 id 재사용 + 긴 이름 우선. 이건 실사고(브루노/마테우스 페르난데스
  덮임) 산출물이라 단순화 금지.
- **기존 24행 truncate** — 철회 당일(7/2) 결함 파이프라인 산출물. 새 파이프라인이
  2h 마다 다시 채움.

## 2026-07-04 구현 중 실측

- **강한 주장 검증 게이트 실효**: 첫 DRY 부터 "Mateus Fernandes → 맨유 (HERE_WE_GO)"
  오추출(실명 없는 로마노 4720만 파운드 헤드라인에서 선수를 지어냄)을 sonnet 검증이
  드롭. 매 런 반복 확인 — 이 게이트가 지난 철회 사고(다른 선수 기사 덮임)의 직접 방어선.
- **stage 클램프 보정 2건**: ① "agree(s/d) ... deal/fee/terms" 합의 보도가 TALKS 로
  과소 표시 → HERE_WE_GO 대역에 합의 문구 추가. ② BBC 완료형 헤드라인("Chelsea sign X")
  이 TALKS → wishfulSign 네거티브("want to sign" 류) 걸러낸 뒤 "signs? [A-Z]" 를 OFFICIAL
  로. 오탐은 어차피 sonnet 검증이 2차 게이트.
- **KO_NAME_FIX 첫 축적**: 나선 아케→네이선 아케. summaryKo 에도 fixKo 적용해야 함
  (playerKo 만 적용했다가 요약에 오기 잔존했던 실수 — 수정 완료).
- **tribuna·90min 애그리게이터 유입** → TABLOID_RE 에 추가.

## 함정

- TransferRumor 테이블은 prod 에 살아 있음 (revert 는 코드만 제거) — db push 금지,
  스키마 모델만 복원하면 됨.
- transfers 페이지는 철회 이후 리팩터링됨(db6f70e 소식순 재편 등) — 옛 diff 그대로
  안 붙음. 수동 재적용.
- 옛 cron(transfer-rumors, 6h)은 부활시키지 말 것 — news-briefing 러닝에 포함됨.
