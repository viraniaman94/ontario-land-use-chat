
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { cn } from "@/lib/utils";

interface MarkdownContentProps {
  content: string;
  thinking?: boolean;
  className?: string;
}

/**
 * Enhanced Markdown renderer with pi-style formatting.
 *
 * When `thinking` is true, renders in dim/italic style and strips
 * fenced code blocks (proseOnly mode) — matching pi's convention
 * for reasoning blocks.
 */
export const MarkdownContent = memo(function MarkdownContent({
  content,
  thinking = false,
  className,
}: MarkdownContentProps) {
  if (!content) return null;

  // In proseOnly mode (thinking), strip fenced code blocks
  const processedContent = thinking
    ? content.replace(/```[\s\S]*?```/g, "...")
    : content;

  return (
    <div
      className={cn(
        "prose prose-sm max-w-none dark:prose-invert",
        thinking && "pi-thinking-text",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Headings — orange accent like pi
          h1: ({ children }) => (
            <h1 className="mb-3 mt-4 text-lg font-bold pi-md-heading">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-3 text-base font-bold pi-md-heading">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1 mt-2 text-sm font-bold pi-md-heading">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="mb-1 mt-2 text-xs font-bold pi-md-heading">
              {children}
            </h4>
          ),

          // Inline code — cyan like pi
          code: ({ className: codeClassName, children, ...props }) => {
            const isInline = !codeClassName;
            if (isInline) {
              return (
                <code
                  className="rounded bg-muted px-1 py-0.5 pi-md-code"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={codeClassName} {...props}>
                {children}
              </code>
            );
          },

          // Links — accent color
          a: ({ children, href, ...props }) => (
            <a
              href={href}
              className="pi-md-link underline underline-offset-2"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            >
              {children}
            </a>
          ),

          // Blockquotes — dim italic with left border
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 pi-md-quote-border pl-3 pi-md-quote">
              {children}
            </blockquote>
          ),

          // Lists — cyan bullets
          ul: ({ children }) => (
            <ul className="list-disc pl-5 [&>li::marker]:pi-md-list-bullet">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5">{children}</ol>
          ),

          // Tables
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border bg-muted px-2 py-1 font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-2 py-1">{children}</td>
          ),

          // Horizontal rule
          hr: () => <hr className="my-3 border-muted-foreground/30" />,
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
});
