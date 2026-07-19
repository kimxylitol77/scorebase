// /lab 손잡이 표시용 메타 — 서버(비회원 미리보기)와 클라이언트(슬라이더)가 공유하는 순수 상수.
import type { BotKnobs } from "@/lib/predict/member-bot";

export interface KnobMeta {
  key: keyof BotKnobs;
  label: string;
  desc: string;
}

export const KNOB_METAS: KnobMeta[] = [
  { key: "elo", label: "팀 체급", desc: "Elo 레이팅 격차를 얼마나 반영할지" },
  { key: "form", label: "최근 기세", desc: "최근 5경기 승점 흐름 — 100%는 무반영, 높일수록 상승세 팀 가산" },
  { key: "home", label: "홈 이점", desc: "홈 어드밴티지의 크기" },
  { key: "market", label: "대중 시선", desc: "배당 시장 의견을 섞는 비율" },
  { key: "underdog", label: "언더독 성향", desc: "높일수록 약팀 쪽 확률을 끌어올림" },
];

export interface KnobPreset {
  name: string;
  knobs: BotKnobs;
}

export const KNOB_PRESETS: KnobPreset[] = [
  {
    name: "스코어베이스 기본",
    knobs: { elo: 1, form: 1, home: 1, market: 1, underdog: 1 },
  },
  {
    name: "홈팀 신봉자",
    knobs: { elo: 1, form: 1, home: 1.8, market: 0.7, underdog: 0.8 },
  },
  {
    name: "언더독 헌터",
    knobs: { elo: 0.9, form: 1.1, home: 1, market: 0.6, underdog: 1.6 },
  },
];
