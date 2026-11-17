import { useState } from 'react';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { COPY } from '../lib/i18n.ts';
import { canAcceptBuyerReport } from '../lib/verification.ts';
import type {
  BuyerDecision,
  EvidenceReport,
  Language,
} from '../types/stockproof.ts';

interface BuyerDecisionBarProps {
  report: EvidenceReport | null;
  buyerDecision: BuyerDecision;
  lang: Language;
  onSubmitDecision: (payload: {
    decision: 'Accepted' | 'Revision Requested';
    buyerName: string;
    note: string;
  }) => Promise<void>;
}

export function BuyerDecisionBar({
  report,
  buyerDecision,
  lang,
  onSubmitDecision,
}: BuyerDecisionBarProps) {
  const t = COPY[lang].buyerBar;
  const [note, setNote] = useState(buyerDecision.note || '');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const acceptCheck = canAcceptBuyerReport(report);

  const handleAction = async (decision: 'Accepted' | 'Revision Requested') => {
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await onSubmitDecision({
        decision,
        buyerName: buyerDecision.buyerName || 'VietCap Institutional Desk',
        note: note.trim(),
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to submit buyer decision',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      aria-label={t.heading}
      className="bg-white border border-slate-200 rounded-lg p-5 space-y-4"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900">
            {t.heading}
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            {acceptCheck.allowed
              ? t.ready
              : report?.summary.needsHumanReviewCount
                ? t.blockedHitl
                : t.blockedMismatch}
          </p>
        </div>

        {buyerDecision.decision !== 'Pending' && (
          <div className="text-sm font-medium text-slate-900 flex items-center gap-2">
            {buyerDecision.decision === 'Accepted' ? (
              <CheckCircle2
                className="w-4 h-4 text-emerald-700 shrink-0"
                aria-hidden="true"
              />
            ) : (
              <RotateCcw
                className="w-4 h-4 text-amber-700 shrink-0"
                aria-hidden="true"
              />
            )}
            <span>
              {t.decidedPrefix}{' '}
              <strong
                className={
                  buyerDecision.decision === 'Accepted'
                    ? 'text-emerald-700'
                    : 'text-amber-700'
                }
              >
                {buyerDecision.decision}
              </strong>
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t.notePlaceholder}
          aria-label={t.notePlaceholder}
          className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
        />

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={submitting || !acceptCheck.allowed}
            onClick={() => handleAction('Accepted')}
            title={
              acceptCheck.allowed
                ? t.acceptBtn
                : lang === 'vi'
                  ? acceptCheck.reasonVi
                  : acceptCheck.reasonEn
            }
            className="px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-500 rounded-lg transition-colors whitespace-nowrap"
          >
            {t.acceptBtn}
          </button>

          <button
            type="button"
            disabled={submitting || !report}
            onClick={() => handleAction('Revision Requested')}
            className="px-4 py-2 text-sm font-medium text-amber-800 bg-white border border-amber-300 hover:bg-amber-50 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
          >
            {t.revisionBtn}
          </button>
        </div>
      </div>

      {errorMsg && (
        <p role="alert" className="text-xs text-red-700">
          {errorMsg}
        </p>
      )}
    </section>
  );
}
