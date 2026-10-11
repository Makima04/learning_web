import { useEffect, useState, type CSSProperties } from "react";
import {
  Bookmark,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  FileText,
  Languages,
  LayoutDashboard,
  LayoutGrid,
  Leaf,
  LibraryBig,
  Monitor,
  Moon,
  Network,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings,
  Sun,
  UserRound,
} from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "@/stores/theme";
import { useAuth } from "@/stores/auth";
import { useSettings } from "@/stores/settings";
import { hrefForNavRoot, isNavSectionActive, rememberNavPath } from "@/lib/navMemory";
import { useHideOnScrollDown } from "@/hooks/useHideOnScrollDown";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface NavItem {
  to: string;
  label: string;
  icon: typeof BookOpen;
  /** NookPhone 式图标底色（bg-app-*），黄色底用深色图标 */
  tile: string;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: "/", label: "学习概览", icon: LayoutDashboard, tile: "bg-app-teal text-white", end: true },
  { to: "/lists", label: "生熟词表", icon: Bookmark, tile: "bg-app-pink text-white" },
  { to: "/kg", label: "知识图谱", icon: Network, tile: "bg-app-purple text-white" },
  { to: "/viz", label: "图解 408", icon: Clapperboard, tile: "bg-app-blue text-white" },
  { to: "/journal", label: "学习日志", icon: NotebookPen, tile: "bg-app-green text-white" },
  { to: "/papers", label: "真题阅读", icon: FileText, tile: "bg-app-orange text-white" },
  { to: "/papers-recite", label: "真题记词", icon: LibraryBig, tile: "bg-app-yellow text-[#725d42]" },
  { to: "/politics", label: "考研政治", icon: ScrollText, tile: "bg-app-red text-white" },
  { to: "/transmgr", label: "翻译管理", icon: Languages, tile: "bg-app-blue text-white" },
  { to: "/settings", label: "学习设置", icon: Settings, tile: "bg-app-brown text-white" },
];

// 侧栏默认进一级时也可落到有意义的列表 URL（无记忆时）
const NAV_DEFAULT_HREF: Record<string, string> = {
  "/papers": "/papers/en1",
  "/papers-recite": "/papers-recite/en1",
};

function navHref(to: string): string {
  const remembered = hrefForNavRoot(to);
  return remembered === to && NAV_DEFAULT_HREF[to] ? NAV_DEFAULT_HREF[to] : remembered;
}

const SIDEBAR_COLLAPSED_KEY = "ew.ui.sidebarCollapsed.v1";

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function NavTile({ item, size }: { item: NavItem; size: "sm" | "md" }) {
  const Icon = item.icon;
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center shadow-[0_2px_0_rgb(0_0_0/0.12)]",
        size === "md" ? "h-8 w-8 rounded-[10px]" : "h-7 w-7 rounded-[9px]",
        item.tile
      )}
    >
      <Icon className={size === "md" ? "h-4 w-4" : "h-[15px] w-[15px]"} strokeWidth={2.3} />
    </span>
  );
}

function BrandMark({ size }: { size: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-edge-primary-sm",
        size === "md" ? "h-10 w-10" : "h-8 w-8"
      )}
    >
      <Leaf className={size === "md" ? "h-5 w-5" : "h-4 w-4"} strokeWidth={2.4} />
    </span>
  );
}

