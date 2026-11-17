interface DonutChartProps {
  verified: number;
  mismatch: number;
  insufficient: number;
  needsReview: number;
}

export function DonutChart({
  verified,
  mismatch,
  insufficient,
  needsReview,
}: DonutChartProps) {
  const total = verified + mismatch + insufficient + needsReview;
  const radius = 56;
  const circumference = 2 * Math.PI * radius;

  const segments = [
    { label: 'Đã xác minh', value: verified, color: '#22C55E' },
    { label: 'Sai lệch', value: mismatch, color: '#EF4444' },
    { label: 'Thiếu bằng chứng', value: insufficient, color: '#F59E0B' },
    { label: 'Cần duyệt thủ công', value: needsReview, color: '#06B6D4' },
  ];

  let cumulativeOffset = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative h-40 w-40 shrink-0 flex items-center justify-center">
        <svg viewBox="0 0 144 144" className="h-40 w-40 -rotate-90">
          <circle
            cx="72"
            cy="72"
            r={radius}
            fill="none"
            stroke="#1E293B"
            strokeWidth="16"
          />
          {total > 0 &&
            segments.map((seg) => {
              if (seg.value === 0) return null;
              const dashLength = (seg.value / total) * circumference;
              const dashOffset = -cumulativeOffset;
              cumulativeOffset += dashLength;
              return (
                <circle
                  key={seg.label}
                  cx="72"
                  cy="72"
                  r={radius}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth="16"
                  strokeDasharray={`${dashLength} ${circumference}`}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="butt"
                />
              );
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-semibold text-[#F8FAFC] tabular-nums">
            {total}
          </span>
          <span className="text-[11px] uppercase tracking-wider text-[#94A3B8]">
            Chỉ tiêu
          </span>
        </div>
      </div>

      <div className="flex-1 w-full space-y-2.5">
        {segments.map((seg) => {
          const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0;
          return (
            <div
              key={seg.label}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="h-2.5 w-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="text-[#CBD5E1] truncate">{seg.label}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 tabular-nums">
                <span className="font-semibold text-[#F8FAFC]">{seg.value}</span>
                <span className="text-xs text-[#94A3B8] w-9 text-right">
                  {pct}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
