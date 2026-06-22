// 라인업 전술판 상태 ↔ 공유 URL 문자열(base64url) 인코딩/디코딩. 빌더(브라우저)·OG 카드(노드) 공용.
// 슬롯키는 저장하지 않는다 — 포메이션이 슬롯 순서를 고정하므로 픽을 순서대로 11칸 배열로만 보관.

// 픽: 실선수 = pid 문자열, 커스텀 = { n: 이름 }, 빈자리 = null.
export type SlotPick = string | { n: string };

export interface LineupState {
  f: string; // 포메이션 key
  t: string; // 팀명(타이틀)
  s: string; // 부제
  k: string; // 키트색 key
  p: (SlotPick | null)[]; // 슬롯 순서대로
}

function b64urlEncode(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 =
    typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(code: string): string {
  const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
  const bin =
    typeof atob !== "undefined" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeLineup(state: LineupState): string {
  return b64urlEncode(JSON.stringify(state));
}

export function decodeLineup(code: string): LineupState | null {
  try {
    const obj = JSON.parse(b64urlDecode(code));
    if (!obj || typeof obj.f !== "string" || !Array.isArray(obj.p)) return null;
    return obj as LineupState;
  } catch {
    return null;
  }
}

// 픽 배열에서 실선수 pid만 추출 (OG 카드가 풀에서 조회할 대상).
export function pidsFrom(picks: (SlotPick | null)[]): string[] {
  const ids: string[] = [];
  for (const p of picks) if (typeof p === "string") ids.push(p);
  return ids;
}
