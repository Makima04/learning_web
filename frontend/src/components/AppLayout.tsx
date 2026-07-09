import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useTheme } from "@/stores/theme";
import { useAuth } from "@/stores/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/", label: "首页", icon: "🏠", end: true },
  { to: "/papers", label: "真题", icon: "📚" },
  { to: "/papers-recite", label: "真题记词", icon: "📖" },
  { to: "/settings", label: "设置", icon: "⚙" },
  { to: "/transmgr", label: "翻译管理", icon: "🌐" },
];

export function AppLayout() {
  const mode = useTheme((s) => s.mode);
  const cycle = useTheme((s) => s.cycle);
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();

  const themeIcon = mode === "dark" ? "🌙" : mode === "light" ? "☀️" : "💻";

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="h-14 border-b flex items-center justify-between px-4 shrink-0">
        <div className="font-semibold flex items-center gap-2">
          <span>📕</span>
          <span>红宝书</span>
          <small className="text-muted-foreground font-normal">乱序·6550</small>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={cycle} title="主题">
            {themeIcon}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={user?.username || "账号"}
            onClick={() => navigate("/settings")}
          >
            👤
          </Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="hidden md:flex w-48 shrink-0 border-r flex-col p-3 gap-1">
          <div className="text-xs text-muted-foreground px-2 py-1">导航</div>
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground font-medium"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                )
              }
            >
              <span>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </aside>

        <main className="flex-1 min-w-0 overflow-auto">
          <Outlet />
        </main>
      </div>

      <nav className="md:hidden border-t flex shrink-0">
        {NAV.slice(0, 4).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              cn(
                "flex-1 flex flex-col items-center gap-0.5 py-2 text-xs",
                isActive ? "text-primary font-medium" : "text-muted-foreground"
              )
            }
          >
            <span className="text-base">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
