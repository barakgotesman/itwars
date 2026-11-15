/**
 * A row of choice buttons with the current value highlighted (used by the Game setup screen).
 */

/** Props for {@link Chips}. */
interface ChipsProps {
  /** The values on offer. */
  choices: readonly number[];
  /** The currently selected value. */
  value: number;
  /** Unit for the tooltip, for example "kills". */
  unit: string;
  /** Button texts, parallel to `choices`; defaults to the number. */
  labels?: readonly string[];
  /** Choices above this are disabled (a server limit). */
  maxChoice?: number;
  /** Smaller chips, for rows that share a line with a label. */
  compact?: boolean;
  /** Called with the picked value. */
  onPick(value: number): void;
}

/** Renders the choices as pressable chips. */
export function Chips({ choices, value, unit, labels, maxChoice = Infinity, compact = false, onPick }: ChipsProps) {
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {choices.map((c, k) => {
        const tooMany = c > maxChoice;
        return (
          <button
            key={c}
            type="button"
            disabled={tooMany}
            aria-pressed={c === value}
            title={tooMany ? 'This server cannot run that many bots right now' : (labels?.[k] ?? `${c} ${unit}`)}
            className={`choice ${compact ? 'min-w-10 !px-2.5 !py-1' : 'min-w-16'}${tooMany ? ' pointer-events-none opacity-35' : ''}`}
            onClick={() => onPick(c)}
          >
            {labels?.[k] ?? `${c}`}
          </button>
        );
      })}
    </div>
  );
}
