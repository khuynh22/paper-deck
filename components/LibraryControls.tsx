"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createCollection,
  renameCollection,
  deleteCollection,
  setCollectionMembership,
  setLibraryStatus,
} from "@/app/actions/library";
import {
  libraryHref,
  STATUS_LABELS,
  type Collection,
  type LibraryParams,
} from "@/lib/library/params";
import { mutationFailure, type MutationResult } from "@/lib/mutationResult";
import type { ReadingStatus } from "@/lib/types";

function useLibraryMutation() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const retry = useRef<() => void>(() => {});
  const run = (
    operation: () => Promise<MutationResult>,
    done: () => void = () => {},
  ) => {
    retry.current = () => run(operation, done);
    start(async () => {
      setError("");
      try {
        const result = await operation();
        if (!result.ok) {
          setError(result.message);
          return;
        }
        done();
        router.refresh();
      } catch {
        setError(mutationFailure().message);
      }
    });
  };
  return {
    pending,
    run,
    feedback: error ? (
      <p role="alert" className="mt-2 text-xs text-danger">
        {error}{" "}
        <button
          type="button"
          onClick={() => retry.current()}
          className="underline"
        >
          Retry
        </button>
      </p>
    ) : pending ? (
      <p role="status" className="text-xs text-muted-foreground">
        Saving…
      </p>
    ) : null,
  };
}

export function PaperLibraryControls({
  paperId,
  status,
  collections,
  memberships,
}: {
  paperId: string;
  status: ReadingStatus;
  collections: Collection[];
  memberships: string[];
}) {
  const mutation = useLibraryMutation();
  return (
    <div className="-mt-1 mb-4 rounded-md bg-tint p-3">
      <label className="flex items-center gap-3 text-sm">
        Reading status
        <select
          aria-label="Reading status"
          value={status}
          disabled={mutation.pending}
          onChange={(event) => {
            const next = event.target.value as ReadingStatus;
            mutation.run(() => setLibraryStatus(paperId, next));
          }}
          className="rounded border border-line bg-card px-2 py-1"
        >
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {collections.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer">
            Collections ({memberships.length})
          </summary>
          <div className="mt-2 flex flex-wrap gap-3">
            {collections.map((collection) => (
              <label key={collection.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={memberships.includes(collection.id)}
                  disabled={mutation.pending}
                  onChange={(event) => {
                    const present = event.target.checked;
                    mutation.run(() =>
                      setCollectionMembership(collection.id, paperId, present),
                    );
                  }}
                />
                {collection.name}
              </label>
            ))}
          </div>
        </details>
      )}
      {mutation.feedback}
    </div>
  );
}

function CollectionRow({
  collection,
  params,
}: {
  collection: Collection;
  params: LibraryParams;
}) {
  const [name, setName] = useState(collection.name);
  const mutation = useLibraryMutation();
  const router = useRouter();
  return (
    <li className="rounded-md border border-line p-3">
      <Link
        className="font-medium text-accent underline"
        href={libraryHref(params, { collection: collection.id, page: 1 })}
      >
        {collection.name}
      </Link>
      <form
        className="mt-2 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.run(() => renameCollection(collection.id, name));
        }}
      >
        <input
          aria-label={`Name for ${collection.name}`}
          maxLength={80}
          required
          value={name}
          disabled={mutation.pending}
          onChange={(event) => setName(event.target.value)}
          className="min-w-0 flex-1 rounded border border-line bg-card px-2 py-1"
        />
        <button
          disabled={mutation.pending}
          className="text-sm underline"
          aria-label={`Rename ${collection.name}`}
        >
          Rename
        </button>
        <button
          type="button"
          disabled={mutation.pending}
          aria-label={`Delete ${collection.name}`}
          className="text-sm text-danger underline"
          onClick={() =>
            mutation.run(
              () => deleteCollection(collection.id),
              () => {
                if (params.collection === collection.id)
                  router.replace(
                    libraryHref(params, { collection: "", page: 1 }),
                  );
              },
            )
          }
        >
          Delete
        </button>
      </form>
      {mutation.feedback}
    </li>
  );
}

export function CollectionManager({
  collections,
  params,
}: {
  collections: Collection[];
  params: LibraryParams;
}) {
  const [name, setName] = useState("");
  const draft = useRef("");
  const requestId = useRef<string | null>(null);
  const mutation = useLibraryMutation();
  return (
    <details className="my-5 rounded-xl border border-line p-4">
      <summary className="cursor-pointer font-medium">
        Manage collections
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">
        Collections are private. Deleting one keeps your saved papers, notes and
        progress.
      </p>
      <form
        className="my-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          requestId.current ??= crypto.randomUUID();
          const id = requestId.current;
          const submitted = name;
          mutation.run(
            () => createCollection(id, submitted),
            () => {
              if (draft.current === submitted) {
                setName("");
                draft.current = "";
              }
              requestId.current = null;
            },
          );
        }}
      >
        <input
          aria-label="New collection name"
          placeholder="Collection name"
          maxLength={80}
          required
          value={name}
          disabled={mutation.pending}
          onChange={(event) => {
            draft.current = event.target.value;
            setName(event.target.value);
          }}
          className="min-w-0 flex-1 rounded border border-line bg-card px-2 py-2 text-sm"
        />
        <button
          disabled={mutation.pending}
          className="rounded-full bg-accent px-3 py-2 text-sm text-white"
        >
          Create collection
        </button>
      </form>
      {mutation.feedback}
      <ul className="space-y-2">
        {collections.map((collection) => (
          <CollectionRow
            key={collection.id}
            collection={collection}
            params={params}
          />
        ))}
      </ul>
    </details>
  );
}
