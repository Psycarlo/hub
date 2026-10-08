import { useEffect, useMemo, useRef } from "react";

import { onLeave } from "@/lib/leaving";

const PAUSE_MS = 600;

export interface SaveWhileTyping {
  /** A change was typed: it saves once typing pauses. */
  typed: () => void;
  /** Saves now, instead of after the pause. */
  save: () => void;
}

/**
 * Saves typing after a short pause, and right away when the page is hidden or
 * left or the field unmounts, so a closed tab or a crash keeps what was typed.
 */
export function useSaveWhileTyping(save: () => void): SaveWhileTyping {
  const latest = useRef(save);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latest.current = save;
  });

  const typing = useMemo(() => {
    const stop = () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
    const saveNow = () => {
      stop();
      latest.current();
    };
    return {
      // Saves only typing still waiting on its pause.
      pending: () => {
        if (timer.current !== null) {
          saveNow();
        }
      },
      save: saveNow,
      typed: () => {
        stop();
        timer.current = setTimeout(saveNow, PAUSE_MS);
      },
    };
  }, []);

  useEffect(() => {
    const stopSaving = onLeave(typing.pending);
    return () => {
      stopSaving();
      typing.pending();
    };
  }, [typing]);

  return typing;
}
