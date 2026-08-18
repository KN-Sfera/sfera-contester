"use client";

import { useEffect, useState } from "react";

/**
 * Media query as React state.
 *
 * Returns `false` until mounted — the server does not know the window width,
 * and guessing would end in a hydration mismatch. Components where this
 * matters (the editor facade) wait for `mounted`.
 */
export function useMediaQuery(query: string): { matches: boolean; mounted: boolean } {
  const [state, setState] = useState({ matches: false, mounted: false });

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setState({ matches: media.matches, mounted: true });
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return state;
}

/** The line past which Monaco gives way to CodeMirror. */
export const EDITOR_BREAKPOINT = "(min-width: 768px)";

/** The line from which the problem page opens into three columns. */
export const WORKSPACE_BREAKPOINT = "(min-width: 1024px)";
