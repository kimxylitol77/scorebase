// 예정 경기 시간 칸 — 평소엔 "19:00", 킥오프가 지났는데 소스가 계속 "시작 전"이면 "중계 정보 없음"을 흐리게 두 줄로.
// 좁은 시간 칸(44~60px)에서 한 글자씩 세로로 깨지지 않게 줄바꿈 위치를 고정한다.
export const NO_COVERAGE_LABEL = "중계 정보 없음";

/** 킥오프 후 이만큼 지나도 "시작 전"이면 중계 정보가 없는 것으로 본다 */
export const NO_COVERAGE_AFTER_MS = 15 * 60_000;

export default function ScheduledTime({ label, className }: { label: string; className?: string }) {
  if (label !== NO_COVERAGE_LABEL) return <span className={className}>{label}</span>;
  return (
    <span
      className="inline-block text-[10px] font-normal leading-tight text-neutral-400 dark:text-neutral-500 break-keep"
      title="데이터 제공사가 이 경기의 실시간 정보를 주지 않고 있습니다"
    >
      중계 정보
      <br />
      없음
    </span>
  );
}
