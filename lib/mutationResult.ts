/** Serializable acknowledgements shared by reader actions and their clients. */
export type MutationFailure = {
  ok: false;
  code: "auth" | "storage" | "validation";
  message: string;
};
export type MutationResult<T = undefined> = { ok: true; data: T } | MutationFailure;

export function mutationFailure(error?: unknown): MutationFailure {
  const e = error as { status?: number; code?: string; name?: string } | null;
  const auth = e?.status === 401 || e?.status === 403 || e?.name === "AuthSessionMissingError" ||
    ["PGRST301", "PGRST302", "PGRST303", "session_not_found", "refresh_token_not_found", "refresh_token_already_used"].includes(e?.code ?? "");
  return auth
    ? { ok: false, code: "auth", message: "Sign in again, then retry. Your changes are still here." }
    : { ok: false, code: "storage", message: "Couldn’t save. Your changes are still here. Please retry." };
}
