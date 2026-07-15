
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "./markdown-content";

interface ThinkingBlockProps {
  text: string;
  state?: "streaming" | "done";
  isStreaming?: boolean;
}

/**
 * Collapsible thinking/reasoning block — pi-style.
 *
 * - Collapsed by default: italic "Thinking..." label in dim color
 * - Streaming: animated pulse indicator, auto-shows content
 * - Expanded: full reasoning text via MarkdownContent with thinking={true}
 * - Empty/whitespace-only thinking is suppressed entirely
 */
export function ThinkingBlock({
  text,
  isStreaming = false,
}: ThinkingBlockProps) {
  const [userExpanded, setUserExpanded] = useState(false);

  // Auto-expand while streaming; respect user toggle otherwise.
  // No useEffect needed — derived from props.
  const showContent = userExpanded || isStreaming;

  // Suppress empty/whitespace-only thinking
  const trimmed = text?.trim();
  if (!trimmed) return null;

  return (
    <div className="my-1">
      <button
        type="button"
        onClick={() => setUserExpanded(!userExpanded)}
        className={cn(
          "flex items-center gap-1 text-xs transition-colors",
          "pi-thinking-text hover:text-foreground",
        )}
      >
        {showContent ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <span className="italic flex items-center gap-1.5">
          {isStreaming && <span className="pi-pulse-dot" />}
          Thinking...
        </span>
      </button>

      {showContent && (
        <div className="mt-1 pl-4">
          <MarkdownContent content={trimmed} thinking />
        </div>
      )}
    </div>
  );
}