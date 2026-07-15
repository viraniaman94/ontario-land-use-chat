import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UIMessage } from "ai";

/**
 * Consolidated chat stream status.
 *
 * The AI SDK's `useChat` exposes a coarse `status` of
 * `'submitted' | 'streaming' | 'ready' | 'error'`. This hook refines it
 * into the user-facing states described in the stream-status-indicator
 * task:
 *
 *  - `idle`      — nothing in flight (ready, no error)
 *  - `waiting`   — request sent OR connection open but no data for
 *                  STALL_MS (merges the former "waiting" and "stalled")
 *  - `streaming` — incoming data
 *  - `stopped`   — user-initiated stop / non-errorful termination
 *  - `error`     — network / HTTP / parse failure
 *  - `complete`  — response finished cleanly (held briefly before `idle`)
 *
 * A stall timer bumps activity whenever the `messages` reference changes
 * while in flight; if no activity arrives for STALL_MS, `stalled` becomes
 * true and a streaming state collapses back into `waiting` (per the
 * task's merged-state spec).
 */

export type StreamStatus =
  | "idle"
  | "waiting"
  | "streaming"
  | "stopped"
  | "error"
  | "complete";

export interface StreamStatusInfo {
  status: StreamStatus;
  /** True when in flight but no new data has arrived for STALL_MS. */
  stalled: boolean;
  /** Seconds since the current in-flight request began (0 when idle). */
  elapsedSec: number;
  /** Human-readable label for the current state. */
  label: string;
  /** True when a request is in flight (waiting or streaming). */
  inFlight: boolean;
}

/** No-data threshold before a in-flight request is considered stalled. */
const STALL_MS = 8000;
/** How long the `complete` state is held before reverting to `idle`. */
const COMPLETE_HOLD_MS = 2500;
/** Poll interval for the stall / elapsed timer. */
const TICK_MS = 500;

interface UseStreamStatusArgs {
  /** The raw `useChat` status ('submitted' | 'streaming' | 'ready' | 'error'). */
  chatStatus: string;
  /** The raw `useChat` error object, if any. */
  error: Error | undefined;
  /** The `useChat` messages array (reference changes on each new part). */
  messages: UIMessage[];
}

export function useStreamStatus({
  chatStatus,
  error,
  messages,
}: UseStreamStatusArgs): StreamStatusInfo & {
  /** Call when the user sends a new message. */
  markSend: () => void;
  /** Call when the user presses stop. */
  markStop: () => void;
} {
  // Base status derived from chatStatus + error + stop/complete signals.
  // The final `status` (below) folds `stalled` into `waiting`.
  const [baseStatus, setBaseStatus] = useState<StreamStatus>("idle");
  const [stalled, setStalled] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  const stopRequestedRef = useRef(false);
  const inFlightStartRef = useRef<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevChatStatusRef = useRef<string>(chatStatus);

  const clearCompleteTimer = useCallback(() => {
    if (completeTimerRef.current) {
      clearTimeout(completeTimerRef.current);
      completeTimerRef.current = null;
    }
  }, []);

  // React to chatStatus transitions.
  useEffect(() => {
    const prev = prevChatStatusRef.current;
    if (chatStatus === prev) return;
    prevChatStatusRef.current = chatStatus;

    if (chatStatus === "submitted") {
      // A new request has been submitted.
      clearCompleteTimer();
      stopRequestedRef.current = false;
      inFlightStartRef.current = Date.now();
      lastActivityRef.current = Date.now();
      setBaseStatus("waiting");
    } else if (chatStatus === "streaming") {
      // First token(s) arrived — data is flowing.
      lastActivityRef.current = Date.now();
      setBaseStatus((cur) => (cur === "error" ? cur : "streaming"));
    } else if (chatStatus === "error") {
      clearCompleteTimer();
      inFlightStartRef.current = null;
      setBaseStatus("error");
    } else if (chatStatus === "ready") {
      inFlightStartRef.current = null;
      const wasInFlight = prev === "submitted" || prev === "streaming";
      if (error) {
        setBaseStatus("error");
      } else if (stopRequestedRef.current) {
        setBaseStatus("stopped");
      } else if (wasInFlight) {
        // Clean completion — hold briefly so the user sees "Complete".
        setBaseStatus("complete");
        clearCompleteTimer();
        completeTimerRef.current = setTimeout(() => {
          setBaseStatus("idle");
          completeTimerRef.current = null;
        }, COMPLETE_HOLD_MS);
      } else {
        setBaseStatus("idle");
      }
    }
  }, [chatStatus, error, clearCompleteTimer]);

  // Bump activity whenever messages change while in flight (new parts
  // arriving = the connection is alive).
  useEffect(() => {
    if (chatStatus === "submitted" || chatStatus === "streaming") {
      lastActivityRef.current = Date.now();
    }
  }, [messages, chatStatus]);

  // Stall + elapsed ticker, only while in flight.
  useEffect(() => {
    if (chatStatus !== "submitted" && chatStatus !== "streaming") {
      setStalled(false);
      setElapsedSec(0);
      return;
    }
    const interval = setInterval(() => {
      const now = Date.now();
      const start = inFlightStartRef.current ?? now;
      setElapsedSec(Math.max(0, Math.floor((now - start) / 1000)));
      const idleFor = now - lastActivityRef.current;
      setStalled(idleFor > STALL_MS);
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [chatStatus]);

  const markSend = useCallback(() => {
    clearCompleteTimer();
    stopRequestedRef.current = false;
    inFlightStartRef.current = Date.now();
    lastActivityRef.current = Date.now();
    setStalled(false);
    setElapsedSec(0);
    setBaseStatus("waiting");
  }, [clearCompleteTimer]);

  const markStop = useCallback(() => {
    stopRequestedRef.current = true;
    // Optimistic feedback before chatStatus flips to 'ready'.
    setBaseStatus((cur) =>
      cur === "waiting" || cur === "streaming" ? "stopped" : cur,
    );
  }, []);

  // Fold "streaming but stalled" back into "waiting" per the merged-state
  // spec. Also expose an `inFlight` flag for callers that just need a
  // boolean.
  const status: StreamStatus = useMemo(() => {
    if (baseStatus === "streaming" && stalled) return "waiting";
    return baseStatus;
  }, [baseStatus, stalled]);

  const inFlight = status === "waiting" || status === "streaming";

  const label = useMemo(() => {
    switch (status) {
      case "idle":
        return "Ready";
      case "waiting":
        return stalled
          ? `Still working… ${elapsedSec}s`
          : "Waiting for response…";
      case "streaming":
        return "Streaming…";
      case "stopped":
        return "Stopped";
      case "error":
        return error?.message ? `Error: ${error.message}` : "Request failed";
      case "complete":
        return "Complete";
      default:
        return "";
    }
  }, [status, stalled, elapsedSec, error]);

  return { status, stalled, elapsedSec, label, inFlight, markSend, markStop };
}