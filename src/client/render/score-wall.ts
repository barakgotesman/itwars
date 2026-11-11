/**
 * The live scoreboards on the office walls: a glowing screen showing "FIRST TO N KILLS", the match clock and the
 * ranked callsigns with kills and deaths. All boards share one canvas texture, which is redrawn only when the
 * numbers it shows change, so the cost is negligible. Where the boards hang comes from the map data (`BOARDS`).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PlayerInfo } from '@shared/net/protocol';
import { formatClock, rankPlayers } from '@shared/rules/standings';
import { BOARDS } from '@shared/world/map';

const W = 1536;
const H = 768;
/** Rows shown (a room holds at most 8 players). */
const ROWS = 8;
const ROW_H = 54;
const FIRST_ROW_Y = 204;
/** Lines in the "latest" strip under the table. */
const EVENT_LINES = 3;
/** Screen brightness multiplier above 1, so the existing bloom gives the boards a soft glow. */
const GLOW = 1.25;

const COLOR = { ground: '#090c13', head: '#10151f', ink: '#f4f4f1', dim: '#7d8798', accent: '#ffd23f', mine: '#ffd23f', mineInk: '#15171a', danger: '#ff4a4a' };

/** What the boards display. */
interface BoardState {
  killLimit: number;
  timeLimitMin: number;
  players: readonly PlayerInfo[];
  myId: number;
  /** Seconds left on the match clock, or -1 when there is no time limit. */
  timeLeft: number;
  /** Id of the match winner during the intermission, -1 for a draw, or null while a match is on. */
  winner: number | null;
  /** The latest happenings, newest first ("A killed B", "C joined"). */
  events: readonly string[];
}

/** All wall scoreboards of the office. */
export class ScoreWall {
  private readonly canvas = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private state: BoardState;
  /** What was drawn last; a redraw happens only when this changes. */
  private drawn = '';

