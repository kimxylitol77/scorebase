// 라인업 전술판 빌더 공용 타입 — page·LineupBuilder·Pitch·CandidatePanel 공유(순환 import 방지).
import type { Pos } from "@/lib/lineup/formations";

// 빌더가 쓰는 선수 필드만 (page가 슬림 매핑해 전달, radar 등 무거운 필드 제외).
export interface PoolPlayer {
  id: string;
  name: string;
  pos: Pos;
  ovr: number;
  team: string;
  photo: string | null;
  clubKey: string; // 클럽 그룹 키(정규화)
}

// 클럽 가져오기 드롭다운용 메타.
export interface ClubMeta {
  key: string; // 정규화 그룹 키
  label: string; // 대표 표기(최다)
  league: string;
  count: number;
  canBest11: boolean; // GK1/DF4/MF3/FW3 충족 여부
}
