"use client";

import { useActionState, useEffect, useState } from "react";
import { createPostAction, type PostFormState } from "../actions";
import { EXP_REWARDS } from "@/lib/user-level";
import MediaUpload from "@/components/board/MediaUpload";

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
  oddsHome: number | null;
  oddsDraw: number | null;
  oddsAway: number | null;
  oddsHcHome: number | null;
  oddsHcAway: number | null;
  oddsOver: number | null;
  oddsUnder: number | null;
}

interface Props {
  matchesBySport: Record<string, MatchOption[]>;
}

const SPORTS = [
  { code: "soccer", label: "축구", emoji: "⚽", draw: true },
  { code: "baseball", label: "야구", emoji: "⚾", draw: false },
  { code: "basketball", label: "농구", emoji: "🏀", draw: false },
  { code: "hockey", label: "하키", emoji: "🏒", draw: false },
  { code: "esports", label: "롤", emoji: "🎮", draw: false },
  { code: "volleyball", label: "배구", emoji: "🏐", draw: false },
  { code: "mma", label: "UFC", emoji: "🥊", draw: false },
] as const;

const initial: PostFormState = { ok: true };

const fmtLine = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const fmtOdds = (n: number) => n.toFixed(2);

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
  `flex-1 min-w-[84px] px-3 py-2 rounded-lg text-sm font-bold border transition flex flex-col items-center justify-center gap-0.5 ${
    active
      ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 border-neutral-900 dark:border-white"
      : "border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
  }`;

// 배당 텍스트 — 비활성 버튼은 강조색(rose), 활성(검/흰 배경)은 같은 색 흐리게
const oddsCls = (active: boolean) =>
  `text-[11px] font-extrabold tabular-nums ${active ? "opacity-70" : "text-rose-500"}`;

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
  const [attachCard, setAttachCard] = useState(false); // 경기 데이터 카드 첨부 (스탯카드 짤)
  // 첨부 카드 종류 — 기본은 픽 마켓을 따라가되(아래 chooseMarket) 글쓴이가 다른 카드로 바꿀 수 있다.
  const [cardMkt, setCardMkt] = useState("1X2");

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
    setCardMkt("1X2");
    setPick("");
  };
  const chooseMarket = (mk: string) => {
    setMarket(mk);
    setCardMkt(mk); // 카드 종류는 픽 마켓을 기본으로 따라간다 — 이후 글쓴이가 바꾸면 그 값 유지
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
                    <span>{selected.home} 승</span>
                    {selected.oddsHome != null && (
                      <span className={oddsCls(pick === "HOME")}>{fmtOdds(selected.oddsHome)}</span>
                    )}
                  </button>
                  {drawAllowed && (
                    <button type="button" onClick={() => setPick("DRAW")} className={pickBtn(pick === "DRAW")}>
                      <span>무</span>
                      {selected.oddsDraw != null && (
                        <span className={oddsCls(pick === "DRAW")}>{fmtOdds(selected.oddsDraw)}</span>
                      )}
                    </button>
                  )}
                  <button type="button" onClick={() => setPick("AWAY")} className={pickBtn(pick === "AWAY")}>
                    <span>{selected.away} 승</span>
                    {selected.oddsAway != null && (
                      <span className={oddsCls(pick === "AWAY")}>{fmtOdds(selected.oddsAway)}</span>
                    )}
                  </button>
                </>
              )}
              {market === "HANDICAP" && selected.hcLine != null && (
                <>
                  <button type="button" onClick={() => setPick("HOME")} className={pickBtn(pick === "HOME")}>
                    <span>{selected.home} {fmtLine(selected.hcLine)}</span>
                    {selected.oddsHcHome != null && (
                      <span className={oddsCls(pick === "HOME")}>{fmtOdds(selected.oddsHcHome)}</span>
                    )}
                  </button>
                  <button type="button" onClick={() => setPick("AWAY")} className={pickBtn(pick === "AWAY")}>
                    <span>{selected.away} {fmtLine(-selected.hcLine)}</span>
                    {selected.oddsHcAway != null && (
                      <span className={oddsCls(pick === "AWAY")}>{fmtOdds(selected.oddsHcAway)}</span>
                    )}
                  </button>
                </>
              )}
              {market === "OU" && selected.ouLine != null && (
                <>
                  <button type="button" onClick={() => setPick("OVER")} className={pickBtn(pick === "OVER")}>
                    <span>오버 {selected.ouLine}</span>
                    {selected.oddsOver != null && (
                      <span className={oddsCls(pick === "OVER")}>{fmtOdds(selected.oddsOver)}</span>
                    )}
                  </button>
                  <button type="button" onClick={() => setPick("UNDER")} className={pickBtn(pick === "UNDER")}>
                    <span>언더 {selected.ouLine}</span>
                    {selected.oddsUnder != null && (
                      <span className={oddsCls(pick === "UNDER")}>{fmtOdds(selected.oddsUnder)}</span>
                    )}
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {/* 경기 데이터 카드 첨부 — 봇 글과 같은 스탯카드 짤(AI 승률·배당)을 본문 끝에 자동 삽입.
            카드 종류는 글쓴이가 선택 (기본 = 내 픽 마켓). 체크 안 하면 안 붙는다. */}
        {predReady && selected && (
          <div className="mt-3">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                name="attachMatchCard"
                checked={attachCard}
                onChange={(e) => setAttachCard(e.target.checked)}
                className="h-4 w-4 accent-rose-600"
              />
              <span>
                경기 데이터 카드 첨부
                <span className="ml-1 text-xs text-neutral-500">— AI 승률·배당 이미지가 글 끝에 붙습니다</span>
              </span>
            </label>
            {attachCard && (
              <>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(
                    [
                      ["1X2", "승무패"],
                      ...(selected.ouLine != null ? [["OU", `오버언더 ${selected.ouLine}`]] : []),
                      ...(selected.hcLine != null ? [["HANDICAP", `핸디캡 ${selected.hcLine}`]] : []),
                    ] as [string, string][]
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setCardMkt(k)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 transition ${
                        cardMkt === k
                          ? "bg-rose-600 text-white ring-rose-600"
                          : "bg-white text-neutral-600 ring-black/10 hover:bg-neutral-50 dark:bg-white/[0.06] dark:text-neutral-300 dark:ring-white/15"
                      }`}
                    >
                      {label} 카드
                    </button>
                  ))}
                </div>
                <div className="mt-2 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/og/match-card?m=${matchId}&mkt=${cardMkt}`} alt="첨부될 경기 데이터 카드 미리보기" className="w-full" loading="lazy" />
                </div>
              </>
            )}
            <input type="hidden" name="cardMkt" value={attachCard ? cardMkt : ""} />
          </div>
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
          id="post-content"
          name="content"
          placeholder="분석 내용을 적어주세요. (마크다운 문법 사용 가능)"
          required
          rows={10}
          className={inputCls}
        />
        <div className="mt-2">
          <MediaUpload targetId="post-content" />
        </div>
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
