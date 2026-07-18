# 선발 FIP·LOB% — 컨텍스트 노트

## 설계 결정

- **FIP 상수는 리그별 고정값** (KBO 3.7 · NPB 2.9 · MLB 3.15). 정석은 리그 전체 투수 합산으로
  시즌마다 유도하는 것이지만, 그러려면 리그 전 투수 스탯 스크랩이 필요해 과함. 비교바의 목적은
  두 선발의 상대 비교라 상수는 상쇄됨. 절대값은 근사치임을 코드 주석에 명시.
- **계산 위치 = enrich 단계** (kbo-starters/npb-starters/mlb-stats-api). 원시 성분(HBP·R 등)을
  StarterJson 까지 끌고 가지 않고 fip·lobPct 결과값만 JSON 에 저장 — JSON 슬림 유지.
- **KBO HBP**: koreabaseball.com PitcherDetail 테이블에 HBP 컬럼 존재(파일 헤더 주석 기준).
  혹시 없으면 calcFip 가 hbp=0 근사로 계산 (FIP 살짝 과소, 비교 목적엔 무해).
- **LOB% 공식**: (H+BB+HBP−R) / (H+BB+HBP−1.4·HR), 0~1 클램프 후 % 표기. 높을수록 좋음
  (StarterStatBar betterLow=false).
- **프롬프트 교정 동반**: 기존 프롬프트가 FIP 언급을 요구하면서 값을 안 줘서 환각 위험.
  fmt 에 FIP·LOB% 주입 + "제공값만 사용, 미제공 시 생략" 지시로 교정.
- **MLB 도 포함**: 요청은 KBO 지만 StarterCard·프롬프트가 3개 리그 공용이고, MLB 만 빼면
  프롬프트의 FIP 요구가 MLB 에서 계속 환각으로 남음. statsapi 성분 추출 몇 줄이라 포함.
- **jsonEq 미수정**: 변경 감지는 era/whip/name/pid 로 충분 — fip 는 era 와 함께 움직임.

## 진행 로그
- 2026-07-18 작업 시작. 탐색으로 수정 지점 9곳 확정.
