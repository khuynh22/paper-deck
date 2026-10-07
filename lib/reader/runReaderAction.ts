"use client";

import { startTransition } from "react";
import { mutationFailure, type MutationResult } from "@/lib/mutationResult";

/** Keep urgent save feedback outside the async Server Action transition. */
export function runReaderAction<T>(action: () => Promise<MutationResult<T>>): Promise<MutationResult<T>> {
  return new Promise((resolve) => {
    startTransition(async () => {
      try { resolve(await action()); }
      catch (error) { resolve(mutationFailure(error)); }
    });
  });
}
