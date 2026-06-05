// TheSports baseball stat_id 매핑 + 박스스코어/팀 stats 추출 헬퍼.
// 매핑은 production cache (KBO/NPB/MLB 합 100+ 매치) 의 값 분포 + 검증된 KBO
// 매치 결과 비교로 도출. 확정 안 된 id 는 라벨 없이 hide.

// TEAM stats — phase 0 (전체) 의 [stat_id, away, home] 튜플.
export interface TeamStatRow {
  statId: number;
  label: string;
  away: number;
  home: number;
  /** true 면 소수 (타율 등) → 소수점 3자리, false 면 정수. */
  decimal: boolean;
}

// stat_id 매핑은 2026-05-25 KBO/NPB/MLB 28 매치 cache 와 statsapi.mlb.com
// boxscore cross-check 로 확정.
//   601 = H (안타) — cache vs API hits 13/17 match (나머지는 cache stale)
//   602 = E (실책) — fielding errors 14/17 match
//   603 = 2B (2루타) — MLB only, 13/17 match
//   604 = 3B (3루타) — MLB only, 16/17 match
//   605 = HR (홈런) — 13/17 match
//   606 = RBI (타점) — 13/17 match (R 와 종종 1점 차이로 구분됨)
//   608 = BB (볼넷) — 13/17 match
//   609 = SO (삼진) — 13/17 match
//   610 = SB (도루) — 14/17 match
//   611 = AB (타석) — 13/17 match
//   612 = AVG (타율) — 28/28 H/AB 산식 일치
// 607 = LOB (Left on base, 잔루) — 2026-06-05 TheSports 공식 코드표로 확정
//   (기존 "미확정 0/17" → 라벨 확정). 단 cache 값이 0 빈번이라 TEAM_STAT_ORDER 엔
//   미포함(표시 보류). 공식 팀 Batters: 601=H 603=2B 604=3B 605=HR 606=RBI
//   607=LOB 608=BB 609=SO 610=SB 611=AB 612=AVG 652=TB 653=OBP 654=SLG 655=OPS 677=R.
const TEAM_STAT_LABEL: Record<number, { label: string; decimal: boolean }> = {
  601: { label: "안타 (H)", decimal: false },
  602: { label: "실책 (E)", decimal: false },
  603: { label: "2루타", decimal: false },
  604: { label: "3루타", decimal: false },
  605: { label: "홈런 (HR)", decimal: false },
  606: { label: "타점 (RBI)", decimal: false },
  607: { label: "잔루 (LOB)", decimal: false }, // 공식 확정, cache 값 0 빈번 → ORDER 미포함
  608: { label: "볼넷 (BB)", decimal: false },
  609: { label: "삼진 (SO)", decimal: false },
  610: { label: "도루 (SB)", decimal: false },
  611: { label: "타석 (AB)", decimal: false },
  612: { label: "타율 (AVG)", decimal: true },
};

// 박스스코어 일반 순서 (KBO/네이버 스타일): AB, H, HR, RBI, BB, SO, SB, 2B, 3B, E, AVG
const TEAM_STAT_ORDER = [611, 601, 605, 606, 608, 609, 610, 603, 604, 602, 612];

/**
 * detail_live.stats (array of [phase, [[stat_id, home, away], ...]]) 에서
 * phase 0 의 라벨링된 행만 추출.
 *
 * row 순서 = [stat_id, home, away] (2026-05-25 statsapi.mlb.com boxscore 와
 * 17 MLB 매치 cross-check 로 확정. row[1] = home, row[2] = away).
 */
export function extractTeamStats(stats: unknown): TeamStatRow[] {
  if (!Array.isArray(stats)) return [];
  const phase0 = stats.find(
    (s) => Array.isArray(s) && s[0] === 0 && Array.isArray(s[1]),
  );
  if (!phase0) return [];
  const rowsById = new Map<number, [number, number]>();
  for (const row of phase0[1] as unknown[]) {
    if (!Array.isArray(row) || row.length < 3) continue;
    const [id, home, away] = row;
    if (typeof id === "number") {
      rowsById.set(id, [Number(home), Number(away)]);
    }
  }
  const out: TeamStatRow[] = [];
  for (const id of TEAM_STAT_ORDER) {
    const v = rowsById.get(id);
    const meta = TEAM_STAT_LABEL[id];
    if (!v || !meta) continue;
    out.push({ statId: id, label: meta.label, home: v[0], away: v[1], decimal: meta.decimal });
  }
  return out;
}

