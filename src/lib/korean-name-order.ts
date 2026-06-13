// 한국 선수 한글명이 "이름 성"(공백 2어절)으로 뒤집힌 경우를 "성이름"으로 교정.
// TheSports 공식 ko·haiku 음역이 "흥민 손"처럼 어순을 뒤집는 사례 대응 (반복 발생).
// 국적 판별은 영문명으로: 첫 토큰이 한국 성 로마자 + given name 하이픈(한국 RR) + 일본 성 아님.

// 한국 성 로마자 → 한글 (다중 표기 포함). 영문명 첫 토큰 매칭용.
export const KO_SURNAME: Record<string, string> = {
  Kim: "김", Lee: "이", Yi: "이", Rhee: "이", Park: "박", Pak: "박", Bak: "박",
  Choi: "최", Choe: "최", Jung: "정", Jeong: "정", Chung: "정", Kang: "강",
  Cho: "조", Jo: "조", Yoon: "윤", Yun: "윤", Jang: "장", Chang: "장",
  Lim: "임", Im: "임", Han: "한", Oh: "오", Seo: "서", Suh: "서",
  Shin: "신", Sin: "신", Kwon: "권", Gwon: "권", Hwang: "황", Ahn: "안", An: "안",
  Song: "송", Yoo: "유", Yu: "유", You: "유", Hong: "홍", Jeon: "전", Jun: "전",
  Ko: "고", Go: "고", Koh: "고", Moon: "문", Mun: "문", Yang: "양", Son: "손",
  Bae: "배", Baek: "백", Paek: "백", Paik: "백", Back: "백", Heo: "허", Hur: "허", Huh: "허",
  Nam: "남", Sim: "심", Shim: "심", Noh: "노", No: "노", Roh: "노", Ha: "하",
  Joo: "주", Ju: "주", Koo: "구", Gu: "구", Ku: "구", Min: "민", Ryu: "류", Ryoo: "류",
  Chae: "채", Cheon: "천", Chun: "천", Woo: "우", Ji: "지", Jin: "진", Na: "나",
  Wi: "위", Hyun: "현", Eom: "엄", Um: "엄", Gwak: "곽", Kwak: "곽", Seol: "설",
};

// 일본 성 함정: Ryu/Yu/Jin/Ko 같은 일본 given name 이 한국 성으로 오탐되는 케이스.
// 일본명 한국 표기는 "구타니 류"(성 이름 공백 유지)가 관례라 교정 금지 — 영문 2번째 토큰(일본 성)으로 식별.
export const JP_SURNAME = new Set<string>([
  "Kutani", "Nakada", "Murata", "Tabei", "Itakura", "Tanaka", "Suzuki", "Sato",
  "Watanabe", "Ito", "Ueda", "Osako", "Taniguchi", "Sugawara", "Kamada", "Doan",
  "Maeda", "Nakamura", "Ogawa", "Kubo", "Tomiyasu", "Nagatomo", "Seko", "Machino",
  "Sano", "Hayakawa", "Goto", "Shiogai", "Yamamoto", "Kobayashi", "Yoshida",
]);

// 뒤집힌 한국 한글명 교정. 해당 없으면 입력 그대로 반환 (멱등).
export function deReverseKoreanName(ko: string, engName: string): string {
  if (!ko || !ko.includes(" ")) return ko;
  const koTokens = ko.trim().split(/\s+/);
  if (koTokens.length !== 2) return ko; // 정확히 2어절만
  const engTokens = engName.trim().split(/\s+/);
  const surnameKo = KO_SURNAME[engTokens[0]];
  if (!surnameKo) return ko; // 영문 첫 토큰이 한국 성 로마자 아님
  if (koTokens[1] !== surnameKo) return ko; // 한글 성자가 끝에 와야 = 뒤집힘 (일본명은 성이 앞이라 제외)
  const given = engTokens[1] ?? "";
  if (JP_SURNAME.has(given)) return ko; // 일본 성 함정 — 교정 금지
  if (!given.includes("-")) return ko; // 한국 RR given name 은 하이픈(예: Heung-min) — 국적 확증, 일본·서구 배제
  return koTokens[1] + koTokens[0]; // 성 + 이름 결합 ("흥민 손" → "손흥민")
}
