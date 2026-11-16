/**
 * The first screen: the logo, the headline and the play block on the left, and on the right the selected character
 * standing in front of the live office (the preview canvas is transparent and the menu backdrop shows through).
 * Arrows on either side step through the characters (the preview spins one out and the next in), and the shirt
 * colours and spray tag are picked right under it, so the whole look is chosen in one place.
 * A dark scrim on the left keeps the text readable while the office stays visible on the right.
 */
import type { RefObject } from 'react';
import { CHARACTERS, PLAYER_COLORS } from '@shared/core/characters';
import { Icon } from '../../components/Icon';
import { Logo } from '../../components/Logo';
import { SprayPicker } from '../../components/SprayPicker';
import { HEADLINE, SUBHEAD } from './copy';
import { PlayPanel, type PlayPanelProps } from './PlayPanel';

/** Hex colour string for a shirt colour. */
const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** Props for {@link Hero}: the play block's props plus the character's look. */
interface HeroProps extends PlayPanelProps {
  /** Canvas the 3D character preview draws into. */
  previewCanvas: RefObject<HTMLCanvasElement | null>;
  /** Selected character index. */
  model: number;
  /** Selected shirt colour index. */
  color: number;
  onColor(color: number): void;
  /** Steps to the next (+1) or previous (-1) character. */
  onStep(direction: 1 | -1): void;
  /** Selected spray design index. */
  spray: number;
  onSpray(spray: number): void;
}

/** The hero section. */
export function Hero({ previewCanvas, model, color, onColor, onStep, spray, onSpray, ...play }: HeroProps) {
  const character = CHARACTERS[model]!;
  return (
    <div id="top" className="relative min-h-[calc(100vh-3.5rem)] w-full shrink-0">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ground/95 via-ground/75 to-transparent" aria-hidden="true" />
      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-x-10 gap-y-8 px-8 py-8 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <h1 className="w-full max-w-md"><Logo /></h1>
          <div>
            <p className="text-3xl font-black leading-tight">{HEADLINE}</p>
            <p className="mt-3 text-base text-dim">{SUBHEAD}</p>
          </div>
          <PlayPanel {...play} />
        </div>
        <div className="flex min-w-0 flex-col items-center gap-3">
          <div className="flex w-full items-center gap-2">
            <button type="button" className="btn-quiet shrink-0 !p-3" aria-label="Previous character" onClick={() => onStep(-1)}><Icon name="prev" size={22} /></button>
            <canvas ref={previewCanvas} className="h-[clamp(18rem,52vh,34rem)] w-0 min-w-0 flex-1" aria-label={`${character.name}, drag to turn`} />
            <button type="button" className="btn-quiet shrink-0 !p-3" aria-label="Next character" onClick={() => onStep(1)}><Icon name="next" size={22} /></button>
          </div>
          <div className="text-center">
            <div className="text-3xl font-black">{character.name}</div>
            <div className="mt-1 text-sm text-dim">{character.blurb}</div>
          </div>
          <div className="flex gap-1.5" aria-hidden="true">
            {CHARACTERS.map((c, i) => <span key={c.slug} className={`h-1.5 w-5 ${i === model ? 'bg-accent' : 'bg-faint'}`} />)}
          </div>
          <div className="flex flex-nowrap gap-1.5">
            {PLAYER_COLORS.map((c, i) => (
              <button
                key={c}
                type="button"
                title={`Colour ${i + 1}`}
                aria-pressed={i === color}
                className={`h-7 w-7 cursor-pointer outline-offset-2 outline-ink ${i === color ? 'outline-3' : ''}`}
                style={{ backgroundColor: hex(c) }}
                onClick={() => onColor(i)}
              />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="label shrink-0">Spray <kbd className="keycap">T</kbd></span>
            <SprayPicker value={spray} onChange={onSpray} />
          </div>
        </div>
      </div>
    </div>
  );
}
