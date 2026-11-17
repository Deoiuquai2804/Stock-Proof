import { ChevronRight, Search } from 'lucide-react';
import { COPY } from '../lib/i18n.ts';
import type {
  Language,
  VerificationStatus,
  VerifiedClaimResult,
} from '../types/stockproof.ts';
import { StatusBadge } from './StatusBadge.tsx';

export type StatusFilter = 'All' | VerificationStatus;

interface ClaimsTableProps {
  claims: VerifiedClaimResult[];
  selectedClaimId: string | null;
  onSelectClaim: (claimId: string) => void;
  statusFilter: StatusFilter;
  onChangeFilter: (filter: StatusFilter) => void;
  searchQuery: string;
  onChangeSearch: (query: string) => void;
  lang: Language;
}

function formatNum(value: number | null, unit: string): string {
  if (value === null) return '—';
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value);
  return `${formatted} ${unit}`;
}

export function ClaimsTable({
  claims,
  selectedClaimId,
  onSelectClaim,
  statusFilter,
  onChangeFilter,
  searchQuery,
  onChangeSearch,
  lang,
}: ClaimsTableProps) {
  const t = COPY[lang].table;

  const counts = {
    All: claims.length,
    Verified: claims.filter((c) => c.finalStatus === 'Verified').length,
    Mismatch: claims.filter((c) => c.finalStatus === 'Mismatch').length,
    'Insufficient Evidence': claims.filter(
      (c) => c.finalStatus === 'Insufficient Evidence',
    ).length,
    'Needs Human Review': claims.filter(
      (c) => c.finalStatus === 'Needs Human Review',
    ).length,
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filtered = claims.filter((c) => {
    const matchesStatus =
      statusFilter === 'All' || c.finalStatus === statusFilter;
    if (!matchesStatus) return false;
    if (!normalizedQuery) return true;
    const haystack = [
      c.claimId,
      c.metricCode,
      c.metricNameEn,
      c.metricNameVi,
      c.reasonEn,
      c.reasonVi,
      c.sellerSourceRef,
      c.standardSource,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  const filterTabs: Array<{ id: StatusFilter; label: string }> = [
    { id: 'All', label: `${t.all} (${counts.All})` },
    { id: 'Verified', label: `Verified (${counts.Verified})` },
    { id: 'Mismatch', label: `Mismatch (${counts.Mismatch})` },
    {
      id: 'Insufficient Evidence',
      label: `Insufficient (${counts['Insufficient Evidence']})`,
    },
    {
      id: 'Needs Human Review',
      label: `HITL Review (${counts['Needs Human Review']})`,
    },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Filter claims by verification status"
          className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg"
        >
          {filterTabs.map((tab) => {
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onChangeFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full lg:w-72 shrink-0">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onChangeSearch(e.target.value)}
            placeholder={t.searchPlaceholder}
            aria-label={t.searchPlaceholder}
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <th scope="col" className="py-2.5 px-4 whitespace-nowrap">
                {t.colClaim}
              </th>
              <th
                scope="col"
                className="py-2.5 px-3 text-right whitespace-nowrap"
              >
                {t.colSeller}
              </th>
              <th
                scope="col"
                className="py-2.5 px-3 text-right whitespace-nowrap"
              >
                {t.colStandard}
              </th>
              <th
                scope="col"
                className="py-2.5 px-3 text-right whitespace-nowrap"
              >
                {t.colVariance}
              </th>
              <th scope="col" className="py-2.5 px-3 whitespace-nowrap">
                {t.colStatus}
              </th>
              <th scope="col" className="py-2.5 px-3 min-w-[210px]">
                {t.colReasonSource}
              </th>
              <th scope="col" className="py-2.5 px-3 text-right">
                <span className="sr-only">{t.inspect}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-sm">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 px-4 text-center text-slate-500">
                  <p className="mb-3">{t.noMatches}</p>
                  <button
                    type="button"
                    onClick={() => {
                      onChangeFilter('All');
                      onChangeSearch('');
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 rounded-md hover:bg-blue-50"
                  >
                    {t.clearFilter}
                  </button>
                </td>
              </tr>
            ) : (
              filtered.map((claim) => {
                const isSelected = selectedClaimId === claim.claimId;
                const metricName =
                  lang === 'vi' ? claim.metricNameVi : claim.metricNameEn;
                const reason = lang === 'vi' ? claim.reasonVi : claim.reasonEn;
                return (
                  <tr
                    key={claim.claimId}
                    className={`transition-colors ${
                      isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-3 px-4 align-top min-w-[190px]">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap">
                        <span className="font-semibold text-slate-700">
                          {claim.claimId}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{claim.sellerPeriod}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-sans">{claim.category}</span>
                      </div>
                      <div className="font-medium text-slate-900 mt-0.5">
                        {metricName}
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right align-top font-mono tabular-nums text-slate-900 whitespace-nowrap">
                      {formatNum(claim.sellerValue, claim.sellerUnit)}
                    </td>

                    <td className="py-3 px-3 text-right align-top font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {formatNum(claim.standardValue, claim.standardUnit)}
                    </td>

                    <td className="py-3 px-3 text-right align-top font-mono tabular-nums whitespace-nowrap">
                      {claim.variancePct === null ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <span
                          className={
                            Math.abs(claim.variancePct) <= 0.5
                              ? 'text-slate-600'
                              : 'text-red-700 font-medium'
                          }
                        >
                          {claim.variancePct > 0 ? '+' : ''}
                          {claim.variancePct}%
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3 align-top whitespace-nowrap">
                      <StatusBadge status={claim.finalStatus} />
                    </td>

                    <td className="py-3 px-3 align-top text-xs text-slate-600 space-y-1">
                      <div className="text-slate-800 leading-relaxed">
                        {reason}
                      </div>
                      <div className="text-slate-500">
                        {claim.sellerSourceRef
                          ? claim.sellerSourceRef
                          : claim.standardSource}
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right align-top">
                      <button
                        type="button"
                        onClick={() => onSelectClaim(claim.claimId)}
                        aria-label={`${t.inspect} ${claim.claimId}`}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                          isSelected
                            ? 'bg-blue-700 text-white'
                            : 'text-slate-700 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span>{t.inspect}</span>
                        <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
