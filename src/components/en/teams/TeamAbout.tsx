// teams__TeamAbout (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

import { venueKo } from "@/lib/venue-ko";

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
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0 ? "" : "";
  return "";
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
  let intro = `${name} is a ${sportLabel.toLowerCase()} club competing in ${leagueLabel}.`;
  if (venue?.venueName) {
    // 도시명(venue.city)은 영문이라 한국어 문단에 섞이면 어색 — 생략. 구장명은 한글 사전 통과(미등록은 원문).
    const cap = venue.capacity ? ` (capacity ${venue.capacity.toLocaleString()})` : "";
    intro += ` Home matches are played at ${venue.venueName}${cap}.`;
  }
  if (venue?.foundation) intro += ` Founded in ${venue.foundation}.`;
  sentences.push(intro);

  // 2) 지난 시즌 성적 (축구만 — 승점/무승부 구조)
  if (isSoccer && record && seasonLabel && record.played > 0) {
    let rec = `In ${seasonLabel} they finished ${record.position}th on ${record.points} points (${record.wins}W ${record.draws}D ${record.losses}L), scoring ${record.goalsFor} and conceding ${record.goalsAgainst}.`;
    if (attackRank && defenseRank) {
      rec += ` That ranked ${attackRank}th for attack and ${defenseRank}th for defence.`;
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
