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
  /** Called with the picked value. */
  onPick(value: number): void;
}

/** Renders the choices as pressable chips. */
export function Chips({ choices, value, unit, labels, maxChoice = Infinity, onPick }: ChipsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {choices.map((c, k) => {
        const tooMany = c > maxChoice;
        return (
          <button
            key={c}
            type="button"
            disabled={tooMany}
            aria-pressed={c === value}
            title={tooMany ? 'This server cannot run that many bots right now' : (labels?.[k] ?? `${c} ${unit}`)}
            className={tooMany ? 'choice pointer-events-none min-w-16 opacity-35' : 'choice min-w-16'}
            onClick={() => onPick(c)}
          >
            {labels?.[k] ?? `${c}`}
          </button>
        );
      })}
    </div>
  );
}
