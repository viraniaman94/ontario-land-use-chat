import { cn } from "@/lib/utils";

interface BubbleProps {
  variant?: "sent" | "received";
  className?: string;
  children: React.ReactNode;
}

export function Bubble({ variant = "received", className, children }: BubbleProps) {
  return (
    <div
      className={cn(
        "rounded-2xl px-4 py-3 text-sm",
        variant === "sent"
          ? "bg-primary text-primary-foreground rounded-br-md"
          : "bg-muted text-foreground rounded-bl-md",
        className,
      )}
    >
      {children}
    </div>
  );
}