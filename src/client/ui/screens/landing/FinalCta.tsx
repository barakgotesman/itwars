/**
 * The closing call to action above the footer: a last chance to host a game or warm up on the range.
 */
import { FINAL_HEADLINE, FINAL_TEXT } from './copy';

/** Props for {@link FinalCta}. */
interface FinalCtaProps {
  /** True while a host/join request is in flight. */
  busy: boolean;
  onHost(): void;
  onRange(): void;
}

/** The closing band. */
export function FinalCta({ busy, onHost, onRange }: FinalCtaProps) {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-5 px-8 py-16 text-center">
      <h2 className="text-5xl font-black uppercase tracking-wide">{FINAL_HEADLINE}</h2>
      <p className="text-lg text-dim">{FINAL_TEXT}</p>
      <div className="flex flex-wrap justify-center gap-4">
        <button type="button" className="btn !py-4 !text-xl" disabled={busy} onClick={onHost}>Host a game</button>
        <button type="button" className="btn-quiet !py-4 !text-base" disabled={busy} onClick={onRange}>Shooting Range</button>
      </div>
    </section>
  );
}
