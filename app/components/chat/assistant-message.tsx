import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from "@/components/ai-elements/reasoning";
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import type { DynamicToolUIPart, ToolUIPart, UIMessage } from "ai";

interface AssistantMessageProps {
  message: UIMessage;
  isStreaming: boolean;
}

/**
 * Orchestrator component for assistant messages.
 *
 * Iterates `message.parts[]` in order and routes each part to the
 * appropriate AI Elements component:
 * - text → MessageResponse
 * - reasoning → Reasoning + ReasoningTrigger + ReasoningContent
 * - tool-* (static named tools like tool-readDocument, tool-searchDocuments) → Tool
 * - dynamic-tool → Tool
 * - step-start → thin separator
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
    <Message from="assistant">
      <MessageContent>
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
                <MessageResponse
                  key={`text-${index}`}
                  isAnimating={isLastPart && isStreaming}
                >
                  {textPart.text}
                </MessageResponse>
              );
            }

            case "reasoning": {
              const reasoningPart = part as {
                type: "reasoning";
                text: string;
                state?: "streaming" | "done";
              };
              return (
                <Reasoning
                  key={`reasoning-${index}`}
                  isStreaming={isLastPart && isStreaming}
                >
                  <ReasoningTrigger />
                  <ReasoningContent>
                    {reasoningPart.text}
                  </ReasoningContent>
                </Reasoning>
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
                if (part.type === "dynamic-tool") {
                  const toolPart = part as DynamicToolUIPart;
                  return (
                    <Tool
                      key={`tool-${toolPart.toolCallId || index}`}
                      defaultOpen={toolPart.state === "output-available"}
                    >
                      <ToolHeader
                        type="dynamic-tool"
                        toolName={toolPart.toolName}
                        state={toolPart.state}
                      />
                      <ToolContent>
                        <ToolInput input={toolPart.input} />
                        <ToolOutput
                          output={toolPart.output}
                          errorText={toolPart.errorText}
                        />
                      </ToolContent>
                    </Tool>
                  );
                }

                // Static named tool (tool-readDocument, tool-listDocuments, etc.)
                const toolPart = part as ToolUIPart;
                return (
                  <Tool
                    key={`tool-${toolPart.toolCallId || index}`}
                    defaultOpen={toolPart.state === "output-available"}
                  >
                    <ToolHeader
                      type={toolPart.type}
                      state={toolPart.state}
                    />
                    <ToolContent>
                      <ToolInput input={toolPart.input} />
                      <ToolOutput
                        output={toolPart.output}
                        errorText={toolPart.errorText}
                      />
                    </ToolContent>
                  </Tool>
                );
              }
              return null;
            }
          }
        })}
      </MessageContent>
    </Message>
  );
}
