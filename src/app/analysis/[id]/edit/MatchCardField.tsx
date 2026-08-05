// 글 수정 화면의 경기 데이터 카드 조작 — 유지/제거/변경·신규 첨부.
// 서버 폼(EditPostPage) 안에 끼워 넣는 클라이언트 조각. hidden input 3개
// (matchCardOp·cardMatchId·cardMkt)로 제출에 참여하고, 본문 반영은 서버 액션
// applyMatchCard 가 맡는다 — 여기서 textarea 를 직접 고치지 않는다.
"use client";

import { useState } from "react";
import type { MatchOption } from "@/lib/analysis/match-options";

interface InitialCard {
  matchId: number;
  mkt: string;
}

interface Props {
  matchesBySport: Record<string, MatchOption[]>;
  initialCard: InitialCard | null;
}

const SPORT_LABEL: Record<string, string> = {
  soccer: "축구",
  baseball: "야구",
  basketball: "농구",
  hockey: "하키",
  esports: "e스포츠",
  volleyball: "배구",
  mma: "격투기",
};

const MKT_LABEL: Record<string, string> = { "1X2": "승무패", OU: "오버언더", HANDICAP: "핸디캡" };

export default function MatchCardField({ matchesBySport, initialCard }: Props) {
  // keep = 본문 그대로 / remove = 기존 카드 제거 / set = 새 카드(교체 포함)
  const [op, setOp] = useState<"keep" | "remove" | "set">("keep");
  const [sport, setSport] = useState("soccer");
  const [dateKey, setDateKey] = useState("");
  const [league, setLeague] = useState("");
  const [matchId, setMatchId] = useState("");
  const [mkt, setMkt] = useState("1X2");

  const sportMatches = matchesBySport[sport] ?? [];
  const dateMap = new Map<string, string>();
  for (const m of sportMatches) if (!dateMap.has(m.dateKey)) dateMap.set(m.dateKey, m.dateLabel);
  const dates = [...dateMap.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const dateMatches = sportMatches.filter((m) => m.dateKey === dateKey);
  const leagueMap = new Map<string, string>();
  for (const m of dateMatches) if (!leagueMap.has(m.league)) leagueMap.set(m.league, m.leagueLabel);
  const leagues = [...leagueMap.entries()];
  const leagueMatches = dateMatches.filter((m) => m.league === league);
  const selected = sportMatches.find((m) => String(m.id) === matchId) ?? null;

  const selectCls =
    "rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-rose-400 dark:border-neutral-700 dark:bg-white/[0.04]";
  const btnCls =
    "inline-flex items-center rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 transition-colors hover:border-rose-300 hover:text-rose-600 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-neutral-200";

  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-neutral-500">
        경기 데이터 카드 (선택)
        <span className="ml-1 font-normal text-neutral-400">— AI 승률·배당 이미지가 글 끝에 붙습니다</span>
      </label>

      {/* 현재 상태 안내 + 조작 버튼 */}
      {op === "keep" && initialCard && (
        <>
          <div className="mb-2 overflow-hidden rounded-xl ring-1 ring-black/5 dark:ring-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/og/match-card?m=${initialCard.matchId}&mkt=${initialCard.mkt}`}
              alt="현재 첨부된 경기 데이터 카드"
              className="w-full"
              loading="lazy"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setOp("set")} className={btnCls}>
              다른 카드로 변경
            </button>
            <button type="button" onClick={() => setOp("remove")} className={btnCls}>
              카드 제거
            </button>
          </div>
        </>
      )}
      {op === "keep" && !initialCard && (
        <button type="button" onClick={() => setOp("set")} className={btnCls}>
          + 경기 데이터 카드 첨부
        </button>
      )}
      {op === "remove" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-xl bg-red-500/10 px-3 py-1.5 text-xs text-red-600 dark:text-red-400">
            저장하면 카드가 제거됩니다
          </span>
          <button type="button" onClick={() => setOp("keep")} className={btnCls}>
            되돌리기
          </button>
        </div>
      )}

      {/* 새 카드 선택 — 종목→날짜→리그→경기→카드 종류 */}
      {op === "set" && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <select value={sport} onChange={(e) => { setSport(e.target.value); setDateKey(""); setLeague(""); setMatchId(""); }} className={selectCls}>
              {Object.keys(matchesBySport).map((s) => (
                <option key={s} value={s}>{SPORT_LABEL[s] ?? s}</option>
              ))}
            </select>
            <select value={dateKey} onChange={(e) => { setDateKey(e.target.value); setLeague(""); setMatchId(""); }} className={selectCls}>
              <option value="">날짜</option>
              {dates.map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
            <select value={league} onChange={(e) => { setLeague(e.target.value); setMatchId(""); }} className={selectCls} disabled={!dateKey}>
              <option value="">리그</option>
              {leagues.map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
            <select value={matchId} onChange={(e) => { setMatchId(e.target.value); setMkt("1X2"); }} className={selectCls} disabled={!league}>
              <option value="">경기</option>
              {leagueMatches.map((m) => (
                <option key={m.id} value={m.id}>{m.timeLabel} {m.home} vs {m.away}</option>
              ))}
            </select>
          </div>

          {selected && (
            <>
              <div className="flex flex-wrap gap-1.5">
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
                    onClick={() => setMkt(k)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 transition ${
                      mkt === k
                        ? "bg-rose-600 text-white ring-rose-600"
                        : "bg-white text-neutral-600 ring-black/10 hover:bg-neutral-50 dark:bg-white/[0.06] dark:text-neutral-300 dark:ring-white/15"
                    }`}
                  >
                    {label} 카드
                  </button>
                ))}
              </div>
              <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/og/match-card?m=${matchId}&mkt=${mkt}`} alt="첨부될 경기 데이터 카드 미리보기" className="w-full" loading="lazy" />
              </div>
              <p className="text-xs text-neutral-400">
                저장하면 {MKT_LABEL[mkt] ?? mkt} 카드가 글 끝에 붙습니다{initialCard ? " (기존 카드는 교체)" : ""}.
              </p>
            </>
          )}
          <button type="button" onClick={() => { setOp("keep"); setMatchId(""); }} className={btnCls}>
            취소
          </button>
        </div>
      )}

      {/* 제출 참여 — set 인데 경기 미선택이면 keep 으로 보내 실수 저장을 막는다 */}
      <input type="hidden" name="matchCardOp" value={op === "set" && !selected ? "keep" : op} />
      <input type="hidden" name="cardMatchId" value={op === "set" ? matchId : ""} />
      <input type="hidden" name="cardMkt" value={op === "set" ? mkt : ""} />
    </div>
  );
}
