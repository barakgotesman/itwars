/**
 * One slim row of the Game setup screen: the option's name and an info bubble on the left, its controls on the
 * right, and an optional muted note line underneath. A row has no background of its own: the setup screen puts all the rows of one group on a single panel, so related settings read as one unit (used for the server's bot capacity).
 */
import type { ReactNode } from 'react';
import { InfoTip } from './InfoTip';

/** Props for {@link SetupRow}. */
interface SetupRowProps {
  label: string;
  /** The longer explanation, shown in the info bubble. */
  hint: string;
  /** A small line under the row; `warn` colours it as a limit the host should notice. */
  note?: { text: string; warn?: boolean };
  /** Indents the row under the one above it (an option that depends on another). */
  nested?: boolean;
  children: ReactNode;
}

/** A labelled row with its controls on the right. */
export function SetupRow({ label, hint, note, nested = false, children }: SetupRowProps) {
  return (
    <div className={nested ? 'ml-4 border-l-2 border-accent/50' : ''}>
      <div className="flex items-center justify-between gap-4 px-3 py-2">
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-black">{label}</span>
          <InfoTip text={hint} />
        </div>
        {children}
      </div>
      {note && <div className={note.warn ? 'px-3 pt-1 text-xs font-bold text-accent' : 'px-3 pt-1 text-xs text-faint'}>{note.text}</div>}
    </div>
  );
}
