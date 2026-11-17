import { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import { COPY } from '../lib/i18n.ts';
import type {
  GroundTruthItem,
  Language,
  SellerClaim,
} from '../types/stockproof.ts';

interface SellerGroundTruthViewProps {
  sellerClaims: SellerClaim[];
  groundTruth: GroundTruthItem[];
  lang: Language;
  isVerifying: boolean;
  onSubmitCustomClaims: (claims: SellerClaim[]) => Promise<void>;
}

export function SellerGroundTruthView({
  sellerClaims,
  groundTruth,
  lang,
  isVerifying,
  onSubmitCustomClaims,
}: SellerGroundTruthViewProps) {
  const t = COPY[lang].sellerView;
  const [subTab, setSubTab] = useState<'seller' | 'truth'>('seller');
  const [draftClaims, setDraftClaims] = useState<SellerClaim[]>(sellerClaims);

  useEffect(() => {
    setDraftClaims(sellerClaims);
  }, [sellerClaims]);

  const updateField = (
    index: number,
    field: keyof SellerClaim,
    value: string | number | null,
  ) => {
    setDraftClaims((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900">
            {t.heading}
          </h1>
          <p className="text-sm text-slate-600 mt-1">{t.subheading}</p>
        </div>

        <button
          type="button"
          disabled={isVerifying}
          onClick={() => onSubmitCustomClaims(draftClaims)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Play className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{t.applyVerify}</span>
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
          <div
            role="tablist"
            className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
          >
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'seller'}
              onClick={() => setSubTab('seller')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                subTab === 'seller'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.tabSeller}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'truth'}
              onClick={() => setSubTab('truth')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                subTab === 'truth'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.tabTruth}
            </button>
          </div>
        </div>

        {subTab === 'seller' ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                  <th className="py-2.5 px-4">Claim</th>
                  <th className="py-2.5 px-3">Seller Value</th>
                  <th className="py-2.5 px-3">Unit</th>
                  <th className="py-2.5 px-3">Period</th>
                  <th className="py-2.5 px-4 min-w-[260px]">Source Citation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {draftClaims.map((claim, idx) => (
                  <tr key={claim.claimId} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4">
                      <div className="font-mono text-slate-500">
                        {claim.claimId}
                      </div>
                      <div className="font-medium text-slate-900 text-sm">
                        {lang === 'vi' ? claim.metricNameVi : claim.metricNameEn}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="number"
                        step="any"
                        aria-label={`Seller value for ${claim.claimId}`}
                        value={claim.sellerValue ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          updateField(
                            idx,
                            'sellerValue',
                            raw === '' ? null : Number(raw),
                          );
                        }}
                        className="w-32 px-2.5 py-1.5 font-mono tabular-nums text-right border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-blue-600"
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="text"
                        aria-label={`Unit for ${claim.claimId}`}
                        value={claim.unit}
                        onChange={(e) =>
                          updateField(idx, 'unit', e.target.value)
                        }
                        className="w-24 px-2.5 py-1.5 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-blue-600"
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="text"
                        aria-label={`Period for ${claim.claimId}`}
                        value={claim.period}
                        onChange={(e) =>
                          updateField(idx, 'period', e.target.value)
                        }
                        className="w-24 px-2.5 py-1.5 font-mono border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-blue-600"
                      />
                    </td>
                    <td className="py-2.5 px-4">
                      <input
                        type="text"
                        aria-label={`Source citation for ${claim.claimId}`}
                        value={claim.sourceRef}
                        placeholder="Missing source citation..."
                        onChange={(e) =>
                          updateField(idx, 'sourceRef', e.target.value)
                        }
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md text-slate-900 placeholder:text-amber-600 focus:outline-none focus:border-blue-600"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                  <th className="py-2.5 px-4">Claim</th>
                  <th className="py-2.5 px-3 text-right">Standard Value</th>
                  <th className="py-2.5 px-3">Unit</th>
                  <th className="py-2.5 px-3">Period</th>
                  <th className="py-2.5 px-3">Formula Rule</th>
                  <th className="py-2.5 px-4">Authoritative Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {groundTruth.map((gt) => (
                  <tr key={gt.claimId} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <div className="font-mono text-slate-500">
                        {gt.claimId} · {gt.metricCode}
                      </div>
                      <div className="font-medium text-slate-900 text-sm">
                        {lang === 'vi' ? gt.metricNameVi : gt.metricNameEn}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {new Intl.NumberFormat('en-US', {
                        maximumFractionDigits: 2,
                      }).format(gt.standardValue)}
                    </td>
                    <td className="py-3 px-3 text-slate-700">{gt.unit}</td>
                    <td className="py-3 px-3 font-mono text-slate-700">
                      {gt.period}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-600">
                      {gt.formulaExpression ?? 'Direct audited item'}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <div className="font-medium text-slate-800">
                        {gt.sourceDocument}
                      </div>
                      <div>{gt.sourcePageRef}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
