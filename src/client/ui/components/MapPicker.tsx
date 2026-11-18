/**
 * The map choice on the Game setup screen: one card per map in the registry, each with a screenshot of the real map (`public/maps/<id>.jpg`, made by `tools/maps.html`), its
 * name, size and a line about it. A new map in `MAPS` / `MAP_INFO` appears here without screen changes.
 */
import { MAP_INFO } from '@shared/world/map/map-info';

/** Props for {@link MapPicker}. */
interface MapPickerProps {
  /** The chosen map (index into `MAPS`). */
  value: number;
  onPick(map: number): void;
}

/** A row of map cards; the chosen one is pressed in and yellow like the mode cards. */
export function MapPicker({ value, onPick }: MapPickerProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {MAP_INFO.map((info, i) => {
        const active = i === value;
        return (
          <button
            key={info.id}
            type="button"
            aria-pressed={active}
            className={active ? 'slab flex cursor-pointer flex-col gap-1.5 bg-accent p-2 text-left text-ground' : 'slab flex cursor-pointer flex-col gap-1.5 bg-panel p-2 text-left hover:bg-raised'}
            onClick={() => onPick(i)}
          >
            <img src={`/maps/${info.id}.jpg`} alt={`${info.name}, seen from inside`} width={960} height={640} loading="lazy" className="aspect-[3/2] w-full bg-ground object-cover" />
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-black uppercase tracking-wider">{info.name}</span>
              <span className={active ? 'text-xs font-bold' : 'text-xs font-bold text-dim'}>{info.size}</span>
            </span>
            <span className={active ? 'text-xs font-semibold' : 'text-xs text-dim'}>{info.blurb}</span>
          </button>
        );
      })}
    </div>
  );
}
