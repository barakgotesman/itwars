/**
 * A weapon or grenade icon drawn from its pixel blocks (see `hud/gun-icons.ts`) as inline SVG.
 */
import { iconBlocks, type IconKind } from '@client/hud/gun-icons';

/** Props for {@link GunIcon}. */
interface GunIconProps {
  /** Weapon index or grenade type. */
  kind: IconKind;
  /** Tailwind classes that size the box (the SVG fills it). */
  className: string;
}

/** Renders one icon. */
export function GunIcon({ kind, className }: GunIconProps) {
  return (
    <span className={className}>
      <svg viewBox="0 0 48 24" shapeRendering="crispEdges" className="h-full w-full" aria-hidden="true">
        {iconBlocks(kind).map(([x, y, w, h, c], i) => <rect key={i} x={x} y={y} width={w} height={h} fill={c} />)}
      </svg>
    </span>
  );
}
