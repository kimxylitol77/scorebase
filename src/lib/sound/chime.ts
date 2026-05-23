// Web Audio API 로 합성한 짧은 chime (외부 mp3 파일 없이).
// iOS 알림 톤 같은 2-tone ding ding. 골/점수 변화 시 재생.
//
// 브라우저 자동재생 정책 — 첫 user gesture (클릭) 이후 AudioContext 활성화 가능.
// playChime() 자체가 user gesture 안에서 처음 호출되면 그 후엔 자유롭게 재생.
//
// 사용처: ScoresLiveCards 의 점수 변화 감지 useEffect 에서 호출.

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * 짧은 2-tone chime 재생 (~300ms).
 * 음정: A5 (880Hz) → D6 (1175Hz) 상승 — "점수 났어" 느낌의 밝은 톤.
 */
export function playChime(): void {
  const c = getContext();
  if (!c) return;
  // suspended 상태면 resume (iOS Safari 등)
  if (c.state === "suspended") {
    c.resume().catch(() => {});
  }

  const now = c.currentTime;
  const tones: Array<{ delay: number; freq: number }> = [
    { delay: 0, freq: 880 },     // A5
    { delay: 0.13, freq: 1175 }, // D6
  ];

  for (const { delay, freq } of tones) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.frequency.value = freq;
    osc.type = "sine";
    // 짧은 attack + 부드러운 decay
    gain.gain.setValueAtTime(0, now + delay);
    gain.gain.linearRampToValueAtTime(0.25, now + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.3);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(now + delay);
    osc.stop(now + delay + 0.32);
  }
}

/**
 * AudioContext 가 비활성 상태면 활성화. 토글 ON 첫 클릭 등 user gesture 안에서 호출.
 * 이후 백그라운드 polling 에서 playChime() 자유롭게 동작.
 */
export function unlockAudio(): void {
  const c = getContext();
  if (c && c.state === "suspended") {
    c.resume().catch(() => {});
  }
}
