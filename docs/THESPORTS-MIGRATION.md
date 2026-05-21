# TheSports 메인 source 전환 재설계

> 작성: 2026-05-21
> 결정 시점: TheSports 정식 결제 결정 (~2026-06-01, D-10)
> 작성 이유: "비싼 TheSports 가 보조이고 싼 api-football 이 메인인 이유?"

## 1. 현재 데이터 흐름 (as-is)

### 1.1 Match row (DB primary)
```
api-football (메인) ──┐
                      ├──► prisma.match (externalId=숫자)
ESPN (NBA/NHL/MLB) ──┤    + Team upsert
TheSports (SKIP 외) ──┘
```

86개 리그를 `buildApiFootballCollector(...)` 로 처리. TheSports football match collector 는 SKIP_LEAGUES (메이저 + 컵 + 양 collector 중복 리그) 제외하고 minor 리그 (56) 만 push.

### 1.2 보강 데이터 (TheSports cache)
```
TheSports ──► TheSportsMatchCache (matchId FK)
              ├─ detailLive (incidents, tlive, stats)
              ├─ lineup (formation, x/y, players)
              ├─ analysis (H2H, goal distribution)
              ├─ teamStats (named: shots/passes/...)
              └─ playerStats (boxscore)
```

라이브 페이지 (`/live/[league]/[gameId]`) 에서 `theSportsCache` 가 있으면 풍부 데이터 렌더 (SoccerLineupSvg, SoccerH2HCard, SoccerLiveStatsCard 등).

### 1.3 standings 캐시
```
TheSports season/recent/table/detail
   ├──► TheSportsStandingsCache (league PK, 4h TTL)
   └──► /standings/[league] 1차 source (api-football 2차 fallback)
```

78 축구 리그 — 자체 calcStandings 보다 정확 (오프시즌·중단 상태 정확 반영).

### 1.4 결제 현황
- TheSports: trial 무료 (~2026-06-01 종료)
- 정식 가격: **$1,170/월** (Soccer Basic + Baseball Basic)
- api-football: **$39/월** (Ultra, 75K req/일)
- TheSports IP whitelist: macOS (`27.74.132.49`) + AWS Lightsail (`15.164.60.238`)

## 2. 두 API 비교 (객관 항목)

| 항목 | api-football ($39) | TheSports ($1,170, trial) |
|---|---|---|
| 리그 수 | 1,100+ | 1,970+ (한국어 100%, 영문 86%) |
| 라이브 latency | 10-30초 | **2-5초** |
| 한국어 응답 | ❌ (영문, 우리가 매핑) | ✅ `language/list?type=4` |
| Match metadata | 풍부 | 더 풍부 (incidents/tlive 1분당) |
| Lineup (formation x/y) | ✅ | ✅ 더 정확 (좌표 + rating) |
| H2H | ✅ | ✅ 더 깊음 (history.vs) |
| Player boxscore | ✅ (한정) | ✅ 풍부 (stat_type 다양) |
| Injury list | ✅ `/sidelined` | ❌ injury 0% (영문만, 우리 plan 미포함) |
| Standings | ✅ | ✅ **promotions/relegation 색상까지** |
| Goal distribution | ❌ | ✅ 15분 단위 막대 |
| KBO/NPB pitch-by-pitch | ❌ | ✅ 2-5초 (baseball/detail_live) |
| 우리 plan 미커버 endpoint | n/a | basketball stats 401 (add-on 비용 영업 문의) |

### 결론: TheSports 의 진짜 가치
- **라이브 페이지** — latency + 풍부도
- **standings** — 더 정확 (오프시즌 인식)
- **KBO/NPB 야구** — 미국 ESPN/api-sports 미커버 부분

api-football 의 진짜 가치:
- **부상자** (TheSports injury 미커버)
- **odds/predictions** (TheSports 미제공)
- **레퍼토리 안정성** (오랜 운영 검증)

## 3. SKIP_LEAGUES 설계 정당화 (현재)

### 3.1 왜 SKIP 됐나
1. api-football 이미 운영 중 (오랜 검증)
2. TheSports trial 2026-05-18 시작 — **불과 3일된 source**
3. 같은 매치 양쪽 수집 → /scores 중복 노출 버그
4. 안전책: 신규 source 양보 (SKIP_LEAGUES)

### 3.2 trial 종료 시나리오별 영향

**시나리오 A — 정식 결제 진행**:
- 현재 SKIP 설계는 ACL 처럼 매몰비용 ↓ (보강만 활용 중)
- 메인 전환하려면 마이그 작업 필요

**시나리오 B — 결제 보류/취소**:
- TheSports endpoint 모두 차단됨
- 영향: `theSportsCache`/`theSportsStandingsCache` 데이터 점진 stale
- 라이브 페이지 cache 의존 컴포넌트 → fallback (api-football)
- /standings → fallback (calcStandings 자체)
- **Match row 영향 0** (SKIP 덕분에 api-football 만 사용 중)

