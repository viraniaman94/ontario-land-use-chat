import type { StreamStatusInfo } from "@/hooks/use-stream-status";

interface StreamStatusBarProps {
  info: StreamStatusInfo;
}

/**
 * A thin status line rendered above the chat input. Surfaces the
 * consolidated stream state (waiting / streaming / stopped / error /
 * complete) with a colored indicator dot, a human-readable label, and
 * an elapsed timer while a request is in flight.
 *
 * The bar reserves a fixed height row to avoid layout shift as states
 * change. When idle, it renders nothing (the Send button already
 * communicates readiness).
 */
export function StreamStatusBar({ info }: StreamStatusBarProps) {
  const { status, stalled, elapsedSec, label, inFlight } = info;

  // Always render the bar so the user can always see the current stream
  // state (task spec: "so the user always knows"). The bar sits in a
  // subtly tinted panel so it reads as a distinct UI element rather
  // than blending into the page.
  const isError = status === "error";

  return (
    <div
      className="flex h-8 items-center gap-2 border-t bg-muted/40 px-4 text-xs text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <span
        className={`pi-status-dot pi-status-dot-${status}`}
        aria-hidden="true"
      />
      <span className={isError ? "font-medium text-destructive" : "text-foreground/70"}>
        {label}
      </span>
      {inFlight && elapsedSec > 0 && (
        <span className="tabular-nums text-muted-foreground/70">
          {elapsedSec}s
        </span>
      )}
      {inFlight && stalled && (
        <span className="text-amber-600 dark:text-amber-400">
          · no data received
        </span>
      )}
    </div>
  );
}