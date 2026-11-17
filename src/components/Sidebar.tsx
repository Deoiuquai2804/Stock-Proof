import {
  Blocks,
  FileCheck2,
  FileSpreadsheet,
  FolderKanban,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';

export type AppRoute =
  | '/dashboard'
  | '/upload'
  | '/reports'
  | '/verification'
  | '/evidence'
  | '/blockchain'
  | '/settings';

interface SidebarProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  activeReportId?: string;
}

const SIDEBAR_ITEMS: Array<{
  route: AppRoute;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { route: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { route: '/upload', label: 'Tải báo cáo', icon: Upload },
  { route: '/reports', label: 'Tất cả báo cáo', icon: FolderKanban },
  { route: '/verification', label: 'Kết quả xác minh', icon: FileCheck2 },
  { route: '/evidence', label: 'Báo cáo bằng chứng', icon: FileSpreadsheet },
  { route: '/blockchain', label: 'Hồ sơ Blockchain', icon: Blocks },
  { route: '/settings', label: 'Cài đặt', icon: Settings },
];

export function Sidebar({
  currentRoute,
  onNavigate,
  mobileOpen,
  onCloseMobile,
  activeReportId,
}: SidebarProps) {
  const navContent = (
    <div className="flex flex-col h-full bg-[#111827] border-r border-slate-800/80 w-64">
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800/80">
        <button
          type="button"
          onClick={() => {
            onNavigate('/dashboard');
            onCloseMobile();
          }}
          className="flex items-center gap-2.5 text-left"
        >
          <div className="h-8 w-8 rounded-lg bg-[#3B82F6]/15 border border-[#3B82F6]/40 flex items-center justify-center text-[#3B82F6]">
            <ShieldCheck className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[#F8FAFC] tracking-tight">
              StockProof
            </div>
            <div className="text-[11px] text-[#94A3B8]">
              Xác minh chỉ tiêu
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Đóng thanh điều hướng"
          className="lg:hidden p-1.5 rounded-md text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-slate-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav
        className="flex-1 p-3 space-y-1 overflow-y-auto"
        aria-label="Thanh điều hướng chính"
      >
        {SIDEBAR_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = currentRoute === item.route;
          return (
            <button
              key={item.route}
              type="button"
              onClick={() => {
                onNavigate(item.route);
                onCloseMobile();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'bg-[#172033] text-[#F8FAFC] border border-[#3B82F6]/40'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#172033]/60 border border-transparent'
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${
                  active ? 'text-[#3B82F6]' : 'text-[#94A3B8]'
                }`}
              />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800/80 space-y-2">
        <div className="text-[11px] uppercase tracking-wider text-[#94A3B8]">
          Hồ sơ đang kiểm tra
        </div>
        <div className="text-xs font-mono text-[#CBD5E1] truncate">
          {activeReportId || 'Chưa chọn báo cáo'}
        </div>
        <div className="text-[11px] text-[#94A3B8] leading-relaxed">
          Xác minh mọi chỉ tiêu tài chính.
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0">{navContent}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{navContent}</div>
        </div>
      )}
    </>
  );
}
