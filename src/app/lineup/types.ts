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
  number: number | null; // 등번호 (team-squads 공식 스쿼드 기준, 없으면 null)
  clubKey: string; // 클럽 그룹 키 (스쿼드 클럽 = "ts-{teamId}", 검색 전용 = 정규화 팀명)
  isNew?: boolean; // 이번 여름 이적창 신규 영입 (NEW 배지)
}

// 마지막 경기 확정 선발 11명 — TheSports lineup cache 에서 서버가 추출(좌표는 보드 세로 좌표로 변환 완료).
export interface LastXI {
  f: string | null; // 그 경기 포메이션 문자열 ("4-2-3-1" 등, 프리셋에 없을 수 있음)
  players: Array<{ pid: string; name: string; pos: Pos; x: number; y: number }>;
}

// 클럽 가져오기 드롭다운용 메타.
export interface ClubMeta {
  key: string; // 그룹 키 (ts-{teamId} / wc-{nation})
  label: string; // 한글 표기
  league: string;
  count: number;
  canBest11: boolean; // GK1/DF4/MF3/FW3 충족 여부
  coachName?: string | null; // 감독 한글명 (team-coaches)
  coachFormation?: string | null; // 감독 선호 포메이션 ("4-4-2" 등)
  lastXI?: LastXI; // 마지막 경기 선발 — 있으면 클럽 불러오기 기본 배치로 사용
}
