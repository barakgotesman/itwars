/**
 * "The arenas": a showcase of the playable maps. A big picture with a caption, a tab per map and a strip of
 * thumbnails. It steps through every picture of every map by itself (pausing while the pointer is over it, and
 * never under reduced motion); clicking a tab or a thumbnail takes over. The pictures are real renders of the maps
 * (`public/maps/<id>-<slug>.jpg`, made by `tools/maps.html`), the words are in `copy.ts`.
 */
import { useEffect, useMemo, useState } from 'react';
import { MAP_INFO, PICTURES_REV } from '@shared/world/map/map-info';
import { MAPS } from '@shared/world/map/maps';
import { Icon } from '../../components/Icon';
import { ARENA_TEXT, MAP_STORIES } from './copy';
import { Section } from './Section';

/** Milliseconds each picture stays up before the showcase moves on. */
const SLIDE_MS = 5500;

/** One picture of one map, flattened for stepping through. */
interface Slide {
  /** Index into `MAPS` / `MAP_INFO`. */
  map: number;
  src: string;
  title: string;
  line: string;
}

/** The arenas section. */
export function Arena() {
  const slides = useMemo<Slide[]>(
    () => MAPS.flatMap((map, i) => map.gallery.map((g): Slide => {
      const caption = MAP_STORIES[map.id]?.captions[g.slug];
      return { map: i, src: `/maps/${map.id}-${g.slug}.jpg?v=${PICTURES_REV}`, title: caption?.title ?? g.slug, line: caption?.line ?? '' };
    })),
    [],
  );
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const current = slides[index]!;
  const mapSlides = slides.map((s, i) => ({ s, i })).filter((x) => x.s.map === current.map);

  useEffect(() => {
    if (paused || reduceMotion) return;
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % slides.length), SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [index, paused, reduceMotion, slides.length]);

  return (
    <Section id="arena" kicker="03 / The arenas" title="Pick your battlefield" intro={ARENA_TEXT}>
      {/* Compact: the picture on the left, the map tabs and a 2 x 2 strip of thumbnails in a narrow column beside it. */}
      <div className="grid max-w-4xl gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        {/* Every picture is stacked and cross-faded, so changing slide never shows an empty frame. */}
        <div
          className="slab relative aspect-video w-full overflow-hidden bg-ground"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {slides.map((s, i) => (
            <img
              key={s.src}
              src={s.src}
              alt={s.title}
              loading={i === 0 ? 'eager' : 'lazy'}
              width={1280}
              height={720}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${i === index ? 'opacity-100' : 'opacity-0'}`}
            />
          ))}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ground/90 via-ground/50 to-transparent px-4 pb-4 pt-12">
            <p className="text-lg font-black uppercase tracking-wide">{current.title}</p>
            <p className="text-sm text-dim">{current.line}</p>
          </div>
          <span className="absolute right-3 top-3 bg-ground/70 px-2 py-0.5 text-xs font-black tabular-nums text-ink">{index + 1} / {slides.length}</span>
          {([-1, 1] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-label={d < 0 ? 'Previous picture' : 'Next picture'}
              className={`absolute top-1/2 -translate-y-1/2 cursor-pointer bg-ground/70 p-2 text-ink hover:bg-accent hover:text-ground ${d < 0 ? 'left-3' : 'right-3'}`}
              onClick={() => setIndex((i) => (i + d + slides.length) % slides.length)}
            >
              <Icon name={d < 0 ? 'prev' : 'next'} size={18} />
            </button>
          ))}
          {/* Fills over one slide and restarts with it (the key); it stops when the pointer is over the picture. */}
          {!reduceMotion && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-ground/60">
              <div key={`${index}-${paused}`} className="arena-progress h-full bg-accent" style={{ '--slide-ms': `${SLIDE_MS}ms`, animationPlayState: paused ? 'paused' : 'running' } as React.CSSProperties} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {MAP_INFO.map((info, m) => {
            const active = m === current.map;
            return (
              <button
                key={info.id}
                type="button"
                aria-pressed={active}
                className={active ? 'slab cursor-pointer bg-accent px-4 py-2.5 text-left text-ground' : 'slab cursor-pointer bg-panel px-4 py-2.5 text-left hover:bg-raised'}
                onClick={() => setIndex(slides.findIndex((s) => s.map === m))}
              >
                <span className="block text-base font-black uppercase tracking-wide">{info.name}</span>
                <span className={active ? 'block text-xs font-bold' : 'block text-xs font-bold text-dim'}>{info.size}</span>
                <span className={active ? 'block text-xs font-semibold' : 'block text-xs text-dim'}>{MAP_STORIES[info.id]?.tagline}</span>
              </button>
            );
          })}
          <ul className="grid grid-cols-2 gap-2">
            {mapSlides.map(({ s, i }) => (
              <li key={s.src}>
                <button
                  type="button"
                  aria-label={s.title}
                  aria-pressed={i === index}
                  className={`slab block w-full cursor-pointer overflow-hidden p-0 ${i === index ? 'outline outline-2 outline-accent' : 'opacity-70 hover:opacity-100'}`}
                  onClick={() => setIndex(i)}
                >
                  <img src={s.src} alt="" loading="lazy" width={1280} height={720} className="aspect-video w-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
