# 이적 임박·루머 탭 부활 — 계획

> 2026-07-04. 해외 브리핑 품질 확인 후 사용자 승인 — "이적 루머 살리고 해외브리핑도 살리기".

## 무엇을

출시 당일 철회됐던 /transfers?view=rumors (7c9714d → 810bbf4 revert) 를
해외 브리핑 파이프라인의 품질 게이트 위에 얹어 복원한다.

- 브리핑(커뮤니티 글, 고가치 소수)과 루머(딜 상태 피드, 전량)는 역할 분담 — 같은
  수집 파이프라인(fetch-news-briefing)에서 갈라진다. cron 추가 없음 (2h 러닝에 편승).
- UI·테이블·병합 로직은 git 이력에서 복원: 7c9714d(기능) + 8ae70d9(동성 병합 fix
  + KO_NAME_FIX 교정 사전). prod TransferRumor 테이블은 revert 때 보존됨 (24행 —
  결함 파이프라인 산출물이라 재출시 전 truncate).

## 지난 실패(당일 철회) 재발 방지 4종

1. **소스 화이트리스트** — 구글뉴스 잡탕 → Tier1(로마노·온스타인·BBC·Sky·구단 공식)
   + 국내 풋볼리스트(rumorOnly). TABLOID_RE 블록리스트 공유.
2. **실명·구단 미특정 드롭** — 옛 노이즈 가드 유지 (unknown·재계약·무산·타종목).
3. **단계 배지 보수 판정** — LLM 이 주장한 stage 를 코드 정규식으로 클램프.
   HERE_WE_GO 는 "here we go" 원문구 있을 때만, OFFICIAL 은 구단 공식(tag 오피셜)
   또는 명시적 완료 문구만. 강한 주장(HERE_WE_GO·OFFICIAL)은 sonnet 검증 1회 —
   선수·방향·단계가 헤드라인과 안 맞으면 드롭.
4. **오보 원클릭 숨김** — /api/admin/rumor-hide (hidden 플래그, 브리핑과 동일 패턴).

## 파이프라인 (통합)

```
runNewsBriefing (2h cron, 기존)
  ├─ RSS 수집·dedup·분류 (기존)
  ├─ 브리핑 후보 → 재작성 → 검증 → 발행 (기존)
  └─ [신규] category=TRANSFER 항목 + rumorOnly 소스(풋볼리스트, KO 키워드 필터)
       → haiku 딜 추출 (선수·팀·단계·이적료·한 줄 요약, desc 포함)
       → 노이즈 가드 → 이름 호환 딜 병합(8ae70d9) → stage 정규식 클램프
       → HERE_WE_GO/OFFICIAL 만 sonnet 검증 → TransferRumor upsert (강등 금지)
```

## 비용

haiku 추출 런당 1회(TRANSFER 항목만) + sonnet 검증은 강한 주장 소수 건.
월 +$2~3 예상.
