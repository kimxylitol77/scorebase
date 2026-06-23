// 팀 로고 배지 — 팀 이름 옆에 붙는 로고(Team.logoUrl). 로고 없으면 아무것도 안 그림(graceful).
// 팀 이름이 보이는 곳엔 이 컴포넌트로 로고를 따라붙인다. 스킬: scorebase-team-logo.
type Props = { logoUrl?: string | null; size?: number; className?: string };

export default function TeamBadge({ logoUrl, size = 20, className = "" }: Props) {
  if (!logoUrl) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className={`object-contain shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
