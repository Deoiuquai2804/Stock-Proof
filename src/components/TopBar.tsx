import { Menu, Play } from 'lucide-react';
import { COPY } from '../lib/i18n.ts';
import type { Language } from '../types/stockproof.ts';

interface TopBarProps {
  ticker: string;
  exchange: string;
  period: string;
  sectionLabel: string;
  lang: Language;
  isVerifying: boolean;
  onRunVerification: () => void;
  onOpenMobileMenu: () => void;
}

export function TopBar({
  ticker,
  exchange,
  period,
  sectionLabel,
  lang,
  isVerifying,
  onRunVerification,
  onOpenMobileMenu,
}: TopBarProps) {
  const t = COPY[lang].topBar;

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-8 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
          className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-md"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-sm text-slate-600 min-w-0 truncate">
          <span className="font-medium text-slate-900 whitespace-nowrap">
            {exchange}: {ticker}
          </span>
          <span aria-hidden="true" className="text-slate-300">
            /
          </span>
          <span className="whitespace-nowrap hidden sm:inline">{period}</span>
          <span aria-hidden="true" className="text-slate-300 hidden sm:inline">
            /
          </span>
          <span className="text-slate-600 truncate">{sectionLabel}</span>
        </div>
      </div>

      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onRunVerification}
          disabled={isVerifying}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          <Play className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{isVerifying ? t.running : t.runVerification}</span>
        </button>
      </div>
    </header>
  );
}
