"use client";

import { useActionState, useEffect, useState } from "react";
import { createPostAction, type PostFormState } from "../actions";
import { EXP_REWARDS } from "@/lib/user-level";

export interface MatchOption {
  id: number;
  league: string;
  leagueLabel: string;
  home: string;
  away: string;
  dateKey: string;
  dateLabel: string;
  timeLabel: string;
  hcLine: number | null;
  ouLine: number | null;
}

interface Props {
  matchesBySport: Record<string, MatchOption[]>;
}

const SPORTS = [
  { code: "soccer", label: "축구", emoji: "⚽", draw: true },
  { code: "baseball", label: "야구", emoji: "⚾", draw: false },
  { code: "basketball", label: "농구", emoji: "🏀", draw: false },
  { code: "hockey", label: "하키", emoji: "🏒", draw: false },
] as const;

const initial: PostFormState = { ok: true };

const fmtLine = (n: number) => (n > 0 ? `+${n}` : `${n}`);

function pickText(m: MatchOption, market: string, pick: string): string {
  if (market === "1X2")
    return pick === "HOME" ? `${m.home} 승` : pick === "AWAY" ? `${m.away} 승` : "무승부";
  if (market === "HANDICAP" && m.hcLine != null)
    return pick === "HOME"
      ? `${m.home} ${fmtLine(m.hcLine)}`
      : `${m.away} ${fmtLine(-m.hcLine)}`;
  if (market === "OU" && m.ouLine != null)
    return pick === "OVER" ? `오버 ${m.ouLine}` : `언더 ${m.ouLine}`;
  return "";
}

const autoTitle = (m: MatchOption, market: string, pick: string) =>
  `[${m.home} vs ${m.away}] ${pickText(m, market, pick)}`;

const chip = (active: boolean) =>
  `px-3 py-1.5 rounded-full text-sm font-semibold border transition ${
    active
      ? "bg-rose-600 text-white border-rose-600"
      : "border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
  }`;

const pickBtn = (active: boolean) =>
  `flex-1 min-w-[84px] px-3 py-2.5 rounded-lg text-sm font-bold border transition ${
    active
      ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 border-neutral-900 dark:border-white"
      : "border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
  }`;

const inputCls =
  "w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/40";
const stepLabel = "text-xs font-bold text-neutral-400 mb-2";