export function AppLayout() {
  const mode = useTheme((s) => s.mode);
  const cycle = useTheme((s) => s.cycle);
  const user = useAuth((s) => s.user);
  const enableCs408 = useSettings((s) => s.enableCs408);
  const navigate = useNavigate();
  const location = useLocation();
  // 电脑侧栏收起状态记在本机（界面偏好，不跨设备同步）
  const [navCollapsed, setNavCollapsed] = useState(readSidebarCollapsed);
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, navCollapsed ? "1" : "0");
    } catch {
      /* 存储不可用时只在本次会话生效 */
    }
  }, [navCollapsed]);
  // 手机底栏：往下滚自动藏，也可手动收起；藏起后右下角小按钮唤回。与电脑侧栏互不影响
  const [mobileNavCollapsed, setMobileNavCollapsed] = useState(false);
  const mobileNavScroll = useHideOnScrollDown(location.pathname, "(max-width: 767px)");
  const mobileNavHidden = mobileNavCollapsed || mobileNavScroll.hidden;
  // 路径变化时 bump，让 NavLink 的 to 读到最新 session 记忆
  const [memTick, setMemTick] = useState(0);
  const ThemeIcon = mode === "dark" ? Moon : mode === "light" ? Sun : Monitor;

  useEffect(() => {
    rememberNavPath(location.pathname, location.search);
    setMemTick((n) => n + 1);
  }, [location.pathname, location.search]);

  // memTick：确保记忆更新后重新计算 href
  void memTick;
  const navItems = NAV.filter((item) => item.to !== "/viz" || enableCs408);
  const activeItem = navItems.find((item) => isNavSectionActive(item.to, location.pathname));

  return (
    <div className="min-h-screen text-foreground md:flex">
      <aside
        className={cn(
          "hidden md:sticky md:top-0 md:flex h-dvh max-h-dvh shrink-0 flex-col overflow-hidden border-r-2 border-border/70 transition-[width] duration-200",
          "bg-[hsl(var(--sidebar))]",
          navCollapsed ? "w-[76px]" : "w-[250px]"
        )}
      >
        <div className={cn("flex h-20 items-center px-4", navCollapsed && "justify-center px-0")}>
          <NavLink to={hrefForNavRoot("/")} className="flex min-w-0 items-center gap-3">
            <BrandMark size="md" />
            {!navCollapsed && (
              <span className="min-w-0">
                <span className="block text-base font-extrabold leading-tight">红宝书</span>
                <span className="block text-xs font-semibold text-muted-foreground">考研词汇 6550</span>
              </span>
            )}
          </NavLink>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
          {!navCollapsed && <p className="px-3 pb-2 pt-1 text-xs font-bold text-muted-foreground">学习空间</p>}
          {navItems.map((item) => {
            const href = navHref(item.to);
            const active = item === activeItem;
            return (
              <NavLink
                key={item.to}
                to={href}
                end={item.end && href === item.to}
                title={item.label}
                className={cn(
                  "group relative flex h-11 items-center gap-3 rounded-full px-1.5 text-sm transition-colors",
                  navCollapsed && "justify-center px-0",
                  active
                    ? "bg-accent font-bold text-accent-foreground"
                    : "font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "rounded-[11px] transition-transform group-hover:-rotate-3",
                    active && navCollapsed && "ring-2 ring-primary ring-offset-2 ring-offset-[hsl(var(--sidebar))]"
                  )}
                >
                  <NavTile item={item} size="md" />
                </span>
                {!navCollapsed && <span className="truncate">{item.label}</span>}
                {active && !navCollapsed && (
                  <Leaf className="leaf-wiggle ml-auto mr-2 h-4 w-4 shrink-0 fill-app-green/40 text-app-green" />
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t-2 border-border/70 p-3">
          <Button
            variant="ghost"
            className={cn("h-10 w-full justify-start gap-2 px-3 text-muted-foreground", navCollapsed && "justify-center px-0")}
            title={navCollapsed ? "展开导航" : "收起导航"}
            onClick={() => setNavCollapsed((value) => !value)}
          >
            {navCollapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
            {!navCollapsed && <span className="text-sm">收起导航</span>}
          </Button>
        </div>
      </aside>

      {/* --nav-reserve：手机底栏占位高度，子页面定高布局（如背词）用它扣除 */}
      <div
        className="flex min-h-screen min-w-0 flex-1 flex-col pb-[var(--nav-reserve)] md:pb-0"
        style={{
          "--nav-reserve": mobileNavCollapsed
            ? "calc(4rem + env(safe-area-inset-bottom))"
            : "calc(7.25rem + env(safe-area-inset-bottom))",
        } as CSSProperties}
      >
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b-2 border-border/60 bg-background/90 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2.5 md:hidden">
            <BrandMark size="sm" />
            <span className="text-base font-extrabold">红宝书</span>
          </div>
          <div className="hidden items-center gap-2 text-sm font-bold md:flex">
            {activeItem ? (
              <>
                <NavTile item={activeItem} size="sm" />
                {activeItem.label}
              </>
            ) : (
              <span className="text-muted-foreground">红宝书</span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="ghost" size="icon" title="切换主题" onClick={cycle}>
              <ThemeIcon className="h-[18px] w-[18px]" strokeWidth={2} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="hidden gap-1.5 pl-3 pr-2 sm:inline-flex"
              title={user?.username || "登录或管理账号"}
              onClick={() => navigate("/settings")}
            >
              <UserRound className="h-4 w-4" strokeWidth={2.2} />
              <span className="max-w-24 truncate">{user?.username || "账号"}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Button>
            <Button variant="ghost" size="icon" className="sm:hidden" title="账号" onClick={() => navigate("/settings")}>
              <UserRound className="h-[18px] w-[18px]" strokeWidth={2} />
            </Button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto"><Outlet /></main>
      </div>

      {/* 手机底栏：NookPhone 式两排小图标 */}
      <nav
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 rounded-t-2xl bg-card pb-[env(safe-area-inset-bottom)] shadow-[0_-3px_0_hsl(var(--edge))] transition-transform duration-300 md:hidden",
          mobileNavHidden && "pointer-events-none translate-y-[calc(100%+1rem)]"
        )}
      >
        <button
          type="button"
          title="收起导航"
          aria-label="收起导航"
          onClick={() => setMobileNavCollapsed(true)}
          className="absolute -top-3 right-4 grid h-6 w-6 place-items-center rounded-full bg-card text-muted-foreground shadow-edge-sm ring-1 ring-border"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <div className="grid grid-cols-5 px-1 pt-1.5">
          {navItems.map((item) => {
            const href = navHref(item.to);
            const active = item === activeItem;
            return (
              <NavLink
                key={item.to}
                to={href}
                end={item.end && href === item.to}
                className={cn(
                  "flex min-w-0 flex-col items-center justify-center gap-1 px-0.5 py-1.5 text-[10px] leading-none",
                  active ? "font-extrabold text-foreground" : "font-semibold text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "rounded-[10px] transition-transform active:scale-90",
                    active && "ring-2 ring-primary ring-offset-2 ring-offset-card"
                  )}
                >
                  <NavTile item={item} size="sm" />
                </span>
                <span className="max-w-full truncate">{item.label.replace("学习", "")}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
      <button
        type="button"
        title="展开导航"
        aria-label="展开导航"
        onClick={() => {
          setMobileNavCollapsed(false);
          mobileNavScroll.show();
        }}
        className={cn(
          "fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-30 grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-edge-primary transition-all duration-200 md:hidden",
          mobileNavHidden ? "scale-100 opacity-100" : "pointer-events-none scale-75 opacity-0"
        )}
      >
        <LayoutGrid className="h-[18px] w-[18px]" strokeWidth={2} />
      </button>
    </div>
  );
}
