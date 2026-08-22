import { useEffect, useState } from "react";
import {
  BookOpen,
  ChevronRight,
  Clapperboard,
  FileText,
  Languages,
  LayoutDashboard,
  LibraryBig,
  Monitor,
  Moon,
  Network,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sun,
  UserRound,
} from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "@/stores/theme";
import { useAuth } from "@/stores/auth";
import { useSettings } from "@/stores/settings";
import { hrefForNavRoot, isNavSectionActive, rememberNavPath } from "@/lib/navMemory";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV: {
  to: string;
  label: string;
  icon: typeof BookOpen;
  end?: boolean;
  /** true = 不占用移动端底部导航的 4 个名额 */
  mobileHidden?: boolean;
}[] = [
  { to: "/", label: "学习概览", icon: LayoutDashboard, end: true },
  { to: "/kg", label: "知识图谱", icon: Network },
  { to: "/viz", label: "图解 408", icon: Clapperboard, mobileHidden: true },
  { to: "/journal", label: "学习日志", icon: NotebookPen },
  { to: "/papers", label: "真题阅读", icon: FileText },
  { to: "/papers-recite", label: "真题记词", icon: LibraryBig },
  { to: "/transmgr", label: "翻译管理", icon: Languages },
  { to: "/settings", label: "学习设置", icon: Settings },
];

// 侧栏默认进一级时也可落到有意义的列表 URL（无记忆时）
const NAV_DEFAULT_HREF: Record<string, string> = {
  "/papers": "/papers/en1",
  "/papers-recite": "/papers-recite/en1",
};

export function AppLayout() {
  const mode = useTheme((s) => s.mode);
  const cycle = useTheme((s) => s.cycle);
  const user = useAuth((s) => s.user);
  const enableCs408 = useSettings((s) => s.enableCs408);
  const navigate = useNavigate();
  const location = useLocation();
  const [navCollapsed, setNavCollapsed] = useState(false);
  // 路径变化时 bump，让 NavLink 的 to 读到最新 session 记忆
  const [memTick, setMemTick] = useState(0);
  const ThemeIcon = mode === "dark" ? Moon : mode === "light" ? Sun : Monitor;

  useEffect(() => {
    rememberNavPath(location.pathname, location.search);
    setMemTick((n) => n + 1);
  }, [location.pathname, location.search]);

  return (
    <div className="min-h-screen bg-background text-foreground md:flex">
      <aside
        className={cn(
          "hidden md:sticky md:top-0 md:flex h-screen shrink-0 flex-col border-r transition-[width] duration-200",
          "bg-[hsl(var(--sidebar))]",
          navCollapsed ? "w-[76px]" : "w-[250px]"
        )}
      >
        <div className="flex h-20 items-center border-b px-4">
          <NavLink to={hrefForNavRoot("/")} className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <BookOpen className="h-5 w-5" strokeWidth={2.4} />
            </span>
            {!navCollapsed && (
              <span className="min-w-0">
                <span className="block text-sm font-semibold tracking-tight">红宝书</span>
                <span className="block text-xs text-muted-foreground">考研词汇 6550</span>
              </span>
            )}
          </NavLink>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {!navCollapsed && <p className="px-3 py-2 text-xs font-medium text-muted-foreground">学习空间</p>}
          {NAV.filter((item) => item.to !== "/viz" || enableCs408).map((item) => {
            const Icon = item.icon;
            const remembered = hrefForNavRoot(item.to);
            const href =
              remembered === item.to && NAV_DEFAULT_HREF[item.to]
                ? NAV_DEFAULT_HREF[item.to]
                : remembered;
            const active = isNavSectionActive(item.to, location.pathname);
            // memTick：确保记忆更新后重新计算 href
            void memTick;
            return (
              <NavLink
                key={item.to}
                to={href}
                end={item.end && href === item.to}
                title={item.label}
                className={() =>
                  cn(
                    "group flex h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                    navCollapsed && "justify-center px-0",
                    active
                      ? "bg-primary/15 font-semibold text-primary"
                      : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  )
                }
              >
                <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} />
                {!navCollapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t p-3">
          <Button
            variant="ghost"
            size="icon"
            className="w-full justify-start px-3 text-muted-foreground"
            title={navCollapsed ? "展开导航" : "收起导航"}
            onClick={() => setNavCollapsed((value) => !value)}
          >
            {navCollapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
            {!navCollapsed && <span className="ml-1 text-sm">收起导航</span>}
          </Button>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col pb-16 md:pb-0">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-3 md:hidden">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <BookOpen className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold">红宝书</span>
          </div>
          <div className="hidden text-sm text-muted-foreground md:block">今日学习</div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" title="切换主题" onClick={cycle}>
              <ThemeIcon className="h-[18px] w-[18px]" strokeWidth={1.9} />
            </Button>
            <Button
              variant="ghost"
              className="hidden h-10 gap-2 px-3 sm:inline-flex"
              title={user?.username || "登录或管理账号"}
              onClick={() => navigate("/settings")}
            >
              <UserRound className="h-[18px] w-[18px]" strokeWidth={1.9} />
              <span className="max-w-24 truncate text-sm">{user?.username || "账号"}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Button>
            <Button variant="ghost" size="icon" className="sm:hidden" title="账号" onClick={() => navigate("/settings")}>
              <UserRound className="h-[18px] w-[18px]" strokeWidth={1.9} />
            </Button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto"><Outlet /></main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-4 border-t bg-card md:hidden">
        {NAV.filter((item) => item.to !== "/viz" || enableCs408)
          .filter((item) => !item.mobileHidden)
          .slice(0, 4)
          .map((item) => {
          const Icon = item.icon;
          const remembered = hrefForNavRoot(item.to);
          const href =
            remembered === item.to && NAV_DEFAULT_HREF[item.to]
              ? NAV_DEFAULT_HREF[item.to]
              : remembered;
          const active = isNavSectionActive(item.to, location.pathname);
          void memTick;
          return (
            <NavLink
              key={item.to}
              to={href}
              end={item.end && href === item.to}
              className={() =>
                cn(
                  "flex flex-col items-center justify-center gap-1 text-[11px]",
                  active ? "font-semibold text-primary" : "text-muted-foreground"
                )
              }
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
              <span className="max-w-full truncate px-1">{item.label.replace("学习", "")}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
