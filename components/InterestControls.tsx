"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveInterest,
  pauseInterest,
  deleteInterest,
  checkInterests,
  markInterestsSeen,
} from "@/app/actions/interests";
import {
  EMPTY_CRITERIA,
  describeCriteria,
  type Interest,
  type InterestCriteria,
} from "@/lib/interests/params";
import { mutationFailure, type MutationResult } from "@/lib/mutationResult";

const field = "mt-1 w-full rounded border border-line bg-card px-3 py-2";
const button =
  "rounded-full border border-line px-3 py-2 text-sm disabled:opacity-50";
export function InterestForm({
  interest,
  initial = EMPTY_CRITERIA,
  onSaved,
}: {
  interest?: Interest;
  initial?: InterestCriteria;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const id = useRef<string | null>(interest?.id ?? null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  return (
    <form
      className="my-3 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const form = e.currentTarget;
        const values = new FormData(form);
        const criteria = Object.fromEntries(
          Object.keys(EMPTY_CRITERIA).map((k) => [
            k,
            String(values.get(k) ?? ""),
          ]),
        ) as InterestCriteria;
        id.current ??= crypto.randomUUID();
        setBusy(true);
        setError("");
        setSaved(false);
        try {
          const result = await saveInterest(
            id.current,
            String(values.get("name") ?? ""),
            criteria,
            !interest,
          );
          if (!result.ok) setError(result.message);
          else {
            setSaved(true);
            if (!interest) {
              id.current = null;
              form.reset();
            }
            onSaved?.();
            router.refresh();
          }
        } catch (e) {
          setError(mutationFailure(e).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy} className="space-y-3">
        <label className="block text-sm">
          Interest name
          <input
            className={field}
            name="name"
            required
            maxLength={80}
            defaultValue={interest?.name ?? ""}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["q", "Search words", 300],
              ["topic", "Exact category", 64],
              ["venue", "Interest venue", 120],
              ["author", "Exact author name", 200],
              ["from", "Interest published from", 10],
              ["to", "Interest published through", 10],
            ] as const
          ).map(([key, label, max]) => (
            <label key={key} className="block text-sm">
              {label}
              <input
                className={field}
                name={key}
                type={key === "from" || key === "to" ? "date" : "text"}
                maxLength={max}
                defaultValue={(interest ?? initial)[key]}
              />
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          All filled criteria must match. Categories are exact (for example
          cs.AI). Venue and whole author names ignore case. Author names may
          refer to different people; stable author IDs are unavailable.
        </p>
        <button className={button} type="submit">
          {busy ? "Saving…" : interest ? "Save changes" : "Save interest"}
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error} Submit again to retry.
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm">
          Interest saved.{" "}
          <a href="/updates" className="text-accent underline">
            Check updates
          </a>
        </p>
      )}
    </form>
  );
}
export function SaveSearch({ criteria }: { criteria: InterestCriteria }) {
  return (
    <details className="my-4 rounded-xl border border-line p-4">
      <summary className="cursor-pointer text-sm font-medium">
        Save this search
      </summary>
      <InterestForm initial={criteria} />
    </details>
  );
}
function InterestItem({ interest }: { interest: Interest }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(action: () => Promise<MutationResult>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await action();
      if (!r.ok) setError(r.message);
      else router.refresh();
    } catch (e) {
      setError(mutationFailure(e).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article
      className="rounded-xl border border-line p-4"
      aria-label={interest.name}
    >
      <h3 className="font-medium">
        {interest.name}
        {interest.paused ? " · Paused" : ""}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {describeCriteria(interest)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {interest.lastSeenAt
          ? `Marked seen through ${new Date(interest.lastSeenAt).toISOString()}`
          : "No seen checkpoint yet"}
      </p>
      <div className="mt-3 flex gap-2">
        <button
          className={button}
          disabled={busy}
          onClick={() =>
            run(() => pauseInterest(interest.id, !interest.paused))
          }
        >
          {interest.paused ? "Resume" : "Pause"}
        </button>
        <button
          className={button}
          disabled={busy}
          onClick={() => run(() => deleteInterest(interest.id))}
        >
          Delete interest
        </button>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm">Edit interest</summary>
        <InterestForm interest={interest} />
      </details>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </article>
  );
}
export function InterestManager({ interests }: { interests: Interest[] }) {
  return (
    <section aria-label="Research interests" className="my-6 space-y-3">
      <h2 className="font-serif text-xl">Your interests</h2>
      <details className="rounded-xl border border-line p-4">
        <summary className="cursor-pointer text-sm">
          Follow a topic or author
        </summary>
        <InterestForm />
      </details>
      {interests.map((i) => (
        <InterestItem key={i.id} interest={i} />
      ))}
    </section>
  );
}
export function UpdateCheck({ auto, asOf }: { auto: boolean; asOf: string }) {
  const router = useRouter();
  const ran = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(check: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (check) {
        const result = await checkInterests();
        if (!result.ok) setError("Could not check updates. Please retry.");
        else
          router.replace(
            "/updates?asof=" +
              encodeURIComponent(new Date(result.data).toISOString()),
          );
      } else {
        const result = await markInterestsSeen(asOf);
        if (!result.ok) setError(result.message);
        else router.refresh();
      }
    } catch (e) {
      setError(mutationFailure(e).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (auto && !ran.current) {
      ran.current = true;
      void run(true);
    }
  }, [auto]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="my-4">
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={busy} onClick={() => run(true)}>
          {busy ? "Checking…" : "Check for new matches"}
        </button>
        <button
          className={button}
          disabled={busy || auto}
          onClick={() => run(false)}
        >
          Mark updates seen
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        New matches stay marked until you mark updates seen. This includes all
        pages through this check; later matches stay new.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
