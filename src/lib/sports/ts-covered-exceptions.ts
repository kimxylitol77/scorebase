// TS_COVERED 분류지만 af 수집을 유지하는 리그 집합 — collect(수집 skip 판단)와
// cleanup-stale-scheduled(등록 후보 경고)가 같은 정본을 보도록 공용화 (2026-08-16).
import type { League } from "@/lib/sports/types";

// TS_COVERED 분류지만 실제로는 ts collector 가 매치를 안 만드는 리그 — af 수집 유지.
// K_LEAGUE_1 (2026-06-10): ts- 매치 0건인데 skip 돼 미래 일정 공백 → 경기 당일에야
// af 매치 생성 → PREVIEW(3일 전)·predict 전무 → 리그 페이지 적중률 0건이던 원인.
// PREVIEW_LEAGUES 인데 일정 공백이 생기면 여기 추가.
//
// ⚠️ IIHF_WC 는 이 방식으로 못 고친다 (2026-06-10 진단): 아이스하키라 TS_COVERED(축구
// 매핑) 분류 밖 + af collector·ALL_LEAGUES 미등록이라 여기 넣어도 무효. 매치 소스는
// ts ice_hockey worker 인데 당일/사후 수집만 해 2026 대회 30경기가 미래 리드타임 0
// → predict 4건·채점 0. 2027 대회(5월) 전에 ts worker 의 미래 일정 커버를 점검할 것.
//
// YKKONEN·LATVIA_VL (2026-06-13): af 소스 매치인데 ts 매치↔af row 연결이 거의 실패
// (최근 30일 cache 연결 4%·48%) → af 수집까지 skip 되면 결과 갱신 경로가 전무, 매 경기일
// stale SCHEDULED → cleanup verify 가 6h 후 뒷수습하는 패턴 반복 (6/12~13 알림 5건).
// 같은 증상 후보: ESTONIA_ML·LITHUANIA_AL·GEORGIA_EL·SINGAPORE_PL — 알림 재발 시 추가.
// ESTONIA_ML·GEORGIA_EL (2026-08-09): 위 후보 중 둘이 재발 확정. 5/24 에 af 로 받아온 시즌
// 일정(각 177·176건)이 마지막이고 이후 ts- 매치는 0건 — af skip 이라 연기가 나도 startTime 을
// 못 따라가 매 경기일 stale SCHEDULED → cleanup 이 6h 뒤 뒷수습하던 것. af 수집 재개.
// (LITHUANIA_AL 은 ts- 28/28 로 실커버리지 정상, SINGAPORE_PL 은 매치 자체가 0 → 제외.)
//
// BELARUS_PL·KAZAKHSTAN_PL (2026-06-14): 같은 패턴 재발. cleanup-stale-scheduled 알림에서
// 3경기(#316277·#316278·#316807)가 startTime 동결(6/13→6/14 연기 누락)로 발견 — 매치의
// 96%+ 가 af 생성(BELARUS 238/247·KAZAKHSTAN 240/241, ts 는 9·1건뿐)인데 TS_COVERED 로
// af 수집이 skip 돼 5/25 이후 갱신 경로 전무. ts 워커가 실커버리지를 못 채우므로 af 수집 유지.
// ECUADOR_LP (2026-07-09): 동일 패턴. stale-cleanup 알림 8경기가 startTime 동결
// (07-05→07-10~12 연기 누락)로 발견 — ts 부분커버(29/251)라 ts 미생성 매치는 af skip 으로
// 갱신 경로 없음. api-football verify 결과 전부 NS(미래) = false positive 였으나 근본 = af 재개.
// SLOVAKIA_SL·MOLDOVA_SL·SLOVENIA_SNL·SERBIA_SL·PARAGUAY_PD (2026-08-01): 시즌 롤오버 후
// ts collector 가 새 시즌 매치를 안 만들어 수집 정지/부실 (슬로바키아 5/16·몰도바 5/27 이후 0건,
// 슬로베니아·파라과이 3주간 1건, 세르비아 5건). af 엔 새 시즌 fixture 전부 있음(7/15~8/10 실측
// 16~20경기) — 7m 대조 감사에서 발견. af 수집 재개.
// VEIKKAUSLIIGA (2026-08-02): 30일 매치 24건 전부 af 생성·ts 0건 — 2부 YKKONEN 은 예외
// 등록돼 있었는데 1부가 빠져 af skip → 오울루전 등 stale SCHEDULED 반복. af 수집 재개.
// HNL (2026-08-16): 2026-27 개막(7/31) 후 매치 0건 — 순위표 전수 감사에서 발견. 원인은
// TS_FOOTBALL_COMPETITION_ID 에 HNL 이 없어 ts collector 가 애초에 매치를 안 만드는데
// tsSeasonId 만 있어 TS_COVERED 로 af 까지 skip 된 것(매치 180건 전부 af 생성·마지막 5/23).
// af 엔 새 시즌 fixture 정상(7/31~9/1 실측 25경기). ⚠️ 함께 고친 것 — tsId/tsSeasonId 가
// 2부(Prva NL, 16팀)를 가리켜 순위표도 2부 표였다. 1부(gx7lm7phjem2wdk)로 교체했으나
// ts 매치 매핑은 여전히 없으므로 id 는 순위표 전용, 매치 소스는 af 를 계속 쓴다.
// CYPRUS_1D (2026-08-16): 위 HNL 진단에서 같은 클래스를 전수 스캔해 발견 — TS_COVERED 인데
// ts collector 매핑이 없는 리그 51개 중, af 에 새 시즌 fixture 가 있으면서 DB 30일 0건인 케이스.
// 키프로스는 리그 id 자체는 정상(순위표 1부 14팀 확인)이고 8/29 개막이라 아직 안 죽어 보이지만,
// af skip 이 유지되면 개막해도 HNL 과 똑같이 0건이 된다(af 실측 8/29~ 14경기). 선제 등록.
// ⚠️ 같은 스캔에서 THAI_L1·UEFA_WCL 도 af 엔 fixture 가 있는데 DB 0건이었다(각 5·80경기).
// 둘은 collect 의 ALL_LEAGUES 에 아예 없어 여기 넣어도 무효 — 수집 대상 등록이 선행돼야 한다.
export const TS_COVERED_EXCEPTIONS = new Set<League>([
  "K_LEAGUE_1", "YKKONEN", "LATVIA_VL", "BELARUS_PL", "KAZAKHSTAN_PL",
  "ECUADOR_LP",
  "SLOVAKIA_SL", "MOLDOVA_SL", "SLOVENIA_SNL", "SERBIA_SL", "PARAGUAY_PD",
  "VEIKKAUSLIIGA", "ESTONIA_ML", "GEORGIA_EL", "HNL", "CYPRUS_1D",
  // 2026-08-08 시즌 id 재발굴로 tsSeasonId 가 새로 붙은 2부·컵 — 매치는 지금까지 전부
  // af 생성이라 ts 로 소스를 옮기지 않는다(K리그1 사고와 같은 공백 방지). id 는 순위표 전용.
  "AUSTRIA_2", "CZECH_2", "DENMARK_2", "HUNGARY_2", "IRELAND_2", "SCO_LEAGUE_CUP",
  // 컵 대회 (2026-08-09) — 대진표에 필요한 라운드가 af 에만 있다. af 는 fixture.league.round 로
  // "Round of 16"·"Quarter-finals" 를 주지만, ts 는 컵에 round_num=0 만 주고 그 stage_id 가
  // stage/list 4만 건 사전에도 없어 라운드를 특정할 수 없다(실측). 이미 예외였던
  // SCO_LEAGUE_CUP 만 라운드가 채워지고 있던 것이 근거.
  "FA_CUP", "EFL_CUP", "COPA_DEL_REY", "COPPA_ITALIA", "DFB_POKAL", "COUPE_DE_FRANCE",
  "EMPEROR_CUP", "CONCACAF_CCUP", "AFC_CUP", "LEVAIN_CUP", "SUI_CUP", "SVENSKA_CUPEN",
  "COPA_DO_BRASIL",
  // J2_LEAGUE (2026-08-09): 새 시즌 순위를 살리려고 tsSeasonId 를 붙였는데, 그러면
  // TS_COVERED 로 분류돼 af 매치 수집이 끊긴다. J2 매치는 지금까지 전부 af 생성(종료 350건)
  // 이라 소스를 옮기면 공백이 생긴다 — 위 2부·컵과 같이 id 는 순위표 전용으로만 쓴다.
  "J2_LEAGUE",
]);
