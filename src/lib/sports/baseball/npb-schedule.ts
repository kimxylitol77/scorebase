// npb.jp 월별 일정(schedule_MM_detail.html) 파싱 — NPB 포스트시즌(CS·일본시리즈) 대진표 재료. 우리 Match 에는 NPB 가을 경기가 없다.
//   셀 구조: <tr id="dateMMDD"> … team1(홈)·[<a href="/scores/Y/MMDD/home-away-NN/"> score1 · score2 | 中止 </a>]·team2 … time.
//   미개최 경기는 링크가 없다. 경로 끝 NN 은 그 시즌 두 팀 맞대결 번호 — 9/20 이후 정규시즌은 20번대라
//   7 이하면 가을 경기(CS·일본시리즈): 2021~2025 다섯 시즌 모두 실제 경기 수와 일치(2026-09-26 실측).

export interface NpbSchedGame {
  mmdd: string;
  homeJp: string;
  awayJp: string;
  path: string | null;
  /** 맞대결 번호(경로 끝) */
  meet: number | null;
  homeScore: number | null;
  awayScore: number | null;
  cancelled: boolean;
  /** "18:00" — 없으면 null */
  time: string | null;
}

/** npb.jp 일정 표기 → 우리 Team id (DB 2026-09-26 실측) */
export const NPB_JP_TEAM_ID: Record<string, number> = {
  巨人: 23331, 阪神: 23330, DeNA: 23333, 広島: 23332, 中日: 23334, ヤクルト: 23329,
  ソフトバンク: 23339, 日本ハム: 23338, ロッテ: 23337, オリックス: 23336, 楽天: 23335, 西武: 23340,
};
/** 카드 폭에 맞춘 한글 약칭 */
export const NPB_SHORT_KO: Record<number, string> = {
  23331: "요미우리", 23330: "한신", 23333: "DeNA", 23332: "히로시마", 23334: "주니치", 23329: "야쿠르트",
  23339: "소프트뱅크", 23338: "닛폰햄", 23337: "롯데", 23336: "오릭스", 23335: "라쿠텐", 23340: "세이부",
};

const num = (s: string | undefined) => {
  const n = parseInt((s ?? "").trim(), 10);
  return Number.isFinite(n) ? n : null;
};

export function parseNpbSchedule(html: string): NpbSchedGame[] {
  const out: NpbSchedGame[] = [];
  for (const m of html.matchAll(/<tr id="date(\d{4})"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const [, mmdd, body] = m;
    const homeJp = /<div class="team1">([^<]*)</.exec(body)?.[1]?.trim();
    const awayJp = /<div class="team2">([^<]*)</.exec(body)?.[1]?.trim();
    if (!homeJp || !awayJp) continue;
    const path = /href="(\/scores\/\d{4}\/\d{4}\/[a-z]+-[a-z]+-(\d+)\/)"/.exec(body);
    out.push({
      mmdd,
      homeJp,
      awayJp,
      path: path?.[1] ?? null,
      meet: path ? Number(path[2]) : null,
      homeScore: num(/<div class="score1">([^<]*)</.exec(body)?.[1]),
      awayScore: num(/<div class="score2">([^<]*)</.exec(body)?.[1]),
      cancelled: /class="cancel"/.test(body),
      time: /<div class="time">\s*(\d{1,2}:\d{2})/.exec(body)?.[1] ?? null,
    });
  }
  return out;
}

/** 가을 경기 판정 — 9/20 이후, 취소 제외, 맞대결 번호 7 이하. 링크 없는 미개최 경기는 정규시즌이 끝났을 때만(그 뒤 일정은 가을 경기뿐). */
export function isNpbPostseasonGame(g: NpbSchedGame, regularDone: boolean): boolean {
  if (g.mmdd < "0920" || g.cancelled) return false;
  if (g.meet != null) return g.meet <= 7;
  return regularDone;
}
