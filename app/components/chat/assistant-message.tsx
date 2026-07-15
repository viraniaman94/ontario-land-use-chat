
import { Bubble } from "@/components/ui/bubble";
import { MarkdownContent } from "./markdown-content";
import { ThinkingBlock } from "./thinking-block";
import { ToolCallBlock } from "./tool-call-block";
import type { UIMessage } from "ai";

interface AssistantMessageProps {
  message: UIMessage;
  isStreaming: boolean;
}

/**
 * Orchestrator component for assistant messages.
 *
 * Iterates `message.parts[]` in order and routes each part to the
 * appropriate sub-component:
 * - text → MarkdownContent
 * - reasoning → ThinkingBlock
 * - tool-* (static named tools like tool-readDocument, tool-searchDocuments) → ToolCallBlock
 * - dynamic-tool → ToolCallBlock
 * - step-start → thin separator
 *
 * Appends a streaming cursor at the end when the last part is text
 * and the message is still streaming.
 */
export function AssistantMessage({
  message,
  isStreaming,
}: AssistantMessageProps) {
  const parts = message.parts;

  if (!parts || parts.length === 0) {
    return null;
  }

  const lastPartIndex = parts.length - 1;

  return (
    <div className="flex justify-start">
      <Bubble variant="received" className="w-full max-w-[85%]">
        <div className="space-y-1">
          {parts.map((part, index) => {
            const isLastPart = index === lastPartIndex;

            switch (part.type) {
              case "text": {
                const textPart = part as {
                  type: "text";
                  text: string;
                  state?: "streaming" | "done";
                };
                if (!textPart.text) return null;
                return (
                  <div key={`text-${index}`} className="my-1">
                    <MarkdownContent content={textPart.text} />
                    {/* Streaming cursor on last text part */}
                    {isLastPart && isStreaming && (
                      <span className="pi-streaming-cursor" />
                    )}
                  </div>
                );
              }

              case "reasoning": {
                const reasoningPart = part as {
                  type: "reasoning";
                  text: string;
                  state?: "streaming" | "done";
                };
                return (
                  <ThinkingBlock
                    key={`reasoning-${index}`}
                    text={reasoningPart.text}
                    state={reasoningPart.state}
                    isStreaming={isLastPart && isStreaming}
                  />
                );
              }

              case "step-start": {
                return (
                  <div
                    key={`step-${index}`}
                    className="my-2 border-t border-border/20"
                  />
                );
              }

              default: {
                // Handle both static named tools (tool-readDocument, tool-listDocuments,
                // tool-searchDocuments) and dynamic tools (dynamic-tool).
                // Static tools embed the tool name in the type field as "tool-<name>".
                // Dynamic tools use a separate toolName field.
                const isToolPart =
                  part.type === "dynamic-tool" ||
                  part.type.startsWith("tool-");

                if (isToolPart) {
                  const toolPart = part as {
                    type: string;
                    toolName?: string;
                    toolCallId: string;
                    state: string;
                    input?: unknown;
                    output?: unknown;
                    errorText?: string;
                  };
                  // Extract tool name: dynamic-tool has a toolName field,
                  // static tools encode it in the type as "tool-<name>"
                  const resolvedToolName =
                    toolPart.toolName ||
                    part.type.replace("tool-", "");
                  return (
                    <ToolCallBlock
                      key={`tool-${toolPart.toolCallId || index}`}
                      toolName={resolvedToolName}
                      toolCallId={toolPart.toolCallId}
                      state={toolPart.state}
                      input={toolPart.input}
                      output={toolPart.output}
                      errorText={toolPart.errorText}
                    />
                  );
                }
                return null;
              }
            }
          })}
        </div>
      </Bubble>
    </div>
  );
}
