import { Check, Clock, AlertTriangle } from 'lucide-react';
import { COPY } from '../lib/i18n.ts';
import type {
  BuyerDecision,
  EvidenceReport,
  FujiAnchorRecord,
  Language,
} from '../types/stockproof.ts';

interface PipelineStepperProps {
  lang: Language;
  report: EvidenceReport | null;
  fujiAnchor: FujiAnchorRecord | null;
  buyerDecision: BuyerDecision;
}

export function PipelineStepper({
  lang,
  report,
  fujiAnchor,
  buyerDecision,
}: PipelineStepperProps) {
  const t = COPY[lang].pipeline;

  const hitlPending = (report?.summary.needsHumanReviewCount ?? 0) > 0;
  const hasFaults =
    (report?.summary.mismatchCount ?? 0) > 0 ||
    (report?.summary.insufficientEvidenceCount ?? 0) > 0;

  const steps: Array<{
    label: string;
    state: 'done' | 'action' | 'warn' | 'pending';
    detail: string;
  }> = [
    {
      label: t.buyerReceive,
      state: 'done',
      detail: 'HOSE: FPT · FY2025',
    },
    {
      label: t.sellerReport,
      state: 'done',
      detail: '10 claims',
    },
    {
      label: t.engineCheck,
      state: report ? (hasFaults ? 'warn' : 'done') : 'pending',
      detail: report
        ? `${report.summary.verifiedCount}/10 Verified`
        : 'Pending run',
    },
    {
      label: t.hitlStep,
      state: !report ? 'pending' : hitlPending ? 'action' : 'done',
      detail: hitlPending
        ? `${report?.summary.needsHumanReviewCount} pending`
        : 'Resolved',
    },
    {
      label: t.fujiAnchor,
      state: fujiAnchor ? 'done' : 'action',
      detail: fujiAnchor
        ? `Block #${fujiAnchor.blockNumber}`
        : 'Ready to anchor',
    },
    {
      label: t.buyerDecision,
      state:
        buyerDecision.decision === 'Accepted'
          ? 'done'
          : buyerDecision.decision === 'Revision Requested'
            ? 'warn'
            : 'pending',
      detail: buyerDecision.decision,
    },
  ];

  return (
    <div
      aria-label="Verification workflow progress"
      className="bg-white border border-slate-200 rounded-lg px-4 py-3"
    >
      <ol className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {steps.map((step) => (
          <li
            key={step.label}
            className="flex items-start gap-2.5 min-w-0"
          >
            <span className="mt-0.5 shrink-0">
              {step.state === 'done' && (
                <Check className="w-4 h-4 text-emerald-700" aria-hidden="true" />
              )}
              {step.state === 'warn' && (
                <AlertTriangle
                  className="w-4 h-4 text-amber-700"
                  aria-hidden="true"
                />
              )}
              {step.state === 'action' && (
                <Clock className="w-4 h-4 text-blue-700" aria-hidden="true" />
              )}
              {step.state === 'pending' && (
                <Clock className="w-4 h-4 text-slate-400" aria-hidden="true" />
              )}
            </span>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 truncate">
                {step.label}
              </div>
              <div className="text-xs text-slate-500 tabular-nums truncate">
                {step.detail}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
