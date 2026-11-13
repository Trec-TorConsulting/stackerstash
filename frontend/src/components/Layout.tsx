import {
  Camera,
  Coins,
  FolderTree,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import type { AuthUser } from "../lib/api";
import { BrandLogo } from "./BrandLogo";
import { SiteFooter } from "./SiteFooter";

interface LayoutProps {
  user: AuthUser;
  onLogout: () => void;
}

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/collection", label: "Vault", icon: Coins },
  { to: "/scan", label: "Scan / Add", icon: Camera },
  { to: "/containers", label: "Containers", icon: FolderTree },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Layout({ user, onLogout }: LayoutProps) {
  const isGlobalAdmin = user.is_staff || user.is_superuser;
  const navItems = isGlobalAdmin
    ? [...NAV_ITEMS, { to: "/admin", label: "Admin", icon: ShieldCheck }]
    : NAV_ITEMS;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden md:flex md:w-64 md:flex-col md:border-r md:border-slate-800/80 md:bg-slate-900/60 p-4 justify-between">
        <div>
          <div className="px-2 py-3 mb-6">
            <BrandLogo size="md" subtitle={user.workspace.name} />
          </div>
          <nav className="space-y-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                    isActive
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                      : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="border-t border-slate-800 pt-4">
          <div className="px-2 mb-3">
            <div className="text-xs font-medium text-slate-300 truncate">{user.email}</div>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <header className="no-print md:hidden flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-30">
        <BrandLogo size="sm" />
        <button
          onClick={onLogout}
          className="text-xs text-slate-400 hover:text-rose-300 flex items-center gap-1"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 pb-10 md:pb-8 px-4 py-5 md:px-8 md:py-7 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
        <div className="pb-16 md:pb-0">
          <SiteFooter compact />
        </div>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="no-print md:hidden fixed bottom-0 inset-x-0 bg-slate-900/95 backdrop-blur border-t border-slate-800 flex justify-around py-2 z-40">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[11px] font-medium ${
                isActive ? "text-amber-400" : "text-slate-400"
              }`
            }
          >
            <Icon className="h-5 w-5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

