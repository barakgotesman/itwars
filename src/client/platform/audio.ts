/**
 * Synthesised sound effects (Web Audio, no files): gunshots, reloads, hits, pickups, explosions and
 * footsteps, panned and attenuated by distance from the listener.
 */

/** Furthest distance (m) at which a world sound is still played. */
const HEAR_RANGE = 70;

/** Plays all game sounds. Create one and call `unlock()` from a user click. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lx = 0;
  private lz = 0;
  private lyaw = 0;
  /** Master volume 0..1. */
  volume = 0.5;

  /** Creates or resumes the audio context; browsers only allow this after a user gesture. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      // One second of white noise, reused by every noisy sound.
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;
    }
    if (this.master) this.master.gain.value = this.volume;
    void this.ctx.resume();
  }

  /** Sets the master volume (0..1), live. */
  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** Tells the mixer where the player is and which way they face. */
  setListener(x: number, z: number, yaw: number): void {
    this.lx = x;
    this.lz = z;
    this.lyaw = yaw;
  }

  /**
   * Creates the output node for one sound: gain from distance and stereo pan from direction.
   * @returns The node to connect a sound into, or null when it is too far or audio is locked.
   */
  private out(pos?: { x: number; z: number }): AudioNode | null {
    if (!this.ctx || !this.master) return null;
    if (!pos) return this.master;
    const dx = pos.x - this.lx;
    const dz = pos.z - this.lz;
    const dist = Math.hypot(dx, dz);
    if (dist > HEAR_RANGE) return null;
    const gain = this.ctx.createGain();
    gain.gain.value = 1 / (1 + dist * 0.18);
    const pan = this.ctx.createStereoPanner();
    // Listener's right vector for this yaw convention is (cos yaw, -sin yaw).
    pan.pan.value = dist < 0.5 ? 0 : Math.max(-0.85, Math.min(0.85, (dx * Math.cos(this.lyaw) - dz * Math.sin(this.lyaw)) / dist));
    gain.connect(pan).connect(this.master);
    return gain;
  }

  /** A burst of filtered noise with an exponential decay. */
  private burst(dest: AudioNode, at: number, dur: number, type: BiquadFilterType, freq: number, gain: number, q = 0.7): void {
    if (!this.ctx || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0005, at + dur);
    src.connect(filter).connect(g).connect(dest);
    src.start(at);
    src.stop(at + dur + 0.02);
  }

  /** A pitched tone that glides from `f0` to `f1`. */
  private tone(dest: AudioNode, at: number, dur: number, type: OscillatorType, f0: number, f1: number, gain: number): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), at + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0005, at + dur);
    osc.connect(g).connect(dest);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  /** Gunshot for a weapon index; pass the shooter's position for other players. */
  shot(weapon: number, pos?: { x: number; z: number }): void {
    const d = this.out(pos);
    if (!d || !this.ctx) return;
    const t = this.ctx.currentTime;
    switch (weapon) {
      case 0:
        this.burst(d, t, 0.09, 'highpass', 1400, 0.7);
        this.tone(d, t, 0.07, 'square', 240, 70, 0.35);
        break;
      case 1:
        this.burst(d, t, 0.06, 'bandpass', 2400, 0.55, 1.2);
        this.tone(d, t, 0.05, 'sawtooth', 320, 110, 0.25);
        break;
      case 2:
        this.burst(d, t, 0.4, 'lowpass', 1800, 1.0);
        this.tone(d, t, 0.3, 'sine', 95, 38, 0.9);
        break;
      default:
        // Laser Pointer: a cracking zap over a deep boom, with a noisy tail and two fading echoes.
        this.tone(d, t, 0.45, 'sawtooth', 2600, 180, 0.5);
        this.tone(d, t, 0.5, 'sine', 1500, 120, 0.4);
        this.burst(d, t, 0.18, 'highpass', 3500, 0.9);
        this.burst(d, t, 1.1, 'lowpass', 1400, 0.95);
        this.burst(d, t + 0.02, 0.8, 'bandpass', 900, 0.6, 0.5);
        this.tone(d, t, 0.5, 'sine', 110, 32, 1.0);
        this.burst(d, t + 0.14, 0.7, 'bandpass', 700, 0.4, 0.8);
        this.burst(d, t + 0.32, 0.6, 'bandpass', 500, 0.22, 0.8);
        this.tone(d, t + 0.14, 0.35, 'sine', 800, 150, 0.12);
    }
  }

  /** Magazine out / slide / magazine in. */
  reload(pos?: { x: number; z: number }): void {
    const d = this.out(pos);
    if (!d || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.burst(d, t, 0.05, 'highpass', 2000, 0.4);
    this.burst(d, t + 0.35, 0.07, 'bandpass', 1200, 0.5, 2);
    this.burst(d, t + 0.8, 0.05, 'highpass', 2500, 0.45);
  }

  /** Dry click when firing an empty gun. */
  empty(): void {
    const d = this.out();
    if (d && this.ctx) this.burst(d, this.ctx.currentTime, 0.03, 'highpass', 3000, 0.3);
  }

  /** Tick when you hit someone; higher for a headshot, a thud on a kill. */
  hitMarker(kind: 'hit' | 'head' | 'kill'): void {
    const d = this.out();
    if (!d || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (kind === 'kill') {
      this.tone(d, t, 0.12, 'triangle', 700, 500, 0.5);
      this.tone(d, t + 0.07, 0.15, 'triangle', 1050, 800, 0.45);
    } else {
      this.tone(d, t, 0.05, 'sine', kind === 'head' ? 2400 : 1500, kind === 'head' ? 2000 : 1200, 0.5);
    }
  }

  /** You took damage. */
  hurt(): void {
    const d = this.out();
    if (!d || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.burst(d, t, 0.15, 'lowpass', 500, 0.7);
    this.tone(d, t, 0.18, 'sine', 140, 70, 0.5);
  }

  /** You died. */
  death(): void {
    const d = this.out();
    if (!d || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(d, t, 0.6, 'sawtooth', 220, 40, 0.35);
    this.burst(d, t, 0.4, 'lowpass', 400, 0.5);
  }

  /** Two quick rising beeps. */
  pickup(): void {
    const d = this.out();
    if (!d || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(d, t, 0.1, 'sine', 660, 700, 0.35);
    this.tone(d, t + 0.09, 0.14, 'sine', 990, 1000, 0.35);
  }

  /** Whoosh of a grenade throw. */
  throwGrenade(pos?: { x: number; z: number }): void {
    const d = this.out(pos);
    if (d && this.ctx) this.burst(d, this.ctx.currentTime, 0.25, 'bandpass', 700, 0.3, 0.8);
  }

  /** Detonation: a boom for the Coffee Bomb, an alarm shriek and a pop for the Fire Alarm. */
  boom(slot: number, pos: { x: number; z: number }): void {
    const d = this.out(pos);
    if (!d || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (slot === 0) {
      this.burst(d, t, 0.9, 'lowpass', 700, 1.0);
      this.tone(d, t, 0.8, 'sine', 80, 28, 1.0);
      this.burst(d, t, 0.15, 'highpass', 1500, 0.6);
    } else {
      this.burst(d, t, 0.12, 'highpass', 2500, 0.8);
      for (let i = 0; i < 4; i++) this.tone(d, t + i * 0.12, 0.1, 'square', i % 2 ? 1400 : 1900, i % 2 ? 1400 : 1900, 0.25);
    }
  }

  /** A door sliding along its track, ending with a soft thud. */
  door(pos?: { x: number; z: number }): void {
    const d = this.out(pos);
    if (!d || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.burst(d, t, 0.9, 'lowpass', 380, 0.25, 0.5);
    this.tone(d, t, 0.8, 'sine', 70, 55, 0.12);
    this.burst(d, t + 1.7, 0.12, 'lowpass', 260, 0.35);
    this.tone(d, t + 1.7, 0.15, 'sine', 90, 45, 0.3);
  }

  /** Soft footstep thud. */
  step(): void {
    const d = this.out();
    if (d && this.ctx) this.burst(d, this.ctx.currentTime, 0.06, 'lowpass', 320, 0.22);
  }
}
