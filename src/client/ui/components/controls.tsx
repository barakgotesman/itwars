/**
 * Generic form controls shared by the Settings and Game setup screens: a labelled row, a section heading,
 * a range slider, an on/off switch, segmented choice buttons and a "reset to defaults" button.
 */
import type { ReactNode } from 'react';

/** One labelled row with a control on the right. */
export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 px-3 py-2.5 hover:bg-panel">
      <div>
        <div className="text-sm font-bold">{label}</div>
        {hint && <div className="text-xs text-dim">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

/** Section heading inside a tab. */
export function Heading({ children }: { children: ReactNode }) {
  return <div className="mt-6 px-3 text-lg font-black">{children}</div>;
}

/** Range slider with a live value label. */
export function Slider({ min, max, step, value, format, onInput }: {
  min: number; max: number; step: number; value: number; format(v: number): string; onInput(v: number): void;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range" min={min} max={max} step={step} value={value} className="w-52 cursor-pointer"
        onChange={(e) => onInput(Number(e.target.value))}
      />
      <span className="w-14 text-right text-sm font-bold tabular-nums">{format(value)}</span>
    </div>
  );
}

/** On/off switch. */
export function Toggle({ value, onChange }: { value: boolean; onChange(v: boolean): void }) {
  return (
    <button type="button" className="choice w-20" aria-pressed={value} onClick={() => onChange(!value)}>
      {value ? 'On' : 'Off'}
    </button>
  );
}

/** Segmented choice buttons. */
export function Choice<T extends string | number>({ options, value, onChange }: {
  options: readonly { label: string; value: T }[]; value: T; onChange(v: T): void;
}) {
  return (
    <div className="flex gap-1.5">
      {options.map((o) => (
        <button key={o.value} type="button" className="choice" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Button that resets a group of options to their defaults. */
export function ResetButton({ onClick, children }: { onClick(): void; children: ReactNode }) {
  return <button type="button" className="btn-quiet mt-6 self-start" onClick={onClick}>{children}</button>;
}
