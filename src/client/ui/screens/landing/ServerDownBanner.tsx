/**
 * A red strip across the top of the main menu shown while the game server cannot be reached, so nobody
 * clicks Host or Join and only then finds out. It disappears by itself once the server answers again.
 */
export function ServerDownBanner() {
  return (
    <div role="alert" className="flex shrink-0 items-center justify-center gap-3 bg-danger px-4 py-2 text-center text-sm font-black uppercase tracking-wider text-ground">
      <span aria-hidden="true">!</span>
      <span>Cannot reach the game server. Hosting and joining will not work until it is running again.</span>
    </div>
  );
}
