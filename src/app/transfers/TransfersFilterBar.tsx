"use client";
// 이적시장 필터바 — 카테고리(전체/리그별/팀별/국가별/포지션별) + 컨텍스트 하위필터.
// 팀·국가는 검색 가능한 드롭다운(선택/바깥클릭 시 닫힘), 리그·포지션은 칩.
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";

interface TeamOpt { id: number; name: string; count: number }
interface CountryOpt { name: string; flag: string | null; count: number }

interface Props {
  view: string;
  league: string;
  team: string;
  pos: string;
  country: string;
  leagues: { code: string; label: string }[];
  teams: TeamOpt[];
  countries: CountryOpt[];
}

const CATS = [
  { key: "all", label: "전체" },
  { key: "league", label: "리그별" },
  { key: "team", label: "팀별" },
  { key: "country", label: "국가별" },
  { key: "pos", label: "포지션별" },
  { key: "latest", label: "최신 이적" },
];
// 세부 포지션 — 수비→공격 순. CB 중앙수비·FB 윙백·DM/CM/AM 미드·W 윙어·ST 스트라이커
const POSITIONS = [
  { code: "GK", label: "GK" },
  { code: "CB", label: "CB" },
  { code: "FB", label: "FB" },
  { code: "DM", label: "DM" },
  { code: "CM", label: "CM" },
  { code: "AM", label: "AM" },
  { code: "W", label: "W" },
  { code: "ST", label: "ST" },
];

function buildUrl(o: { view?: string; league?: string; team?: string; pos?: string; country?: string }): string {
  const params = new URLSearchParams();
  if (o.view && o.view !== "all") params.set("view", o.view);
  if (o.league) params.set("league", o.league);
  if (o.team) params.set("team", o.team);
  if (o.pos) params.set("pos", o.pos);
  if (o.country) params.set("country", o.country);
  const qs = params.toString();
  return `/transfers${qs ? `?${qs}` : ""}`;
}

export default function TransfersFilterBar({ view, league, team, pos, country, leagues, teams, countries }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState<null | "team" | "country">(null);
  const [q, setQ] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  // 바깥 클릭 시 드롭다운 닫기
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const go = (o: Parameters<typeof buildUrl>[0]) => {
    setOpen(null);
    setQ("");
    router.push(buildUrl(o));
  };

  const chip = (active: boolean) =>
    `px-3.5 py-1.5 rounded-full text-sm font-bold border transition ${
      active
        ? "bg-cyan-600 text-white border-cyan-600"
        : "border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
    }`;

  const teamName = team ? teams.find((t) => String(t.id) === team)?.name : null;
  const countryName = country || null;
  const fil = (s: string) => s.toLowerCase().includes(q.toLowerCase());

  return (
    <div ref={wrapRef} className="space-y-3">
      {/* 카테고리 탭 */}
      <div className="flex flex-wrap gap-2">
        {CATS.map((c) => (
          <button key={c.key} onClick={() => go({ view: c.key })} className={chip(view === c.key)}>
            {c.label}
          </button>
        ))}
      </div>

      {/* 하위 필터 */}
      {view === "league" && (
        <div className="flex flex-wrap gap-1.5">
          {leagues.map((l) => (
            <button key={l.code} onClick={() => go({ view: "league", league: l.code })} className={chip(league === l.code)}>
              {l.label}
            </button>
          ))}
        </div>
      )}

      {view === "pos" && (
        <div className="flex flex-wrap gap-1.5">
          {POSITIONS.map((p) => (
            <button key={p.code} onClick={() => go({ view: "pos", pos: p.code })} className={chip(pos === p.code)}>
              {p.label}
            </button>
          ))}
        </div>
      )}

      {view === "team" && (
        <div className="relative w-full max-w-xs">
          <button
            onClick={() => setOpen(open === "team" ? null : "team")}
            className="flex items-center justify-between gap-2 w-full px-4 py-2 rounded-xl text-sm font-bold border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <span className={teamName ? "text-cyan-600 dark:text-cyan-400 truncate" : "text-neutral-500"}>{teamName || "팀 선택"}</span>
            <span className="text-neutral-400 text-xs shrink-0">▾</span>
          </button>
          {open === "team" && (
            <div className="absolute z-30 mt-1.5 w-full rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xl overflow-hidden">
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="팀 검색…"
                className="w-full px-4 py-2.5 text-sm bg-transparent border-b border-neutral-200 dark:border-neutral-800 outline-none"
              />
              <div className="max-h-72 overflow-y-auto py-1">
                {team && (
                  <button onClick={() => go({ view: "team" })} className="block w-full text-left px-4 py-2 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                    전체 팀
                  </button>
                )}
                {teams.filter((t) => fil(t.name)).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => go({ view: "team", team: String(t.id) })}
                    className={`flex justify-between gap-2 w-full text-left px-4 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                      String(t.id) === team ? "font-bold text-cyan-600 dark:text-cyan-400" : "text-neutral-600 dark:text-neutral-300"
                    }`}
                  >
                    <span className="truncate">{t.name}</span>
                    <span className="text-xs text-neutral-400 shrink-0">{t.count}</span>
                  </button>
                ))}
                {teams.filter((t) => fil(t.name)).length === 0 && (
                  <p className="px-4 py-3 text-sm text-neutral-400">검색 결과 없음</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {view === "country" && (
        <div className="relative w-full max-w-xs">
          <button
            onClick={() => setOpen(open === "country" ? null : "country")}
            className="flex items-center justify-between gap-2 w-full px-4 py-2 rounded-xl text-sm font-bold border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <span className={countryName ? "text-cyan-600 dark:text-cyan-400 truncate" : "text-neutral-500"}>{countryName || "국가 선택"}</span>
            <span className="text-neutral-400 text-xs shrink-0">▾</span>
          </button>
          {open === "country" && (
            <div className="absolute z-30 mt-1.5 w-full rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xl overflow-hidden">
              {countries.length === 0 ? (
                <p className="px-4 py-3 text-sm text-neutral-400">국가 데이터 수집 중…</p>
              ) : (
                <>
                  <input
                    autoFocus
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="국가 검색…"
                    className="w-full px-4 py-2.5 text-sm bg-transparent border-b border-neutral-200 dark:border-neutral-800 outline-none"
                  />
                  <div className="max-h-72 overflow-y-auto py-1">
                    {country && (
                      <button onClick={() => go({ view: "country" })} className="block w-full text-left px-4 py-2 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                        전체 국가
                      </button>
                    )}
                    {countries.filter((c) => fil(c.name)).map((c) => (
                      <button
                        key={c.name}
                        onClick={() => go({ view: "country", country: c.name })}
                        className={`flex items-center gap-2 w-full text-left px-4 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                          c.name === country ? "font-bold text-cyan-600 dark:text-cyan-400" : "text-neutral-600 dark:text-neutral-300"
                        }`}
                      >
                        {c.flag && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.flag} alt="" className="w-4 h-4 object-contain shrink-0" />
                        )}
                        <span className="truncate flex-1">{c.name}</span>
                        <span className="text-xs text-neutral-400 shrink-0">{c.count}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
