import { serverClient } from "@/lib/db/server";
import { mutationFailure, type MutationResult } from "@/lib/mutationResult";

/** Authenticate each write and turn transport/auth failures into safe results. */
export async function withMutation<T>(
  write: (db: Awaited<ReturnType<typeof serverClient>>, userId: string) => Promise<MutationResult<T>>,
): Promise<MutationResult<T>> {
  try {
    const db = await serverClient();
    const { data, error } = await db.auth.getUser();
    if (error) return mutationFailure(error);
    if (!data.user) return mutationFailure({ status: 401 });
    return await write(db, data.user.id);
  } catch (error) {
    return mutationFailure(error);
  }
}
