// MLB PREVIEW 글 본문의 양 선발 구종 비교 — 선수 페이지 PitchArsenal 을 두 장 나란히.
// 데이터는 이미 수집 중인 MLB Stats API pitchArsenal (getPitchArsenal = unstable_cache 6h)
// 이라 외부 계약·신규 수집 없이 글 페이지에 노출만 한다. 글 페이지는 ISR 이므로
// 캐시되지 않는 fetch 를 여기 추가하면 안 된다.

import { getPitchArsenal } from "@/lib/sports/mlb-player-extras";
import PitchArsenal from "@/app/players/[pid]/PitchArsenal";

interface StarterJson {
  pid?: number;
  name?: string;
  hand?: string;
}

function parseStarter(raw: string | null | undefined): StarterJson | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as StarterJson;
    return j.pid != null && j.name ? j : null;
  } catch {
    return null;
  }
}

const HAND_KO: Record<string, string> = { L: "좌투", R: "우투", S: "양투" };

export default async function StarterArsenal({
  homeStarter,
  awayStarter,
  homeTeam,
  awayTeam,
  season,
}: {
  homeStarter: string | null;
  awayStarter: string | null;
  homeTeam: string;
  awayTeam: string;
  season: number;
}) {
  const home = parseStarter(homeStarter);
  const away = parseStarter(awayStarter);
  if (!home && !away) return null;

  // 등판 예고가 한쪽만 나온 경기도 있어 각각 독립 처리 (한쪽 실패가 다른 쪽을 막지 않게).
  const [homeArsenal, awayArsenal] = await Promise.all([
    home ? getPitchArsenal(home.pid!, season).catch(() => []) : Promise.resolve([]),
    away ? getPitchArsenal(away.pid!, season).catch(() => []) : Promise.resolve([]),
  ]);
  // 신인·트레이드 직후 등은 arsenal 이 비어 온다 — 그 경우 섹션 자체를 숨긴다.
  if (homeArsenal.length === 0 && awayArsenal.length === 0) return null;

  const label = (s: StarterJson, team: string) =>
    `${s.name}${s.hand && HAND_KO[s.hand] ? ` (${HAND_KO[s.hand]})` : ""} · ${team}`;

  return (
    <div className="my-6">
      <h2 className="mb-3 text-lg font-bold tracking-tight">선발 투수 구종 비교</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {away && awayArsenal.length > 0 && (
          <PitchArsenal pitches={awayArsenal} title={label(away, awayTeam)} />
        )}
        {home && homeArsenal.length > 0 && (
          <PitchArsenal pitches={homeArsenal} title={label(home, homeTeam)} />
        )}
      </div>
    </div>
  );
}
