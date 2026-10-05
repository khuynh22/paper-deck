"use client";

import { useEffect } from "react";

const dirtySources = new Set<symbol>();

function beforeUnload(event: BeforeUnloadEvent) {
  if (!dirtySources.size) return;
  event.preventDefault();
  event.returnValue = "";
}

function onLink(event: MouseEvent) {
  if (!dirtySources.size || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
  const target = new URL(link.href, window.location.href);
  if (target.origin === window.location.origin && target.pathname === window.location.pathname && target.search === window.location.search) return;
  if (!window.confirm("You have unsaved changes. Stay here to save or retry them. Leave without saving?")) {
    event.preventDefault();
    event.stopPropagation();
  }
}

/** One navigation guard shared by progress and highlights in this document. */
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const first = dirtySources.size === 0;
    const id = Symbol();
    dirtySources.add(id);
    if (first) {
      window.addEventListener("beforeunload", beforeUnload);
      document.addEventListener("click", onLink, true);
    }
    return () => {
      dirtySources.delete(id);
      if (!dirtySources.size) {
        window.removeEventListener("beforeunload", beforeUnload);
        document.removeEventListener("click", onLink, true);
      }
    };
  }, [dirty]);
}
