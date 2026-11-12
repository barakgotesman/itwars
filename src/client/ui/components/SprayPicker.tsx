/**
 * The spray design picker: a small carousel with the chosen design shown large on a neutral grey stage (so yellow,
 * white and black designs all stay visible, which a highlighted button could not do), arrows to step through, the
 * design's name and a dot per design. Left and Right arrow keys step too while it has focus.
 */
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { SPRAYS, SPRAY_COUNT } from '@shared/rules/sprays';
import { drawSpray } from '@client/render/sprays';
import { Icon } from './Icon';

/** Props for {@link SprayPicker}. */
interface SprayPickerProps {
  /** Index of the chosen design. */
  value: number;
  /** Called with the new index when the player steps to another design. */
  onChange(index: number): void;
}

/** The carousel. */
export function SprayPicker({ value, onChange }: SprayPickerProps) {
  const art = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = art.current?.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, 16, 16);
    g.drawImage(drawSpray(value), 0, 0);
  }, [value]);

  const go = (i: number) => onChange((i + SPRAY_COUNT) % SPRAY_COUNT);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(value - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(value + 1); }
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2" tabIndex={0} onKeyDown={onKey}>
      <button type="button" className="btn-quiet inline-flex !p-2.5" aria-label="Previous spray design" onClick={() => go(value - 1)}>
        <Icon name="prev" />
      </button>
      {/* A mid-grey stage: every design, light or dark, contrasts with it. */}
      <div className="flex h-20 w-20 shrink-0 items-center justify-center bg-[#5a6275]">
        <canvas ref={art} width={16} height={16} className="h-16 w-16 [image-rendering:pixelated]" />
      </div>
      <button type="button" className="btn-quiet inline-flex !p-2.5" aria-label="Next spray design" onClick={() => go(value + 1)}>
        <Icon name="next" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="truncate text-base font-extrabold">{SPRAYS[value]!.name}</div>
        <div className="flex flex-wrap gap-1">
          {SPRAYS.map((s, i) => (
            <button
              key={s.name}
              type="button"
              title={s.name}
              aria-label={`Spray design: ${s.name}`}
              className={i === value ? 'h-2.5 w-2.5 cursor-pointer bg-accent' : 'h-2.5 w-2.5 cursor-pointer bg-[#3a4766] hover:bg-faint'}
              onClick={() => go(i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
