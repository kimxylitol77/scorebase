// 점수 변화 사운드 ON/OFF 토글 — /scores 페이지 헤더 등에 mount.
// LiveScoresBar 의 점수 감지 로직이 localStorage("scorebase-live-sound") 를
// 직접 읽어서 chime 재생. 이 컴포넌트는 토글 UI + localStorage 쓰기 + 동기화 이벤트만 담당.

"use client";

import { playChime, unlockAudio } from "@/lib/sound/chime";
import { useClientValue, subscribeToStorage } from "@/lib/use-client-value";

const STORAGE_KEY = "scorebase-live-sound";
const CHANGE_EVENT = "scorebase-sound-change";

function readSoundOn(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // localStorage 비활성 환경 — OFF 로 본다
    return false;
  }
}

// 상태의 원본은 localStorage 다. 다른 탭(storage)·같은 페이지(custom event) 변경을
// 모두 구독하므로 setState 로 따로 복제할 필요가 없다.
const subscribe = subscribeToStorage(CHANGE_EVENT);

export default function LiveSoundToggle() {
  const soundOn = useClientValue(readSoundOn, false, subscribe);

  function toggle() {
    const next = !soundOn;
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      // 같은 페이지의 다른 컴포넌트 (LiveScoresBar 등) 도 즉시 반영하도록 custom event
      window.dispatchEvent(
        new CustomEvent(CHANGE_EVENT, { detail: { soundOn: next } }),
      );
    } catch {
      // ignore
    }
    if (next) {
      // 첫 ON 클릭은 user gesture — AudioContext 활성화 + sample chime
      unlockAudio();
      playChime();
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={soundOn}
      aria-label={soundOn ? "점수 변화 사운드 끄기" : "점수 변화 사운드 켜기"}
      title={soundOn ? "점수 변화 시 사운드 ON (클릭 OFF)" : "점수 변화 시 사운드 OFF (클릭 ON)"}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold transition ${
        soundOn
          ? "bg-rose-100 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 hover:bg-rose-200 dark:hover:bg-rose-500/25"
          : "bg-neutral-100 dark:bg-neutral-800/60 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800"
      }`}
    >
      {soundOn ? (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          <span>골 알림 ON</span>
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
            <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
            <path d="M18 8a6 6 0 0 0-9.33-5" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
          <span>골 알림</span>
        </>
      )}
    </button>
  );
}

export { STORAGE_KEY as SOUND_STORAGE_KEY, CHANGE_EVENT as SOUND_CHANGE_EVENT };
