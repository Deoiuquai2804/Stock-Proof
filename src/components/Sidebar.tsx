import {
  ClipboardCheck,
  Database,
  Link2,
  X,
} from 'lucide-react';
import { COPY } from '../lib/i18n.ts';
import type { Language } from '../types/stockproof.ts';

export type ActiveTab = 'workbench' | 'evidence' | 'seller';

interface SidebarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  lang: Language;
  enterpriseName: string;
  ticker: string;
  exchange: string;
  period: string;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  activeTab,
  onSelectTab,
  lang,
  enterpriseName,
  ticker,
  exchange,
  period,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const t = COPY[lang].nav;

  const items: Array<{
    id: ActiveTab;
    label: string;
    icon: typeof ClipboardCheck;
  }> = [
    { id: 'workbench', label: t.workbench, icon: ClipboardCheck },
    { id: 'evidence', label: t.evidence, icon: Link2 },
    { id: 'seller', label: t.seller, icon: Database },
  ];

  const navContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 w-64">
      <div className="h-16 px-6 flex items-center justify-between border-b border-slate-200">
        <a
          href="#workbench"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('workbench');
            onCloseMobile();
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap"
        >
          StockProof
        </a>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav aria-label="Primary navigation" className="flex-1 px-3 py-5 space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectTab(item.id);
                onCloseMobile();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors text-left whitespace-nowrap ${
                active
                  ? 'bg-blue-50 text-blue-800'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  active ? 'text-blue-700' : 'text-slate-400'
                }`}
                aria-hidden="true"
              />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-slate-200 text-xs text-slate-600 space-y-1.5">
        <div className="font-medium text-slate-900 truncate">{enterpriseName}</div>
        <div className="flex items-center gap-1.5 text-slate-500 font-mono tabular-nums">
          <span>
            {exchange}: {ticker}
          </span>
          <span aria-hidden="true">·</span>
          <span>{period}</span>
        </div>
        <div className="text-slate-500">Avalanche Fuji C-Chain · 43113</div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0">{navContent}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{navContent}</div>
        </div>
      )}
    </>
  );
}
