/**
 * A carousel for a list of values: "<  value  >" with an arrow on each side. It replaces a long row of chips
 * (bots 0-7, kill limits...) on the Game setup screen. Arrows stop at the ends of the list, and values the
 * server cannot run (above `maxChoice`) are skipped.
 */

/** Props for {@link Stepper}. */
interface StepperProps {
  /** The values on offer, in order. */
  choices: readonly number[];
  /** The currently selected value. */
  value: number;
  /** Unit shown after a plain number, for example "kills". */
  unit: string;
  /** Texts parallel to `choices`; defaults to the number. */
  labels?: readonly string[];
  /** Choices above this are not reachable (a server limit). */
  maxChoice?: number;
  /** Called with the new value. */
  onPick(value: number): void;
}

/** Renders the arrows and the current value. */
export function Stepper({ choices, value, unit, labels, maxChoice = Infinity, onPick }: StepperProps) {
  const at = Math.max(0, choices.indexOf(value));
  const prev = at > 0 ? choices[at - 1]! : null;
  const next = at < choices.length - 1 && choices[at + 1]! <= maxChoice ? choices[at + 1]! : null;
  // "1 bots" reads wrong: drop the plural s for a single one.
  const noun = value === 1 ? unit.replace(/s$/, '') : unit;
  const text = labels?.[at] ?? (noun ? `${value} ${noun}` : `${value}`);
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className="choice w-9 !px-0" aria-label="Previous value" disabled={prev === null} onClick={() => prev !== null && onPick(prev)}>
        &lt;
      </button>
      <span className="min-w-24 text-center text-base font-black tabular-nums" aria-live="polite">{text}</span>
      <button type="button" className="choice w-9 !px-0" aria-label="Next value" disabled={next === null} onClick={() => next !== null && onPick(next)}>
        &gt;
      </button>
    </div>
  );
}
