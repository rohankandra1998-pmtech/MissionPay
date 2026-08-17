import { progressPercent } from "../lib/format";

export function ProgressBar({ raised, goal, label }: { raised: number; goal: number; label?: string }) {
  const percent = progressPercent(raised, goal);
  return (
    <div className="progress-wrap">
      <div className="progress-track" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? `${percent}% funded`}>
        <span style={{ width: `${percent}%` }} />
      </div>
      {label && <span className="sr-only">{label}</span>}
    </div>
  );
}
