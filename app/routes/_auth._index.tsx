import type { MetaFunction } from "react-router";
import { useChatNav } from "~/lib/chat-nav-context";

export const meta: MetaFunction = () => [
  { title: "Ontario Land Use Planning Agent" },
  {
    name: "description",
    content:
      "AI-powered feasibility assessment for Ontario development projects.",
  },
];

/**
 * Home route (`/`). Renders the landing placeholder; starting a new assessment
 * navigates to `/c/<id>` (handled by the `_auth.tsx` layout). Active chats live
 * at `_auth.c.$conversationId.tsx`.
 */
export default function Home() {
  const { onNew } = useChatNav();
  return <NewChatPlaceholder onStart={onNew} />;
}

function NewChatPlaceholder({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
        ON
      </div>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">
        Ontario Land Use Planning Feasibility Agent
      </h1>
      <p className="mb-6 max-w-md text-sm text-muted-foreground">
        Assess whether a proposed development is feasible under provincial
        policy, official plans, and zoning by-laws — across 41 planning
        documents covering a 150km radius of Peterborough, Ontario.
      </p>
      <button
        onClick={onStart}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
      >
        Start a new assessment
      </button>
      <p className="mt-6 max-w-sm text-xs text-muted-foreground">
        A registered professional planner (RPP) should review any findings
        before relying on them. This tool provides a preliminary assessment
        only.
      </p>
    </div>
  );
}