export default function AnalysisForm({ matchesBySport }: Props) {
  const [state, action, pending] = useActionState(createPostAction, initial);
  const [sport, setSport] = useState("soccer");
  const [dateKey, setDateKey] = useState("");
  const [league, setLeague] = useState("");
  const [matchId, setMatchId] = useState("");
  const [market, setMarket] = useState("1X2");
  const [pick, setPick] = useState("");
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);

  const sportMatches = matchesBySport[sport] ?? [];

  // 날짜 목록 (중복 제거, 정렬)
  const dateMap = new Map<string, string>();
  for (const m of sportMatches) if (!dateMap.has(m.dateKey)) dateMap.set(m.dateKey, m.dateLabel);
  const dates = [...dateMap.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));

  const dateMatches = sportMatches.filter((m) => m.dateKey === dateKey);

  // 리그 목록 (선택 날짜)
  const leagueMap = new Map<string, string>();
  for (const m of dateMatches) if (!leagueMap.has(m.league)) leagueMap.set(m.league, m.leagueLabel);
  const leagues = [...leagueMap.entries()];

  const leagueMatches = dateMatches.filter((m) => m.league === league);
  const selected = sportMatches.find((m) => String(m.id) === matchId) ?? null;
  const drawAllowed = SPORTS.find((s) => s.code === sport)?.draw ?? false;

  const markets = [
    { code: "1X2", label: "승무패", ok: true },
    { code: "HANDICAP", label: "핸디캡", ok: selected?.hcLine != null },
    { code: "OU", label: "오버언더", ok: selected?.ouLine != null },
  ];
  const predReady = !!selected && !!market && !!pick;

  // 제목 자동 생성 (사용자가 직접 건드리기 전까지)
  useEffect(() => {
    if (titleTouched) return;
    if (selected && market && pick) setTitle(autoTitle(selected, market, pick));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, market, pick]);

  const chooseSport = (s: string) => {
    setSport(s);
    setDateKey("");
    setLeague("");
    setMatchId("");
    setMarket("1X2");
    setPick("");
  };
  const chooseDate = (d: string) => {
    setDateKey(d);
    setLeague("");
    setMatchId("");
    setPick("");
  };
  const chooseLeague = (l: string) => {
    setLeague(l);
    setMatchId("");
    setPick("");
  };
  const chooseMatch = (id: string) => {
    setMatchId(id);
    setMarket("1X2");
    setPick("");
  };
  const chooseMarket = (mk: string) => {
    setMarket(mk);
    setPick("");
  };

  return (
    <form action={action} className="space-y-6">
      {/* 1. 경기 예측 (맨 위) */}
      <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold">
            🎯 경기 예측{" "}
            <span className="font-normal text-neutral-500">
              (선택 · 적중 시 +{EXP_REWARDS.predictionHit} exp)
            </span>
          </h2>
          {predReady && selected && (
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              ✓ {pickText(selected, market, pick)}
            </span>
          )}
        </div>

        {/* 종목 */}
        <div className={stepLabel}>종목</div>
        <div className="flex flex-wrap gap-2 mb-4">
          {SPORTS.map((s) => (
            <button key={s.code} type="button" onClick={() => chooseSport(s.code)} className={chip(sport === s.code)}>
              {s.emoji} {s.label}
            </button>
          ))}
        </div>

        {/* 날짜 */}
        <div className={stepLabel}>날짜</div>
        {dates.length === 0 ? (
          <p className="text-xs text-neutral-500 mb-4">예정 경기가 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-2 mb-4">
            {dates.map(([k, label]) => (
              <button key={k} type="button" onClick={() => chooseDate(k)} className={chip(dateKey === k)}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* 리그 */}
        {dateKey && (
          <>
            <div className={stepLabel}>리그</div>
            <div className="flex flex-wrap gap-2 mb-4">
              {leagues.map(([code, label]) => (
                <button key={code} type="button" onClick={() => chooseLeague(code)} className={chip(league === code)}>
                  {label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* 경기 */}
        {league && (
          <>
            <div className={stepLabel}>경기</div>
            <div className="space-y-2 mb-4">
              {leagueMatches.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => chooseMatch(String(m.id))}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border text-sm transition ${
                    matchId === String(m.id)
                      ? "border-rose-500 bg-rose-500/5"
                      : "border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  }`}
                >
                  <span className="font-semibold">
                    {m.home} <span className="text-neutral-400 font-normal">vs</span> {m.away}
                  </span>
                  <span className="text-xs text-neutral-500">{m.timeLabel}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* 마켓 + 예상 */}
        {selected && (
          <>
            <div className={stepLabel}>마켓</div>
            <div className="flex flex-wrap gap-2 mb-4">
              {markets.map((mk) => (
                <button
                  key={mk.code}
                  type="button"
                  disabled={!mk.ok}
                  onClick={() => chooseMarket(mk.code)}
                  className={`${chip(market === mk.code)} disabled:opacity-30 disabled:cursor-not-allowed`}
                >
                  {mk.label}
                  {!mk.ok && " (배당없음)"}
                </button>
              ))}
            </div>

            <div className={stepLabel}>예상</div>
            <div className="flex gap-2">
              {market === "1X2" && (
                <>
                  <button type="button" onClick={() => setPick("HOME")} className={pickBtn(pick === "HOME")}>
                    {selected.home} 승
                  </button>
                  {drawAllowed && (
                    <button type="button" onClick={() => setPick("DRAW")} className={pickBtn(pick === "DRAW")}>
                      무
                    </button>
                  )}
                  <button type="button" onClick={() => setPick("AWAY")} className={pickBtn(pick === "AWAY")}>
                    {selected.away} 승
                  </button>
                </>
              )}
              {market === "HANDICAP" && selected.hcLine != null && (
                <>
                  <button type="button" onClick={() => setPick("HOME")} className={pickBtn(pick === "HOME")}>
                    {selected.home} {fmtLine(selected.hcLine)}
                  </button>
                  <button type="button" onClick={() => setPick("AWAY")} className={pickBtn(pick === "AWAY")}>
                    {selected.away} {fmtLine(-selected.hcLine)}
                  </button>
                </>
              )}
              {market === "OU" && selected.ouLine != null && (
                <>
                  <button type="button" onClick={() => setPick("OVER")} className={pickBtn(pick === "OVER")}>
                    오버 {selected.ouLine}
                  </button>
                  <button type="button" onClick={() => setPick("UNDER")} className={pickBtn(pick === "UNDER")}>
                    언더 {selected.ouLine}
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {/* hidden — 예측 완성됐을 때만 전송 */}
        <input type="hidden" name="sport" value={predReady ? sport : ""} />
        <input type="hidden" name="matchId" value={predReady ? matchId : ""} />
        <input type="hidden" name="market" value={predReady ? market : ""} />
        <input type="hidden" name="pick" value={predReady ? pick : ""} />
      </section>

      {/* 2. 제목 (예측하면 자동 생성) */}
      <div>
        <div className={stepLabel}>제목</div>
        <input
          name="title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleTouched(true);
          }}
          placeholder="제목 (예측을 선택하면 자동으로 채워집니다)"
          required
          maxLength={120}
          className={inputCls}
        />
      </div>

      {/* 3. 내용 */}
      <div>
        <div className={stepLabel}>
          내용{" "}
          <span className="font-normal text-neutral-400">
            · **굵게** ## 제목 - 목록 등 마크다운 지원
          </span>
        </div>
        <textarea
          name="content"
          placeholder="분석 내용을 적어주세요. (마크다운 문법 사용 가능)"
          required
          rows={10}
          className={inputCls}
        />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white py-3 text-sm font-bold transition"
      >
        {pending ? "등록 중…" : "등록"}
      </button>
    </form>
  );
}
