import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: "ok" | "warning" | "danger" | "none";
  label: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        status === "ok" && "bg-success/15 text-success",
        status === "warning" && "bg-warning/15 text-warning",
        status === "danger" && "bg-destructive/15 text-destructive",
        status === "none" && "bg-muted text-muted-foreground"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "ok" && "bg-success",
          status === "warning" && "bg-warning",
          status === "danger" && "bg-destructive",
          status === "none" && "bg-muted-foreground"
        )}
      />
      {label}
    </span>
  );
}
