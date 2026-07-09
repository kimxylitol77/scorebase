// 팀 소개 SEO 서술 블록 — 이미 계산된 팀 데이터(홈구장·지난 시즌 성적·공수 순위)를
// 자연어 한국어 문단으로 조립. 검색엔진이 색인할 텍스트가 팀 페이지에 없던 것을 보완.
// 새 쿼리 없음: page.tsx 가 이미 가진 값을 props 로 받아 문장만 생성 (전 팀 자동).

interface TeamAboutProps {
  name: string;
  enName: string; // 영문명 (한글과 다르면 괄호 병기, 같으면 "")
  leagueLabel: string;
  sportLabel: string; // "축구" | "야구" | "농구" | "아이스하키" | "e스포츠"
  isSoccer: boolean; // 승점·무승부 개념이 있는 축구만 시즌 성적 문장 포함
  venue: { venueName?: string; city?: string; capacity?: number; foundation?: number } | null;
  record: {
    played: number;
    position: number;
    points: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
  } | null;
  attackRank: number | null;
  defenseRank: number | null;
  seasonLabel: string | null;
}

// 은/는 조사 — 한글 name 마지막 글자 받침 유무. 영문/숫자 끝은 기본 "는".
function eunneun(name: string): string {
  const c = name.trim().slice(-1);
  const code = c.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0 ? "은" : "는";
  return "는";
}

export default function TeamAbout({
  name,
  enName,
  leagueLabel,
  sportLabel,
  isSoccer,
  venue,
  record,
  attackRank,
  defenseRank,
  seasonLabel,
}: TeamAboutProps) {
  const sentences: string[] = [];

  // 1) 정체성 + 홈구장 + 창단
  let intro = `${name}${enName ? `(${enName})` : ""}${eunneun(name)} ${leagueLabel}에서 활동하는 ${sportLabel} 구단입니다.`;
  if (venue?.venueName) {
    // 도시명(venue.city)은 영문이라 한국어 문단에 섞이면 어색 — 생략. 구장명은 고유명사라 유지.
    const cap = venue.capacity ? `(${venue.capacity.toLocaleString()}석)` : "";
    intro += ` 홈 경기는 ${venue.venueName}${cap}에서 열립니다.`;
  }
  if (venue?.foundation) intro += ` ${venue.foundation}년에 창단했습니다.`;
  sentences.push(intro);

  // 2) 지난 시즌 성적 (축구만 — 승점/무승부 구조)
  if (isSoccer && record && seasonLabel && record.played > 0) {
    let rec = `${seasonLabel} 시즌에는 리그 ${record.position}위(승점 ${record.points}, ${record.wins}승 ${record.draws}무 ${record.losses}패)를 기록했으며, ${record.goalsFor}골을 넣고 ${record.goalsAgainst}골을 내주었습니다.`;
    if (attackRank && defenseRank) {
      rec += ` 리그 공격력 ${attackRank}위, 수비력 ${defenseRank}위였습니다.`;
    }
    sentences.push(rec);
  }

  return (
    <section>
      <p className="text-[13px] sm:text-sm leading-relaxed text-neutral-600 dark:text-neutral-300 break-keep">
        {sentences.join(" ")}
      </p>
    </section>
  );
}
