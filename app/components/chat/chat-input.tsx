import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { StreamStatus } from "@/hooks/use-stream-status";

interface ChatInputProps {
  onSend: (text: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  streamStatus?: StreamStatus;
}

export function ChatInput({
  onSend,
  onStop,
  disabled,
  isStreaming,
  streamStatus = "idle",
}: ChatInputProps) {
  const [input, setInput] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  };

  // Button label reflects the consolidated stream state while in flight;
  // otherwise it's the normal Send affordance.
  const stopLabel = streamStatus === "waiting" ? "Waiting…" : "Stop";

  return (
    <form onSubmit={handleSubmit} className="border-t bg-background p-4">
      <div className="mx-auto flex max-w-4xl items-end gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe your project: location, municipality, proposed use, scale..."
          className="min-h-[52px] flex-1 resize-none"
          rows={2}
          disabled={disabled}
        />
        {isStreaming && onStop ? (
          <Button
            type="button"
            size="lg"
            variant="destructive"
            onClick={onStop}
            className="min-w-[88px]"
          >
            {stopLabel}
          </Button>
        ) : (
          <Button
            type="submit"
            size="lg"
            disabled={disabled || !input.trim()}
            className="min-w-[88px]"
          >
            Send
          </Button>
        )}
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Enter to send · Shift+Enter for new line
      </p>
    </form>
  );
}