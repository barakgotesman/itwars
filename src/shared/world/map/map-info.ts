/**
 * The names and short descriptions of the maps a host can pick. Pure data with no geometry, so the setup screen,
 * the rules code and the lobby browser can list maps without building any of them (`maps.ts` holds the real
 * `MapDef`s). The index in `MAP_INFO` is the value of the `map` rule on the wire, so only ever append.
 */

/** What the setup screen shows for one map. */
export interface MapInfo {
  /** Stable slug: the thumbnail file name (`public/maps/<id>.png`) and the key of the map in `MAPS`. */
  id: string;
  name: string;
  blurb: string;
  /** Short size and player-count hint shown on the card, e.g. "Large · 4-8 players". */
  size: string;
}

/** Every selectable map; the first is the default. Index = the `map` rule's value. */
export const MAP_INFO: readonly MapInfo[] = [
  { id: 'office', name: 'The Office', blurb: 'The full 100 m office: open plan, a ring of rooms, doors, the RPG in the Server room.', size: 'Large · 4-8 players' },
  { id: 'datacenter', name: 'Data Center', blurb: 'Rows of humming server racks, cold aisles, a control room and a tape vault. Tight and fast.', size: 'Small · 2-4 players' },
];

/** Values of the `map` rule (the indices of `MAP_INFO`), for the rules validator and the setup option. */
export const MAP_IDS: readonly number[] = MAP_INFO.map((_, i) => i);
/** Names in the same order as `MAP_IDS`, for option labels and summaries. */
export const MAP_NAMES: readonly string[] = MAP_INFO.map((m) => m.name);

/**
 * Display name of a map by rule value.
 * @param map - The `map` rule; anything unknown reads as the default map.
 */
export function mapName(map: number): string {
  return (MAP_INFO[map] ?? MAP_INFO[0]!).name;
}