→ 시나리오 B에서 안전. 현재 설계 디자인 의도 적중.

## 4. 마이그레이션 옵션

### 옵션 A — 현재 유지 (변화 없음)
```
[변화] 없음
[작업] 없음
[위험] 0
[가치] TheSports 결제 비용 대비 활용도 낮음 (보강만)
```

### 옵션 B — TheSports 메인 전환 (전면)
```
변경:
- collector 전환: SKIP_LEAGUES 제거, TheSports 가 매치 row push
- externalId 형식: 숫자 → "ts:xxxx"
- API_FOOTBALL_LEAGUE_ID 매핑 → 보조 (TheSports 미커버 시 fallback)
- 기존 article.matchId → 새 ID 로 마이그레이션
- /api/live/scores fetchAllLiveScores 재구성

영향 받는 코드:
- src/lib/sports/index.ts (collectors map)
- src/lib/sports/api-football-collector.ts → 보조 역할
- src/jobs/collect.ts (라우팅)
- lightsail-worker/football-match-collector.js (SKIP_LEAGUES 제거)
- 모든 /live/* 페이지 (gameId = ts:xxx)
- article matchId migration

작업 추정: L (1-2주)
위험: 높음 (기존 article 깨질 수 있음, externalId 변경)
가치: TheSports 풍부 데이터 100% 활용, latency ↓
```

### 옵션 C — 하이브리드 (리그별 우선)
```
정책: 리그별로 더 풍부한 source 가 메인
- TheSports 메인: minor 리그 56 + 인기 축구 리그 (lineup/H2H 풍부)
- api-football 메인: 메이저 6 + odds/injury 가 중요한 리그

리그별 결정 매트릭스 → 섹션 5 참고

작업 추정: M-L (1주)
위험: 중 (로직 복잡, 리그 추가 시 매번 결정 필요)
가치: 베스트 데이터 조합
```

### 옵션 D — 단계적 전환 (실험 → 확대)
```
Phase 1: 1-2 리그 (예: GREEK_SL, POLAND_1L) TheSports 메인 전환 - 1주 실험
Phase 2: 검증 성공 시 추가 5-10 리그
Phase 3: 메이저 리그 전환 검토

장점: 위험 최소, 단계적 검증
단점: 시간 듦
작업: M (3-4 PR)
```

## 5. 리그별 source 추천 매트릭스

### 5.1 메이저 (api-football 메인 유지 권장)
- **이유**: odds/predictions/injury 가 핵심 가치. TheSports 보강이면 충분.

| 리그 | 현재 | 추천 | 비고 |
|---|---|---|---|
| EPL | api-football | api-football | odds + 부상자 중요 |
| LALIGA | api-football | api-football | 동일 |
| BUNDESLIGA | api-football | api-football | |
| SERIE_A | api-football | api-football | |
| LIGUE_1 | api-football | api-football | |
| MLS | api-football | api-football | |
| UCL/UEL/UECL | api-football | api-football | 컵 대회, 부상자 ↑ |

### 5.2 아시아 (TheSports 메인 후보 — 한국어 cover + KBO/NPB 야구)
| 리그 | 현재 | 추천 | 비고 |
|---|---|---|---|
| K_LEAGUE_1 | api-football | **TheSports** | 한국어 endpoint 100%, latency ↓ |
| K_LEAGUE_2 | api-football | api-football | TheSports 매핑 검증 후 |
| J1_LEAGUE | api-football | api-football | 둘 다 OK, 안정성 우선 |
| AFC_CL | api-football | api-football | 컵, 부상자 ↑ |
| KBO | api-sports baseball | **TheSports** | pitch box 2-5초 latency = 가장 큰 가치 |
| NPB | api-sports baseball | **TheSports** | 동일 |
| MLB | ESPN/api-sports | api-sports | TheSports baseball 미커버 |

### 5.3 마이너 (TheSports cover, api-football 부족)
| 리그 | 현재 | 추천 |
|---|---|---|
| GREEK_SL, SUPERETTAN, POLAND_1L, ALLSVENSKAN | api-football | **TheSports** |
| 50+ minor 유럽/아시아 리그 (현재 TheSports collector cover) | TheSports | TheSports 유지 |
| INDIA_ISL | api-football | TheSports (메모리: cover 풍부) |

### 5.4 미국 (ESPN 우선)
- NBA/NHL — ESPN 안정. api-sports v2 NBA 도 검증됨.
- WNBA — api-sports basketball v1 (이번 추가).
- TheSports 미국 농구 미커버.

## 6. 위험 분석

