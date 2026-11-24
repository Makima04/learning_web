import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export const handoutDirectoryStyles = {
  page: "mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-8",
  header: "rounded-3xl border-2 border-border/80 bg-card p-5 shadow-edge-sm md:p-6",
  title: "text-2xl font-extrabold tracking-tight",
  stats: "grid grid-cols-2 gap-3 sm:grid-cols-5",
  stat: "min-w-0 rounded-2xl bg-secondary/50 px-3.5 py-2.5",
  sectionHeading: "flex flex-wrap items-center justify-between gap-2 border-b-2 border-border/80 pb-2.5",
  sectionTitle: "text-lg font-extrabold tracking-tight",
  card: "rounded-2xl border-2 bg-card shadow-edge-sm transition-colors",
};

export function handoutFilterClass(active: boolean) {
  return cn(
    "rounded-full border px-2.5 py-1.5 text-xs font-bold transition-colors sm:px-3.5",
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border bg-card text-muted-foreground hover:text-foreground",
  );
}

export function HandoutDirectorySearch({ value, onChange, placeholder, className }: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={cn("relative w-full sm:w-64", className)}>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        aria-label={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-full border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary"
      />
    </div>
  );
}
