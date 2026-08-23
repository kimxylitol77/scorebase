// BaseballPlayerSeo (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
import { athleteLd, breadcrumbLd, jsonLdScript } from "@/lib/seo/jsonld";

// 받침 유무로 조사 선택 (한글 음절만 판정; 그 외는 모음형)
function josa(w: string, batchim: string, none: string): string {
  const c = w.charCodeAt(w.length - 1);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 !== 0 ? batchim : none;
  return none;
}

export interface BaseballSeoProps {
  name: string; // 한글 표시명
  league: "MLB" | "KBO" | "NPB";
  path: string; // canonical 경로 (/players/{pid} 또는 ?league= 포함)
  team?: string | null; // 한글 팀명
  position?: string | null; // "투수" · "외야수" 등 한글 (없으면 생략)
  photo?: string | null;
  height?: string | null; // "6' 4\"" · "193cm"
  weight?: string | null; // "215 lbs" · "104kg"
  statLine?: string | null; // "2026 시즌 타율 .312, 24홈런 80타점을 기록 중이다." (문장 완성형)
}

// 소개 문단 — 있는 값만 이어붙임.
function buildAbout(p: BaseballSeoProps): string {
  const role = p.position ? p.position : "Baseball player";
  const parts = [
    `${p.name}${josa(p.name, "", "")} ${p.team ? `${p.team} · ` : ""}${p.league} ${role}.`,
  ];
  if (p.statLine) parts.push(p.statLine);
  return parts.join(" ");
}

export default function BaseballPlayerSeo(props: BaseballSeoProps) {
  const about = buildAbout(props);
  const personLd = athleteLd({
    name: props.name,
    path: props.path,
    image: props.photo ?? null,
    jobTitle: `${props.league} ${props.position ?? "Baseball player"}`,
    height: props.height ?? null,
    weight: props.weight ?? null,
    team: props.team ? { name: props.team } : null,
    description: about,
  });
  const crumbLd = breadcrumbLd([
    { name: "Home", path: "/" },
    { name: "Baseball", path: "/baseball" },
    { name: props.league, path: `/leagues/${props.league}` },
    { name: props.name, path: props.path },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(personLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(crumbLd) }} />
      <section className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
        <h2 className="sr-only">{props.name} Player profile</h2>
        <p>{about}</p>
      </section>
    </>
  );
}
