"use client";

import { useState } from "react";
import { AUDIENCE_TITLES, CURRICULA, searchLessons, type Audience, type Lesson } from "@/lib/training";
import { TrainingArt } from "./training-art";

/**
 * The Learn screen. One component for all three audiences, because the difference between them is
 * the content and the scale, not the structure — and one structure means a parent who has read
 * their own course already knows how their kid's works.
 *
 * Two modes:
 * - **index**: every lesson as a card, searchable, so someone who came here with a specific
 *   question ("what does the hold do?") lands on the answer in one tap rather than paging through.
 * - **lesson**: one lesson, art first, with prev/next.
 *
 * The little-kid version drops the search box and the index — six pictures with a big arrow is the
 * whole interface — and everything is sized for a finger and a reader who isn't reading.
 */
export function Training({
  audience,
  /** Shown as a first-run overlay: adds Skip, and a done button that says so. */
  firstRun = false,
  startAt,
  onClose,
  onFinish,
}: {
  audience: Audience;
  firstRun?: boolean;
  /** Open straight to one lesson, for a "what is this?" link next to a feature. */
  startAt?: string;
  onClose: () => void;
  /** Called when the reader gets to the end, or taps Skip. Marks the course as seen. */
  onFinish?: () => void;
}) {
  const lessons = CURRICULA[audience];
  const young = audience === "young";
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(startAt ?? (young ? lessons[0].id : null));

  const openIndex = lessons.findIndex((lesson) => lesson.id === openId);
  const open = openIndex >= 0 ? lessons[openIndex] : null;
  const results = searchLessons(audience, query);
  const titles = AUDIENCE_TITLES[audience];

  function finish() {
    onFinish?.();
    onClose();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className={young ? "text-2xl font-bold" : "text-lg font-semibold"}>
            🎓 {open && young ? open.title : titles.title}
          </h2>
          {!open && <p className="text-sm opacity-60">{titles.subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={firstRun ? finish : onClose}
          className={`shrink-0 rounded-full border border-black/20 dark:border-white/20 ${
            young ? "px-4 py-2 text-base" : "px-3 py-1.5 text-sm"
          }`}
        >
          {firstRun ? (young ? "Skip" : "Skip for now") : "Close"}
        </button>
      </div>

      {open ? (
        <LessonView
          lesson={open}
          audience={audience}
          index={openIndex}
          count={lessons.length}
          onPrev={openIndex > 0 ? () => setOpenId(lessons[openIndex - 1].id) : null}
          onNext={openIndex < lessons.length - 1 ? () => setOpenId(lessons[openIndex + 1].id) : null}
          onBackToIndex={young ? null : () => setOpenId(null)}
          onFinish={finish}
          finishLabel={firstRun ? (young ? "All done! 🎉" : "Got it — start using the app") : "Back to the list"}
          isLast={openIndex === lessons.length - 1}
        />
      ) : (
        <>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search — try “crypto”, “tax”, “PIN”…"
            aria-label="Search the lessons"
            className="w-full rounded-lg border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
          />
          {results.length === 0 ? (
            <p className="text-sm opacity-60">Nothing on “{query}” yet.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {results.map((lesson) => (
                <button
                  key={lesson.id}
                  type="button"
                  onClick={() => setOpenId(lesson.id)}
                  className="flex items-start gap-3 rounded-xl border border-black/10 p-3 text-left hover:bg-black/[0.03] dark:border-white/10 dark:hover:bg-white/[0.06]"
                >
                  <span className="text-2xl" aria-hidden>
                    {lesson.emoji}
                  </span>
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium">{lesson.title}</span>
                    <span className="block text-xs opacity-60">{lesson.blurb}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {firstRun && (
            <button
              type="button"
              onClick={() => setOpenId(lessons[0].id)}
              className="w-full rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-black"
            >
              Start from the beginning
            </button>
          )}
        </>
      )}
    </div>
  );
}

function LessonView({
  lesson,
  audience,
  index,
  count,
  onPrev,
  onNext,
  onBackToIndex,
  onFinish,
  finishLabel,
  isLast,
}: {
  lesson: Lesson;
  audience: Audience;
  index: number;
  count: number;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onBackToIndex: (() => void) | null;
  onFinish: () => void;
  finishLabel: string;
  isLast: boolean;
}) {
  const young = audience === "young";
  const parent = audience === "parent";

  return (
    <div className="space-y-4">
      {onBackToIndex && (
        <button type="button" onClick={onBackToIndex} className="text-xs opacity-60 underline">
          ← All lessons
        </button>
      )}

      {/* Art first, always. For a little kid it's the entire lesson; for everyone else it's the
          thing they'll still remember after the words have gone. */}
      <TrainingArt kind={lesson.art} audience={audience} />

      {!young && (
        <h3 className="text-base font-semibold">
          {lesson.emoji} {lesson.title}
        </h3>
      )}

      {parent && lesson.why && (
        <div className="space-y-1 rounded-xl border-l-4 border-black/20 bg-black/[0.02] p-3 dark:border-white/25 dark:bg-white/[0.04]">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-50">Why it&apos;s here</p>
          <p className="text-sm leading-relaxed">{lesson.why}</p>
        </div>
      )}

      <ul className={young ? "space-y-3" : "space-y-1.5"}>
        {lesson.points.map((point) => (
          <li
            key={point}
            className={young ? "text-center text-xl font-semibold leading-snug" : "flex gap-2 text-sm leading-relaxed"}
          >
            {!young && <span aria-hidden className="opacity-40">•</span>}
            <span>{point}</span>
          </li>
        ))}
      </ul>

      {parent && lesson.how && (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-50">How to use it</p>
          <ol className="space-y-1.5">
            {lesson.how.map((step, stepIndex) => (
              <li key={step} className="flex gap-2 text-sm leading-relaxed">
                <span aria-hidden className="shrink-0 opacity-40">
                  {stepIndex + 1}.
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-black/10 pt-3 dark:border-white/10">
        <button
          type="button"
          disabled={!onPrev}
          onClick={() => onPrev?.()}
          aria-label="Previous lesson"
          className={`rounded-full border border-black/20 disabled:opacity-25 dark:border-white/20 ${
            young ? "px-6 py-4 text-2xl" : "px-3 py-1.5 text-sm"
          }`}
        >
          ←
        </button>

        {young ? (
          <div className="flex gap-1.5" aria-label={`Lesson ${index + 1} of ${count}`}>
            {Array.from({ length: count }, (_, dot) => (
              <span
                key={dot}
                aria-hidden
                className={`h-2.5 w-2.5 rounded-full ${dot === index ? "bg-black dark:bg-white" : "bg-black/20 dark:bg-white/25"}`}
              />
            ))}
          </div>
        ) : (
          <span className="text-xs opacity-50">
            {index + 1} of {count}
          </span>
        )}

        {isLast ? (
          <button
            type="button"
            onClick={onFinish}
            className={`rounded-full bg-black font-medium text-white dark:bg-white dark:text-black ${
              young ? "px-5 py-4 text-lg" : "px-4 py-1.5 text-sm"
            }`}
          >
            {young ? "Done! 🎉" : finishLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onNext?.()}
            aria-label="Next lesson"
            className={`rounded-full bg-black text-white dark:bg-white dark:text-black ${
              young ? "px-6 py-4 text-2xl" : "px-4 py-1.5 text-sm"
            }`}
          >
            →
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * A full-screen sheet rather than an inline panel. Used for the first run — the first thing a new
 * user should see is the course, not the app behind it — and for a little kid opening it later,
 * since burying their lesson at the bottom of a long home screen means they'd never reach it.
 */
export function TrainingOverlay(props: React.ComponentProps<typeof Training>) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-3 backdrop-blur-sm sm:p-6">
      <div className="mx-auto max-w-2xl rounded-2xl bg-white p-4 shadow-xl dark:bg-neutral-900 sm:p-6">
        <Training {...props} />
      </div>
    </div>
  );
}
