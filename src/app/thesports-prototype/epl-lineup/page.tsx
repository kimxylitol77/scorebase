// TheSports trial 검증 prototype — 단일 매치 라인업 SVG 포메이션 도식.
// x/y 좌표 (100x100 grid) 로 축구장에 선수 배치.
//
// 좌표 origin (docs):
//   Home team: 좌상단 → x 오른쪽, y 아래쪽 (y=12 골키퍼, y=85 FW)
//   Away team: 우하단 → x 왼쪽, y 위쪽 (mirror 처리 필요)

import { fetchFootballLineup } from "@/lib/sports/thesports/football-collector";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EPL_MATCH_ID = "318q66hx047nqo9"; // 5/17 EPL: Manchester United home

interface Player {
  id: string;
  first: number;
  captain: number;
  name: string;
  shirt_number: number;
  position: string;
  x: number;
  y: number;
  rating: string;
  logo?: string;
}

function lastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1];
}

function ratingColor(rating: string): string {
  const r = parseFloat(rating);
  if (r >= 8.0) return "#10b981"; // green
  if (r >= 7.0) return "#3b82f6"; // blue
  if (r >= 6.0) return "#a3a3a3"; // neutral
  return "#ef4444"; // red
}

export default async function EPLLineupPage() {
  let data;
  let error: string | null = null;
  try {
    data = await fetchFootballLineup(EPL_MATCH_ID);
  } catch (e) {
    error = (e as Error).message;
  }

  const r = data?.results;
  const homeStarters = (r?.lineup?.home ?? []).filter((p) => p.first === 1) as Player[];
  const awayStarters = (r?.lineup?.away ?? []).filter((p) => p.first === 1) as Player[];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-black tracking-tight">EPL 라인업 (TheSports prototype)</h1>
        <p className="text-sm text-neutral-500 mt-1">
          데이터 소스: TheSports /v1/football/match/lineup/detail
        </p>
        <p className="text-xs text-neutral-400 mt-1">
          ⚠️ Trial 검증. Production 사용 시 fixed IP worker 필수.
        </p>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700 text-sm">
          ❌ Error: {error}
        </div>
      )}

      {r && (
        <>
          <div className="flex items-center justify-around mb-4 py-4 bg-neutral-100 dark:bg-neutral-800 rounded">
            <div className="text-center">
              <div className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1">HOME</div>
              <div className="text-3xl font-black text-neutral-900 dark:text-white">{r.home_formation || "—"}</div>
            </div>
            <div className="text-base font-bold text-neutral-400 dark:text-neutral-500">VS</div>
            <div className="text-center">
              <div className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1">AWAY</div>
              <div className="text-3xl font-black text-neutral-900 dark:text-white">{r.away_formation || "—"}</div>
            </div>
          </div>

          {/* SVG 축구장 — 가로 100 × 세로 200 (양 팀 위/아래 배치) */}
          <div className="bg-gradient-to-b from-green-700 to-green-800 rounded-lg p-2 mb-6">
            <svg viewBox="0 0 100 200" className="w-full" style={{ maxHeight: "700px" }}>
              {/* 축구장 라인 */}
              <rect x="1" y="1" width="98" height="198" fill="none" stroke="white" strokeWidth="0.3" opacity="0.8" />
              <line x1="0" y1="100" x2="100" y2="100" stroke="white" strokeWidth="0.3" opacity="0.8" />
              <circle cx="50" cy="100" r="10" fill="none" stroke="white" strokeWidth="0.3" opacity="0.8" />
              <circle cx="50" cy="100" r="0.5" fill="white" opacity="0.8" />
              {/* 페널티 박스 home (위) */}
              <rect x="22" y="1" width="56" height="18" fill="none" stroke="white" strokeWidth="0.3" opacity="0.8" />
              <rect x="36" y="1" width="28" height="6" fill="none" stroke="white" strokeWidth="0.3" opacity="0.8" />
              {/* 페널티 박스 away (아래) */}
              <rect x="22" y="181" width="56" height="18" fill="none" stroke="white" strokeWidth="0.3" opacity="0.8" />
              <rect x="36" y="193" width="28" height="6" fill="none" stroke="white" strokeWidth="0.3" opacity="0.8" />

              {/* HOME 선수 (그대로) */}
              {homeStarters.map((p) => (
                <g key={p.id} transform={`translate(${p.x}, ${p.y})`}>
                  <circle r="4.5" fill={ratingColor(p.rating)} stroke="white" strokeWidth="0.4" />
                  <text textAnchor="middle" dy="1.4" fontSize="3" fontWeight="bold" fill="white">
                    {p.shirt_number || ""}
                  </text>
                  <text textAnchor="middle" y="-5.5" fontSize="2.5" fontWeight="600" fill="white">
                    {p.captain === 1 ? "©︎ " : ""}
                    {lastName(p.name)}
                  </text>
                  <text textAnchor="middle" y="9.5" fontSize="2.5" fill="#fde68a">
                    {p.rating !== "0.0" ? p.rating : ""}
                  </text>
                </g>
              ))}

              {/* AWAY 선수 (mirror: x = 100-x, y = 200-y) */}
              {awayStarters.map((p) => (
                <g key={p.id} transform={`translate(${100 - p.x}, ${200 - p.y})`}>
                  <circle r="4.5" fill={ratingColor(p.rating)} stroke="white" strokeWidth="0.4" />
                  <text textAnchor="middle" dy="1.4" fontSize="3" fontWeight="bold" fill="white">
                    {p.shirt_number || ""}
                  </text>
                  <text textAnchor="middle" y="-5.5" fontSize="2.5" fontWeight="600" fill="white">
                    {p.captain === 1 ? "©︎ " : ""}
                    {lastName(p.name)}
                  </text>
                  <text textAnchor="middle" y="9.5" fontSize="2.5" fill="#fde68a">
                    {p.rating !== "0.0" ? p.rating : ""}
                  </text>
                </g>
              ))}
            </svg>
          </div>

          {/* 평점 컬러 범례 */}
          <div className="flex items-center gap-4 text-xs text-neutral-600 mb-6 justify-center">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-green-500"></span> ≥ 8.0
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-blue-500"></span> ≥ 7.0
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-neutral-400"></span> ≥ 6.0
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-red-500"></span> &lt; 6.0
            </span>
            <span className="text-neutral-400">· ©︎ = 주장</span>
          </div>

          {/* 부상자 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              ["HOME 부상자", r.injury?.home],
              ["AWAY 부상자", r.injury?.away],
            ].map(([title, list]) => (
              <div key={title as string} className="border border-neutral-200 rounded p-3">
                <h3 className="text-sm font-bold mb-2">{title as string}</h3>
                {((list as typeof r.injury.home | undefined) ?? []).length === 0 ? (
                  <p className="text-xs text-neutral-400">없음</p>
                ) : (
                  <ul className="text-xs space-y-1">
                    {((list as typeof r.injury.home) ?? []).map((inj) => (
                      <li key={inj.id}>
                        <span className="font-semibold">{inj.name}</span>
                        <span className="text-neutral-500"> — {inj.reason}</span>
                        <span className={`ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] ${
                          inj.type === 1 ? "bg-red-100 text-red-700" :
                          inj.type === 2 ? "bg-yellow-100 text-yellow-700" :
                          "bg-neutral-100 text-neutral-600"
                        }`}>
                          {inj.type === 1 ? "부상" : inj.type === 2 ? "출장정지" : "?"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <footer className="mt-8 pt-4 border-t border-neutral-200 text-xs text-neutral-400">
        <p>
          축구장 좌표: home origin 좌상단, away origin 우하단 (mirror 처리). x/y 100x100 grid.
        </p>
        <p>
          match_id: <code>{EPL_MATCH_ID}</code>
        </p>
      </footer>
    </div>
  );
}
