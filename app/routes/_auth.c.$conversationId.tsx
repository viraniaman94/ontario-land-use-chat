import { useParams, type MetaFunction } from "react-router";
import { Chat } from "~/components/chat/chat";
import { useChatNav } from "~/lib/chat-nav-context";

export const meta: MetaFunction = () => [
  { title: "Ontario Land Use Planning Agent" },
  {
    name: "description",
    content: "AI-powered feasibility assessment for Ontario development projects.",
  },
];

/**
 * Conversation route (`/c/<conversationId>`). Each chat/assessment has a
 * unique, bookmarkable URL. The conversation id comes from the URL param and
 * is passed straight to `<Chat>`; the shared sidebar + persistence handlers
 * come from the `_auth.tsx` layout via `useChatNav`.
 *
 * New, not-yet-persisted assessments also live here: `<Chat>` treats a 404 from
 * `/api/conversations/<id>` as an empty conversation and persists lazily on the
 * first completed response.
 */
export default function ConversationRoute() {
  const { conversationId } = useParams();
  const { onPersist } = useChatNav();

  if (!conversationId) {
    return null;
  }

  return <Chat key={conversationId} id={conversationId} onPersist={onPersist} />;
}