// PLAYER stats — detail_live.players.{home,away}: [{ id, stats: [[stat_id, val], ...] }]
// 공식 매핑 (TheSports baseball Player Statistics 코드표, 2026-06-05 확정):
//   타자: 613=Position(포지션코드 1~14·stat 아님) 614=AB 615=R 616=H 617=RBI
//         618=AVG 619=2B 620=3B 621=HR 622=GIDP 627=TB 650=SO 651=BB
//         681=OBP 682=SLG 683=OPS / 주루 628=SB 629=CS 630=PickedOff
//         수비 631=PB 632=E 633=A
//   투수: 634=IP 635=H 636=ER 637=BB 638=SO 639=ERA 640=Pitches 641=Strikes
//         644=BF 645=WP 646=HBP 647=IBB 648=HRAllowed 649=RAllowed 702=K/9 705=WHIP
// ⚠️ 기존 613=AB·614=PA 는 추정 오매핑이었음 → 정정(613=Position 이라 stat 컬럼 제외, 614=AB).
// 현재 cache 에 선수 stat 유입이 희소(실측 0/40·메모리 1/50)해 핵심만 라벨링.
// 데이터 유입 확인되면 위 공식 매핑으로 타자/투수 컬럼 확장(빈 컬럼 방지 위해 보류).
// KBO/NPB cache 에 타자 613~633·투수 634~649 풀 유입 확인 (2026-06-05 실측, MLB 는 미유입).
// playerStatColumns 가 key 오름차순으로 컬럼 표시 → 타자 AB R H RBI HR SO BB / 투수 IP H ER BB SO.
// 단일경기 cache 에 0 으로만 오는 누적성 stat(618 AVG·639 ERA·640 P)은 제외.
const PLAYER_STAT_LABEL: Record<number, { label: string; decimal: boolean; type: "batter" | "pitcher" | "both" }> = {
  // 타자
  614: { label: "AB", decimal: false, type: "batter" }, // 타수
  615: { label: "R", decimal: false, type: "batter" }, // 득점
  616: { label: "H", decimal: false, type: "batter" }, // 안타
  617: { label: "RBI", decimal: false, type: "batter" }, // 타점
  621: { label: "HR", decimal: false, type: "batter" }, // 홈런
  650: { label: "SO", decimal: false, type: "batter" }, // 삼진
  651: { label: "BB", decimal: false, type: "batter" }, // 볼넷
  // 투수
  634: { label: "IP", decimal: false, type: "pitcher" }, // 이닝 (8.2=8⅔ 표기 위해 정수문자열 유지)
  635: { label: "H", decimal: false, type: "pitcher" }, // 피안타
  636: { label: "ER", decimal: false, type: "pitcher" }, // 자책
  637: { label: "BB", decimal: false, type: "pitcher" }, // 볼넷
  638: { label: "SO", decimal: false, type: "pitcher" }, // 삼진
};

// 타자 포지션 코드 (stat_id 613) — TheSports 공식. 박스스코어 타자 이름 옆 표기.
export const BASEBALL_POSITION: Record<number, string> = {
  1: "DH", 2: "C", 3: "1B", 4: "2B", 5: "3B", 6: "CF", 7: "LF", 8: "RF",
  9: "SS", 10: "PH", 11: "PR", 12: "SP", 13: "RP", 14: "P",
};

/** stat_id 613(포지션 코드) → 약칭. 없으면 빈 문자열. */
export function baseballPositionLabel(code: number | undefined): string {
  return code != null ? (BASEBALL_POSITION[code] ?? "") : "";
}

export interface PlayerStatRow {
  playerId: string;
  /** 타자/투수 분류 — pitcher stat (634 등) 있으면 pitcher. */
  role: "batter" | "pitcher";
  stats: Record<number, number>; // 모든 stat_id 보존 (라벨링 안 된 것도 포함)
}

interface RawPlayer {
  id?: string;
  stats?: Array<[number, number]>;
}

/**
 * detail_live.players → home/away 별 PlayerStatRow[].
 */
export function extractPlayerStats(
  players: unknown,
): { home: PlayerStatRow[]; away: PlayerStatRow[] } {
  const out = { home: [] as PlayerStatRow[], away: [] as PlayerStatRow[] };
  if (!players || typeof players !== "object") return out;
  for (const side of ["home", "away"] as const) {
    const arr = (players as Record<string, unknown>)[side];
    if (!Array.isArray(arr)) continue;
    for (const raw of arr as RawPlayer[]) {
      if (!raw?.id || !Array.isArray(raw.stats)) continue;
      const map: Record<number, number> = {};
      let isPitcher = false;
      for (const tuple of raw.stats) {
        if (!Array.isArray(tuple) || tuple.length < 2) continue;
        const [id, v] = tuple;
        if (typeof id !== "number") continue;
        map[id] = Number(v);
        // 634 (IP) 또는 640 (pitch count) 있으면 투수로 분류
        if ((id === 634 || id === 640) && Number(v) > 0) isPitcher = true;
      }
      out[side].push({
        playerId: String(raw.id),
        role: isPitcher ? "pitcher" : "batter",
        stats: map,
      });
    }
  }
  return out;
}

export interface PlayerStatLabel {
  statId: number;
  label: string;
  decimal: boolean;
}

/**
 * 박스스코어 카드용 — role 별 라벨링된 stat 컬럼 정의 반환.
 */
export function playerStatColumns(role: "batter" | "pitcher"): PlayerStatLabel[] {
  const out: PlayerStatLabel[] = [];
  for (const [idStr, meta] of Object.entries(PLAYER_STAT_LABEL)) {
    if (meta.type === role || meta.type === "both") {
      out.push({ statId: parseInt(idStr, 10), label: meta.label, decimal: meta.decimal });
    }
  }
  return out;
}
