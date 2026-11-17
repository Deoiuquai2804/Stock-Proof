import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileSearch,
  UserCheck,
  XCircle,
} from 'lucide-react';
import type { ClaimReviewState, ReportRecord } from '../types/stockproof';

interface StatusBadgeProps {
  status: ClaimReviewState | ReportRecord['status'] | string;
  compact?: boolean;
}

const VI_LABELS: Record<string, string> = {
  VERIFIED: 'Đã xác minh',
  ACCEPTED: 'Đã chấp nhận',
  MISMATCH: 'Sai lệch',
  PARTIAL_MISMATCH: 'Có sai lệch',
  'REVISION REQUESTED': 'Yêu cầu chỉnh sửa',
  'INSUFFICIENT EVIDENCE': 'Thiếu bằng chứng',
  'NEEDS HUMAN REVIEW': 'Cần duyệt thủ công',
  PENDING_REVIEW: 'Chờ duyệt HITL',
  EXTRACTED: 'Đã trích xuất',
  PENDING: 'Đang chờ',
};

export function StatusBadge({ status, compact = false }: StatusBadgeProps) {
  const normalized = status.toUpperCase();
  const displayLabel = VI_LABELS[normalized] || status;

  let colorClass = 'text-[#94A3B8]';
  let Icon = Clock;

  if (normalized === 'VERIFIED' || normalized === 'ACCEPTED') {
    colorClass = 'text-[#22C55E]';
    Icon = CheckCircle2;
  } else if (
    normalized === 'MISMATCH' ||
    normalized === 'PARTIAL_MISMATCH' ||
    normalized === 'REVISION REQUESTED'
  ) {
    colorClass = 'text-[#EF4444]';
    Icon = XCircle;
  } else if (normalized === 'INSUFFICIENT EVIDENCE') {
    colorClass = 'text-[#F59E0B]';
    Icon = AlertTriangle;
  } else if (
    normalized === 'NEEDS HUMAN REVIEW' ||
    normalized === 'PENDING_REVIEW'
  ) {
    colorClass = 'text-[#06B6D4]';
    Icon = UserCheck;
  } else if (normalized === 'EXTRACTED') {
    colorClass = 'text-[#3B82F6]';
    Icon = FileSearch;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium tracking-tight whitespace-nowrap ${
        compact ? 'text-xs' : 'text-[13px]'
      } ${colorClass}`}
    >
      <Icon className={compact ? 'h-3.5 w-3.5 shrink-0' : 'h-4 w-4 shrink-0'} />
      <span>{displayLabel}</span>
    </span>
  );
}
