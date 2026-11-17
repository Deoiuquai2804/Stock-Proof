import {
  AlertCircle,
  CheckCircle2,
  FileQuestion,
  UserCheck,
} from 'lucide-react';
import type { VerificationStatus } from '../types/stockproof.ts';

interface StatusBadgeProps {
  status: VerificationStatus;
  compact?: boolean;
}

export function StatusBadge({ status, compact = false }: StatusBadgeProps) {
  switch (status) {
    case 'Verified':
      return (
        <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium whitespace-nowrap text-xs">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{compact ? 'Verified' : 'Verified'}</span>
        </span>
      );
    case 'Mismatch':
      return (
        <span className="inline-flex items-center gap-1.5 text-red-700 font-medium whitespace-nowrap text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Mismatch</span>
        </span>
      );
    case 'Insufficient Evidence':
      return (
        <span className="inline-flex items-center gap-1.5 text-amber-700 font-medium whitespace-nowrap text-xs">
          <FileQuestion className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Insufficient Evidence</span>
        </span>
      );
    case 'Needs Human Review':
      return (
        <span className="inline-flex items-center gap-1.5 text-indigo-700 font-medium whitespace-nowrap text-xs">
          <UserCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Needs Human Review</span>
        </span>
      );
  }
}