### 6.1 결제 후 옵션 B 시 위험
- ❌ externalId 변경 → article matchId 끊김 (마이그 필요)
- ❌ 라이브 폴링 endpoint URL 변경 (ts:xxx로)
- ❌ /scores hash/etag 캐싱 깨질 수 있음
- ⚠️ TheSports rate limit (?? — 영업 문의 필요)
- ⚠️ TheSports 가 일시 다운 시 fallback 없음 → api-football 보조 유지 권장

### 6.2 옵션 C (하이브리드) 위험
- 코드 복잡도 증가 — 리그별 source 결정 로직
- 신규 리그 추가 시 매번 source 결정 필요
- 디버깅 어려움 (어디서 왔는지 추적)

### 6.3 옵션 D (단계적) — 가장 낮은 위험
- 1-2 리그 실험 → 안정성 검증
- 검증 실패 시 즉시 롤백
- 학습한 패턴으로 점진 확대

## 7. 추천 — 옵션 D (단계적 전환)

### 7.1 Phase 1 — 실험 (TheSports 결제 후 1주)
```
대상: GREEK_SL + POLAND_1L (1-2 리그)
작업:
1. SKIP_LEAGUES 에서 제거
2. api-football collector 에서 제외
3. TheSports football match collector 가 메인 push
4. externalId = ts:xxx 마이그레이션 스크립트 (1회)
5. 1주 운영 모니터링
검증: 매치 누락 0, 스코어 정확도, 라이브 페이지 풍부도
```

### 7.2 Phase 2 — KBO/NPB 야구 전환 (1주)
```
대상: KBO + NPB (메모리에 가장 큰 가치)
작업:
1. baseball-poller.js 메인으로 (현재는 cache 보강만)
2. api-sports baseball 보조로
3. ESPN 폐기 검토 (이미 우리가 api-sports 위주)
검증: pitch box 2-5초 latency 실측
```

### 7.3 Phase 3 — 확대 (필요 시)
```
대상: 검증 성공 리그 추가
시간: 매월 검토 + 점진 적용
완료 기준: TheSports 활용도 80%+ 또는 api-football 다운그레이드 가능
```

## 8. api-football 비용 최적화 (덤)

만약 TheSports 가 80%+ cover 하면:
- api-football Ultra ($39) → Pro 50K ($30)
- 또는 부상자/odds 만 쓰는 경량 plan

장기 비용 = TheSports + api-football 보조 = $1,170 + $30 = $1,200/월

vs 현재 = $39 + $1,170 trial = trial 끝나면 $39 만

→ 결제 결정 = 월 $1,131 증가. 이 비용에 대응하는 가치 = 라이브 latency + 한국어 + 1970 리그.

## 9. 결정 매트릭스 (사용자가 채울 것)

| 항목 | 가중치 | 점수 (1-5) |
|---|---|---|
| 라이브 latency (2-5초) | 높음 | ? |
| KBO/NPB pitch box | 매우 높음 | ? |
| 1970 리그 (스케일) | 중 | ? |
| 한국어 endpoint (편의) | 중 | ? |
| 월 $1,131 비용 | 매우 높음 | ? |
| 마이그 작업 (1-2주) | 높음 | ? |

총점 ≥ 18 → 결제 + 옵션 D 진행 추천
총점 12-17 → 옵션 A 유지 (보강만)
총점 < 12 → 결제 보류

## 10. 다음 액션 (사용자 결정 의존)

### 시나리오 A — 결제 진행 결정 (6/1)
- [ ] Phase 1 시작: GREEK_SL/POLAND_1L SKIP 해제 + TheSports 메인 PR
- [ ] externalId 마이그레이션 스크립트 작성
- [ ] 1주 모니터링 + 검증

### 시나리오 B — 결제 보류
- [ ] 현재 SKIP_LEAGUES 유지
- [ ] theSportsCache/standingsCache 의존 코드 fallback 강화
- [ ] api-football 단독 운영 검증

### 어느 시나리오든 즉시 할 것
- [x] 이 문서 작성 ✅
- [ ] 사용자 결제 결정
- [ ] 5/31 까지 결정 마감 알람

---

## 부록 A — 메모리 참조
- `project_thesports_trial.md` — trial 진행 상황
- `feedback_apifootball_season.md` — api-football 시즌 분기
- `feedback_id_systems.md` — externalId 시스템 차이
- `ROADMAP.md` — 이번주 TheSports 영업 이메일 D-10

## 부록 B — 결제 결정 트리거 (메모리 기준)
| 결과 | 액션 |
|------|------|
| KBO latency 2-5초 검증 + 한국어 endpoint 활성화 약속 | ✅ 정식 결제 진행 |
| latency 5초+ 또는 한국어 약속 모호 | 협상 또는 보류 |

상태: ✅ latency 확인됨, ✅ 한국어 결제 완료 → **현재 정식 결제 트리거 조건 충족**
