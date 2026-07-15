
import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolCallBlockProps {
  toolName: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

/**
 * Tool call/result block — pi-style.
 *
 * - State-dependent background tints: pending (faint purple),
 *   success (faint green), error (faint red)
 * - Tool name bold, key argument highlighted, metadata dimmed
 * - Collapsed: one-line summary with status icon
 * - Expanded: full output truncated to ~50 lines
 * - Per-tool pending messages and key arg extraction
 */
export function ToolCallBlock({
  toolName,
  toolCallId,
  state,
  input,
  output,
  errorText,
}: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false);

  const isPending =
    state === "input-streaming" ||
    state === "input-available" ||
    state === "approval-requested";
  const isError =
    state === "output-error" || state === "output-denied";
  const isSuccess = state === "output-available" && !isError && !isPending;

  // Determine background class
  const bgClass = isPending
    ? "pi-tool-pending"
    : isError
      ? "pi-tool-error"
      : "pi-tool-success";

  // Extract key argument based on tool name
  const keyArg = getKeyArg(toolName, input);

  // Get pending message
  const pendingMsg = getPendingMessage(toolName);

  // Format output for display
  const outputLines = formatOutput(output, errorText);

  // Truncate to ~50 lines
  const MAX_LINES = 50;
  const truncated = outputLines.length > MAX_LINES;
  const displayLines = truncated
    ? outputLines.slice(0, MAX_LINES)
    : outputLines;

  return (
    <div
      className={cn(
        "my-1 rounded-md border border-border/50 px-3 py-2 text-xs",
        bgClass,
      )}
    >
      {/* Header row — always visible */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 text-left"
      >
        {/* Expand/collapse icon */}
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}

        {/* Status icon */}
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : isError ? (
          <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-400" />
        )}

        {/* Tool name — bold */}
        <span className="font-semibold text-foreground">{toolName}</span>

        {/* Key argument — accent */}
        {keyArg && (
          <span className="truncate text-accent-foreground">{keyArg}</span>
        )}

        {/* Status summary — right-aligned */}
        <span className="ml-auto shrink-0 text-muted-foreground">
          {isPending
            ? pendingMsg
            : isError
              ? "error"
              : truncated
                ? `${outputLines.length} lines`
                : "done"}
        </span>
      </button>

      {/* Expanded content */}
      {expanded && displayLines.length > 0 && (
        <div className="mt-2 space-y-0.5 border-t border-border/30 pt-2">
          {displayLines.map((line, i) => (
            <div
              key={i}
              className={cn(
                "whitespace-pre-wrap font-mono leading-5",
                getLineStyle(line),
              )}
            >
              {line}
            </div>
          ))}
          {truncated && (
            <div className="pi-truncated">
              ... {outputLines.length - MAX_LINES} more lines
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Extract the key argument from tool input based on tool name.
 */
function getKeyArg(toolName: string, input?: unknown): string | null {
  if (!input || typeof input !== "object") return null;

  const inp = input as Record<string, unknown>;

  switch (toolName) {
    case "readDocument":
      return typeof inp.path === "string" ? inp.path : null;
    case "searchDocuments":
      return typeof inp.query === "string" ? `"${inp.query}"` : null;
    case "listDocuments":
      return null; // no key arg
    default:
      // Try to find a string argument
      for (const val of Object.values(inp)) {
        if (typeof val === "string") return val;
      }
      return null;
  }
}

/**
 * Get the pending message for a tool.
 */
function getPendingMessage(toolName: string): string {
  switch (toolName) {
    case "readDocument":
      return "Reading...";
    case "searchDocuments":
      return "Searching...";
    case "listDocuments":
      return "Listing...";
    default:
      return "Running...";
  }
}

/**
 * Format tool output into lines.
 */
function formatOutput(
  output?: unknown,
  errorText?: string,
): string[] {
  if (errorText) {
    return errorText.split("\n");
  }

  if (output === undefined || output === null) {
    return [];
  }

  if (typeof output === "string") {
    return output.split("\n");
  }

  // Try to pretty-print JSON
  try {
    const formatted = JSON.stringify(output, null, 2);
    return formatted.split("\n");
  } catch {
    return [String(output)];
  }
}

/**
 * Determine the style class for a line based on diff markers.
 */
function getLineStyle(line: string): string {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return "pi-diff-added";
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return "pi-diff-removed";
  }
  if (line.startsWith("@") && line.includes("@@")) {
    return "pi-diff-context";
  }
  return "text-foreground/80";
}
