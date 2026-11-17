import { LogIn, LogOut, Menu, ShieldCheck, User as UserIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { AppRoute } from './Sidebar';

interface TopNavProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onOpenMobileMenu: () => void;
}

const TOP_LINKS: Array<{ route: AppRoute; label: string }> = [
  { route: '/dashboard', label: 'Tổng quan' },
  { route: '/reports', label: 'Báo cáo' },
  { route: '/verification', label: 'Xác minh' },
  { route: '/evidence', label: 'Bằng chứng' },
  { route: '/blockchain', label: 'Blockchain' },
  { route: '/settings', label: 'Cài đặt' },
];

export function TopNav({
  currentRoute,
  onNavigate,
  onOpenMobileMenu,
}: TopNavProps) {
  const { user, signingIn, signInWithGoogle, logout } = useAuth();

  return (
    <header className="h-16 bg-[#111827]/95 backdrop-blur border-b border-slate-800/80 px-4 lg:px-6 flex items-center justify-between gap-4 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Mở menu điều hướng"
          className="lg:hidden p-2 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-slate-800"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 lg:hidden">
          <ShieldCheck className="h-5 w-5 text-[#3B82F6]" />
          <span className="font-semibold text-sm text-[#F8FAFC]">
            StockProof
          </span>
        </div>

        <nav
          className="hidden md:flex items-center gap-1"
          aria-label="Điều hướng đầu trang"
        >
          {TOP_LINKS.map((item) => {
            const active = currentRoute === item.route;
            return (
              <button
                key={item.route}
                type="button"
                onClick={() => onNavigate(item.route)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[#172033] text-[#F8FAFC] border border-slate-700'
                    : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {user ? (
          <div className="flex items-center gap-2.5">
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#172033] border border-slate-800">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Kiểm toán viên'}
                  className="h-5 w-5 rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <UserIcon className="h-4 w-4 text-[#94A3B8]" />
              )}
              <span className="text-xs font-medium text-[#F8FAFC] max-w-[140px] truncate">
                {user.displayName || user.email}
              </span>
            </div>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 text-xs font-medium text-[#CBD5E1] hover:text-[#F8FAFC] hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Đăng xuất</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-xs text-[#94A3B8] whitespace-nowrap">
              Phiên Demo
            </span>
            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={signingIn}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-60 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>{signingIn ? 'Đang đăng nhập...' : 'Đăng nhập'}</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
