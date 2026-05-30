"use client";

import { useActionState, useState } from "react";
import { createPostAction, type PostFormState } from "../actions";
import { EXP_REWARDS } from "@/lib/user-level";

export interface MatchOption {
  id: number;
  home: string;
  away: string;
  label: string;
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

const inputCls =
  "w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/40";

function pickCls(active: boolean): string {
  return `px-4 py-1.5 rounded-lg text-sm font-semibold border transition ${
    active
      ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 border-neutral-900 dark:border-white"
      : "border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
  }`;
}

export default function AnalysisForm({ matchesBySport }: Props) {
  const [state, action, pending] = useActionState(createPostAction, initial);
  const [withPred, setWithPred] = useState(false);
  const [sport, setSport] = useState<string>("soccer");
  const [matchId, setMatchId] = useState("");
  const [pick, setPick] = useState("");

  const matches = matchesBySport[sport] ?? [];
  const selected = matches.find((m) => String(m.id) === matchId);
  const drawAllowed = SPORTS.find((s) => s.code === sport)?.draw ?? false;
  const predReady = withPred && !!selected && !!pick;

  return (
    <form action={action} className="space-y-5">
      <input
        name="title"
        placeholder="제목 (예: [토트넘 vs 아스널] 북런던 더비 분석)"
        required
        maxLength={100}
        className={inputCls}
      />
      <textarea
        name="content"
        placeholder="분석 내용을 적어주세요."
        required
        rows={10}
        className={inputCls}
      />

      {/* 예측 토글 */}
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={withPred}
            onChange={(e) => setWithPred(e.target.checked)}
            className="accent-rose-600"
          />
          <span className="text-sm font-semibold">
            🎯 경기 예측 추가{" "}
            <span className="font-normal text-neutral-500">
              (적중 시 경험치 +{EXP_REWARDS.predictionHit})
            </span>
          </span>
        </label>

        {withPred && (
          <div className="mt-4 space-y-4">
            {/* 종목 */}
            <div className="flex flex-wrap gap-2">
              {SPORTS.map((s) => (
                <button
                  key={s.code}
                  type="button"
                  onClick={() => {
                    setSport(s.code);
                    setMatchId("");
                    setPick("");
                  }}
                  className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition ${
                    sport === s.code
                      ? "bg-rose-600 text-white border-rose-600"
                      : "border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  }`}
                >
                  {s.emoji} {s.label}
                </button>
              ))}
            </div>

            {/* 경기 선택 */}
            <select
              value={matchId}
              onChange={(e) => {
                setMatchId(e.target.value);
                setPick("");
              }}
              className={inputCls}
            >
              <option value="">
                {matches.length ? "경기를 선택하세요" : "예정 경기가 없습니다"}
              </option>
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>

            {/* 예상 (승/무/패) */}
            {selected && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPick("HOME")}
                  className={pickCls(pick === "HOME")}
                >
                  {selected.home} 승
                </button>
                {drawAllowed && (
                  <button
                    type="button"
                    onClick={() => setPick("DRAW")}
                    className={pickCls(pick === "DRAW")}
                  >
                    무
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPick("AWAY")}
                  className={pickCls(pick === "AWAY")}
                >
                  {selected.away} 승
                </button>
              </div>
            )}

            {/* hidden — 예측이 완성됐을 때만 서버로 전송 */}
            <input type="hidden" name="sport" value={predReady ? sport : ""} />
            <input type="hidden" name="matchId" value={predReady ? matchId : ""} />
            <input type="hidden" name="pick" value={predReady ? pick : ""} />
          </div>
        )}
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white py-2.5 text-sm font-semibold transition"
      >
        {pending ? "등록 중…" : "등록"}
      </button>
    </form>
  );
}
