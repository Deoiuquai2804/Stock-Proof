import { useState } from 'react';
import {
  CheckCircle2,
  MinusCircle,
  ShieldAlert,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import { COPY } from '../lib/i18n.ts';
import type { Language, VerifiedClaimResult } from '../types/stockproof.ts';
import { StatusBadge } from './StatusBadge.tsx';

interface ClaimInspectorProps {
  claim: VerifiedClaimResult | null;
  lang: Language;
  onClose: () => void;
  onSubmitHitl: (
    claimId: string,
    payload: {
      decision: 'Verified' | 'Mismatch';
      reviewerName: string;
      reviewerRole: string;
      note: string;
    },
  ) => Promise<void>;
}

function formatNum(value: number | null, unit: string): string {
  if (value === null) return '—';
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value);
  return `${formatted} ${unit}`;
}

export function ClaimInspector({
  claim,
  lang,
  onClose,
  onSubmitHitl,
}: ClaimInspectorProps) {
  const t = COPY[lang].inspector;
  const [reviewerName, setReviewerName] = useState('Nguyen Minh Tuan, CPA');
  const [reviewerRole, setReviewerRole] = useState('Lead Financial Auditor');
  const [note, setNote] = useState(
    'Reviewed Note V.28 R&D software capitalization schedule; management adjustment is properly disclosed and reconciled.',
  );
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!claim) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-6 text-sm text-slate-500">
        <h2 className="font-display text-base font-semibold text-slate-900 mb-1">
          {t.title}
        </h2>
        <p>{t.selectPrompt}</p>
      </div>
    );
  }

  const metricName = lang === 'vi' ? claim.metricNameVi : claim.metricNameEn;
  const reason = lang === 'vi' ? claim.reasonVi : claim.reasonEn;
  const showHitlForm =
    claim.autoStatus === 'Needs Human Review' || claim.hitlResolution !== null;

  const handleDecision = async (decision: 'Verified' | 'Mismatch') => {
    setErrorMsg(null);
    if (!reviewerName.trim() || !note.trim()) {
      setErrorMsg('Reviewer name and audit rationale are required.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmitHitl(claim.claimId, {
        decision,
        reviewerName: reviewerName.trim(),
        reviewerRole: reviewerRole.trim(),
        note: note.trim(),
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to record HITL decision',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      aria-label={`Audit details for ${claim.claimId}`}
      className="bg-white border border-slate-200 rounded-lg overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 font-mono tabular-nums">
            <span className="font-semibold text-slate-800 whitespace-nowrap">
              {claim.claimId}
            </span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{claim.metricCode}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-base font-semibold text-slate-900">
              {metricName}
            </h2>
            <StatusBadge status={claim.finalStatus} />
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close claim inspector"
          className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-5 border-b border-slate-200">
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">
              {t.sellerSubmitted}
            </div>
            <div className="text-lg font-mono font-semibold text-slate-900 tabular-nums">
              {formatNum(claim.sellerValue, claim.sellerUnit)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5 font-mono">
              Period: {claim.sellerPeriod}
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">
              {t.groundTruth}
            </div>
            <div className="text-lg font-mono font-semibold text-slate-900 tabular-nums">
              {formatNum(claim.standardValue, claim.standardUnit)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5 font-mono">
              Period: {claim.standardPeriod}
            </div>
          </div>
        </div>

        <div className="text-sm text-slate-700 leading-relaxed">{reason}</div>

        <div>
          <h3 className="text-xs font-semibold text-slate-700 mb-2.5">
            {t.ruleBreakdown}
          </h3>
          <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
            {claim.rules.map((rule) => {
              const msg = lang === 'vi' ? rule.messageVi : rule.messageEn;
              return (
                <div
                  key={rule.rule}
                  className="px-3.5 py-2.5 flex items-start gap-2.5 text-xs"
                >
                  <span className="mt-0.5 shrink-0">
                    {rule.outcome === 'pass' && (
                      <CheckCircle2
                        className="w-4 h-4 text-emerald-700"
                        aria-hidden="true"
                      />
                    )}
                    {rule.outcome === 'fail' && (
                      <XCircle
                        className="w-4 h-4 text-red-700"
                        aria-hidden="true"
                      />
                    )}
                    {rule.outcome === 'warn' && (
                      <ShieldAlert
                        className="w-4 h-4 text-indigo-700"
                        aria-hidden="true"
                      />
                    )}
                    {rule.outcome === 'skip' && (
                      <MinusCircle
                        className="w-4 h-4 text-slate-400"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">
                        {rule.rule}
                      </span>
                      <span className="font-mono text-slate-500 truncate">
                        {rule.actual}
                      </span>
                    </div>
                    <p className="text-slate-600 mt-0.5">{msg}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-slate-200 text-xs">
          <h3 className="font-semibold text-slate-700">
            {t.sourceComparison}
          </h3>
          <div>
            <span className="text-slate-500">{t.sellerSource}: </span>
            <span className="text-slate-900 font-medium">
              {claim.sellerSourceRef || t.missingSource}
            </span>
          </div>
          <div>
            <span className="text-slate-500">{t.standardSource}: </span>
            <span className="text-slate-900 font-medium">
              {claim.standardSource}
            </span>
          </div>
        </div>

        {showHitlForm && (
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-indigo-800">
              <UserCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>
                {claim.hitlResolution
                  ? t.hitlResolvedHeading
                  : t.hitlHeading}
              </span>
            </div>

            {claim.hitlResolution && (
              <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                <div>
                  Decision: <strong>{claim.hitlResolution.decision}</strong>
                </div>
                <div>
                  Auditor: {claim.hitlResolution.reviewerName} (
                  {claim.hitlResolution.reviewerRole})
                </div>
                <div>Note: {claim.hitlResolution.note}</div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="hitl-reviewer-name"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  {t.reviewerName}
                </label>
                <input
                  id="hitl-reviewer-name"
                  type="text"
                  value={reviewerName}
                  onChange={(e) => setReviewerName(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label
                  htmlFor="hitl-reviewer-role"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  {t.reviewerRole}
                </label>
                <input
                  id="hitl-reviewer-role"
                  type="text"
                  value={reviewerRole}
                  onChange={(e) => setReviewerRole(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="hitl-note"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                {t.rationale}
              </label>
              <textarea
                id="hitl-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-blue-600"
              />
            </div>

            {errorMsg && (
              <p role="alert" className="text-xs text-red-700">
                {errorMsg}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleDecision('Verified')}
                className="px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
              >
                {submitting ? t.submitting : t.approveBtn}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleDecision('Mismatch')}
                className="px-4 py-2 text-xs font-medium text-red-700 bg-white border border-red-300 hover:bg-red-50 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
              >
                {t.flagBtn}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
