/**
 * The Game setup summary bar: every chosen rule as a small icon with its value, instead of a sentence, so it
 * reads at a glance and never runs out of room. Each item keeps a plain-words title for the tooltip and
 * screen readers.
 */
import { MODES, type MatchRules } from '@shared/rules/modes';
import { botSkillName } from '@shared/rules/bots';
import { GunIcon } from './GunIcon';
import { Icon, type IconName } from './Icon';

/** One icon plus an optional value, with the same thing spelled out for the tooltip. */
function Item({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-ink" title={title} aria-label={title} role="img">
      {children}
    </span>
  );
}

/** A framed block holding the icons of one topic, so related settings read as a unit. */
function Cluster({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-3 bg-raised px-2.5 py-1">{children}</div>;
}

/** An icon with a number or short value next to it. */
function IconValue({ icon, value }: { icon: IconName; value?: string }) {
  return (
    <>
      <Icon name={icon} size={20} />
      {value !== undefined && <span className="text-base font-black tabular-nums">{value}</span>}
    </>
  );
}

/** Three stars, the first `level` of them lit, like a difficulty rating: bot skill. */
function SkillStars({ level }: { level: number }) {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <svg key={i} viewBox="0 0 16 16" width={14} height={14} aria-hidden="true" className={i < level ? 'text-accent' : 'text-faint'}>
          <path
            d="M8 1.5l1.9 4.3 4.6.4-3.5 3.1 1 4.6L8 11.5l-4 2.4 1-4.6L1.5 6.2l4.6-.4z"
            fill={i < level ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth={1.25}
            strokeLinejoin="miter"
          />
        </svg>
      ))}
    </>
  );
}

/** Renders the summary for a set of rules. */
export function RulesSummary({ rules }: { rules: MatchRules }) {
  const modeName = MODES.find((m) => m.id === rules.mode)?.name ?? 'Deathmatch';
  const timed = rules.timeLimitMin > 0;
  const arsenal = rules.loadout === 1;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <Item title={modeName}>
        <IconValue icon="mode" />
      </Item>
      {/* One block per topic, in the same order and grouping as the setup panels below (Match, Weapons, Players). */}
      <Cluster>
        <Item title={`First to ${rules.killLimit} kills`}>
          <IconValue icon="skull" value={String(rules.killLimit)} />
        </Item>
        <Item title={timed ? `${rules.timeLimitMin} minute time limit` : 'No time limit'}>
          {timed ? <IconValue icon="timer" value={`${rules.timeLimitMin}m`} /> : <IconValue icon="timerOff" />}
        </Item>
      </Cluster>
      <Cluster>
        <Item title={arsenal ? 'Full arsenal: every gun from the start' : 'Pistol only: find the other guns in the office'}>
          {arsenal
            ? [0, 1, 2, 3].map((k) => <GunIcon key={k} kind={k} className="h-3 w-6" />)
            : <GunIcon kind={0} className="h-3 w-6" />}
        </Item>
      </Cluster>
      {rules.bots > 0 && (
        <Cluster>
          <Item title={`${rules.bots} ${rules.bots === 1 ? 'bot' : 'bots'}`}>
            <IconValue icon="bot" value={String(rules.bots)} />
          </Item>
          <Item title={`Bot skill: ${botSkillName(rules.botSkill)}`}>
            <SkillStars level={rules.botSkill} />
          </Item>
        </Cluster>
      )}
    </div>
  );
}
