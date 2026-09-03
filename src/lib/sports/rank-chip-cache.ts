// /scores 매치 카드의 [순위] 칩 중 "시즌 전체 경기로 직접 계산"하는 리그와 그 캐시 태그.
//
// 이 리그들은 ts/af 순위표가 아니라 우리 DB 의 시즌 FINISHED 매치를 다 읽어 순위를 계산한다
// (MLB 만 2천 경기+). 매 요청 계산은 느려서 unstable_cache 10분으로 묶여 있는데, 순위는
// 경기가 "끝날 때"만 바뀌므로 종료 순간에 태그를 비워 즉시 반영시킨다.
//
// 태그를 따로 둔 이유. 기존 "live-scores" 태그에는 성격이 다른 캐시 25개가 묶여 있고
// 그중 넷은 외부 API(BDL·F1) 호출이다. 점수가 바뀔 때마다 그걸 통째로 비우면 외부 호출이
// 튀고(af 쿼터 소진 전례), 10분·1시간짜리 캐시가 사실상 사라져 병렬화 이득도 없어진다.
//
// ⚠ 리그를 추가하면 /scores 의 소비처와 쓰기 경로(thesports-cache route)가 같이 움직여야 한다.
export const RANK_CHIP_TAG = "rank-chip";

/** 시즌 매치 직접 계산으로 순위칩을 만드는 리그 (KBO·NPB 는 ts 순위표라 여기 없음). */
export const RANK_CHIP_CALC_LEAGUES = new Set(["MLB", "CPBL", "LMB", "NBA", "WNBA"]);