  /**
   * @param scene - Scene the board meshes are added to.
   * @param rules - The room's rules (kill limit and time limit).
   * @param myId - The local player's id, so their row is highlighted (-1 in the menu backdrop).
   */
  constructor(scene: THREE.Scene, rules: { killLimit: number; timeLimitMin: number }, myId = -1) {
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.state = { killLimit: rules.killLimit, timeLimitMin: rules.timeLimitMin, players: [], myId, timeLeft: rules.timeLimitMin > 0 ? rules.timeLimitMin * 60 : -1, winner: null, events: [] };
    this.draw();

    const geos = BOARDS.map((b) => {
      const geo = new THREE.PlaneGeometry(b.w, b.h);
      if (b.axis === 'x') geo.rotateY(b.facing === 1 ? 0 : Math.PI);
      else geo.rotateY(b.facing === 1 ? Math.PI / 2 : -Math.PI / 2);
      geo.translate(b.x, b.y, b.z);
      return geo;
    });
    if (geos.length === 0) return;
    const mesh = new THREE.Mesh(mergeGeometries(geos)!, new THREE.MeshBasicMaterial({
      map: this.tex, color: new THREE.Color(GLOW, GLOW, GLOW), toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  /**
   * Updates the standings and clock; redraws only if something visible changed.
   * @param players - Everyone in the room with their kills and deaths.
   * @param timeLeft - Seconds left on the match clock, -1 without a limit.
   */
  update(players: readonly PlayerInfo[], timeLeft: number): void {
    this.state = { ...this.state, players, timeLeft };
    this.draw();
  }

  /**
   * Adds a line to the "latest" strip, the same happenings the kill feed shows.
   * @param text - One short line such as "Dan killed Barak".
   */
  pushEvent(text: string): void {
    this.state = { ...this.state, events: [text, ...this.state.events].slice(0, EVENT_LINES) };
    this.draw();
  }

  /** Shows the winner (or -1 for a draw) during the intermission; null clears it when a new match starts. */
  setWinner(winner: number | null): void {
    this.state = { ...this.state, winner };
    this.draw();
  }

  /** Redraws when the visible data changed. */
  private draw(): void {
    const s = this.state;
    const ranked = rankPlayers(s.players).slice(0, ROWS);
    const clock = s.timeLeft >= 0 ? formatClock(s.timeLeft) : '';
    const key = JSON.stringify([s.killLimit, s.timeLimitMin, s.myId, clock, s.winner, ranked.map((p) => [p.id, p.name, p.kills, p.deaths]), s.events]);
    if (key === this.drawn) return;
    this.drawn = key;

    const g = this.g;
    g.fillStyle = COLOR.ground;
    g.fillRect(0, 0, W, H);
    g.fillStyle = COLOR.head;
    g.fillRect(0, 0, W, 150);

    // Title and clock.
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = COLOR.accent;
    g.font = '800 70px "Segoe UI", system-ui, sans-serif';
    g.fillText(`FIRST TO ${s.killLimit} KILLS`, 48, 62);
    g.textAlign = 'right';
    if (s.winner !== null) {
      const winner = s.players.find((p) => p.id === s.winner);
      g.fillStyle = COLOR.ink;
      g.font = '800 56px "Segoe UI", system-ui, sans-serif';
      g.fillText(s.winner < 0 ? 'DRAW' : `WINNER: ${this.fit(winner?.name ?? '?', 520, 56)}`, W - 48, 62);
    } else if (s.timeLeft >= 0) {
      g.fillStyle = s.timeLeft <= 30 ? COLOR.danger : COLOR.ink;
      g.font = '800 78px "Segoe UI", system-ui, sans-serif';
      g.fillText(clock, W - 48, 62);
    } else {
      g.fillStyle = COLOR.dim;
      g.font = '700 38px "Segoe UI", system-ui, sans-serif';
      g.fillText('NO TIME LIMIT', W - 48, 62);
    }

    // Progress of the leader toward the kill limit, drawn as a bar under the header.
    const lead = ranked[0]?.kills ?? 0;
    g.fillStyle = '#1c2432';
    g.fillRect(48, 118, W - 96, 14);
    g.fillStyle = COLOR.accent;
    g.fillRect(48, 118, (W - 96) * Math.min(1, lead / Math.max(1, s.killLimit)), 14);

    // Column heads.
    g.font = '700 30px "Segoe UI", system-ui, sans-serif';
    g.fillStyle = COLOR.dim;
    g.textAlign = 'left';
    g.fillText('#', 64, 186);
    g.fillText('CALLSIGN', 150, 186);
    g.textAlign = 'right';
    g.fillText('KILLS', W - 330, 186);
    g.fillText('DEATHS', W - 64, 186);

    // Rows: ranked players first, then empty slots.
    for (let i = 0; i < ROWS; i++) {
      const y = FIRST_ROW_Y + i * ROW_H;
      const p = ranked[i];
      const mine = p !== undefined && p.id === s.myId;
      if (mine) {
        g.fillStyle = COLOR.mine;
        g.fillRect(32, y, W - 64, ROW_H - 6);
      } else if (i % 2 === 0) {
        g.fillStyle = '#0e131c';
        g.fillRect(32, y, W - 64, ROW_H - 6);
      }
      const cy = y + (ROW_H - 6) / 2;
      g.textBaseline = 'middle';
      if (!p) {
        g.fillStyle = '#3a4252';
        g.font = '700 32px "Segoe UI", system-ui, sans-serif';
        g.textAlign = 'left';
        g.fillText(String(i + 1), 64, cy);
        g.fillText('-', 150, cy);
        continue;
      }
      const ink = mine ? COLOR.mineInk : COLOR.ink;
      g.font = '800 36px "Segoe UI", system-ui, sans-serif';
      g.textAlign = 'left';
      // The leader's rank is gold; a tie for first (equal kills) keeps both gold.
      g.fillStyle = mine ? COLOR.mineInk : (p.kills === lead && lead > 0 ? COLOR.accent : COLOR.dim);
      g.fillText(String(i + 1), 64, cy);
      g.fillStyle = ink;
      g.fillText(this.fit(p.name, 800, 36), 150, cy);
      g.textAlign = 'right';
      g.fillText(String(p.kills), W - 330, cy);
      g.fillStyle = mine ? COLOR.mineInk : COLOR.dim;
      g.fillText(String(p.deaths), W - 64, cy);
    }

    // Latest happenings, newest first and brightest, under a thin accent line.
    const top = FIRST_ROW_Y + ROWS * ROW_H + 8;
    g.fillStyle = '#1c2432';
    g.fillRect(32, top, W - 64, 3);
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.font = '700 28px "Segoe UI", system-ui, sans-serif';
    g.fillStyle = COLOR.accent;
    g.fillText('LATEST', 48, top + 30);
    for (let i = 0; i < EVENT_LINES; i++) {
      const line = s.events[i];
      if (!line) continue;
      g.font = `${i === 0 ? 800 : 600} 28px "Segoe UI", system-ui, sans-serif`;
      g.fillStyle = i === 0 ? COLOR.ink : COLOR.dim;
      g.fillText(this.fit(line, W - 330, 28), 220, top + 30 + i * 32 - (i > 0 ? 0 : 0));
    }
    this.tex.needsUpdate = true;
  }

  /** Shortens a name with an ellipsis until it fits a pixel width at the given font size. */
  private fit(name: string, maxW: number, size: number): string {
    this.g.font = `800 ${size}px "Segoe UI", system-ui, sans-serif`;
    let s = name;
    while (s.length > 1 && this.g.measureText(s).width > maxW) s = s.slice(0, -1);
    return s === name ? s : `${s.trimEnd()}...`;
  }
}
