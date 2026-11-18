/**
 * The animated screens of a map (the Data Center's control room): terminals scrolling log lines, line graphs, a
 * network map with packets, a radar sweep, a server status grid and level meters. Every screen is one cell of a
 * single shared canvas, redrawn a few times a second (not every frame), and all panels are merged into one mesh, so
 * the whole thing costs one small texture upload per redraw and one draw call. Drawn bright and unlit so the bloom
 * pass makes them glow in a dark room. Purely visual: nothing here reads game state.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ScreenKind, ScreenSpec } from '@shared/world/map/types';

/** Pixels per screen cell (16:9). The blocky look is on purpose. */
const CELL_W = 320;
const CELL_H = 180;
/** Cells per row of the shared canvas. */
const COLS = 4;
/** Redraws per second. */
const FPS = 8;
/** Brightness of the screen surface (above 1 so the bloom pass picks it up). */
const GLOW = 1.3;

/** Cheap deterministic noise in 0..1, so every screen looks different but the same every run. */
const hash = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Draws a thin border and a small caption in a cell's corner. */
function frame(g: CanvasRenderingContext2D, w: number, h: number, caption: string, color: string): void {
  g.strokeStyle = color;
  g.globalAlpha = 0.55;
  g.lineWidth = 2;
  g.strokeRect(1, 1, w - 2, h - 2);
  g.globalAlpha = 1;
  g.font = '700 12px monospace';
  g.fillStyle = color;
  g.fillText(caption, 8, 15);
}

/** Scrolling log lines, mostly green with the odd warning and error. */
function terminal(g: CanvasRenderingContext2D, w: number, h: number, t: number, seed: number): void {
  g.fillStyle = '#03120a';
  g.fillRect(0, 0, w, h);
  g.font = '11px monospace';
  const rows = Math.floor(h / 13);
  const scroll = t * 4 + seed * 7;
  const first = Math.floor(scroll);
  const shift = (scroll - first) * 13;
  for (let l = 0; l <= rows; l++) {
    const n = first + l;
    const r = hash(n + seed * 100);
    const tag = r < 0.82 ? ' OK ' : r < 0.94 ? 'WARN' : 'FAIL';
    g.fillStyle = r < 0.82 ? '#3dff8a' : r < 0.94 ? '#ffc247' : '#ff5a4d';
    const host = Math.floor(hash(n * 3 + seed) * 64);
    const id = Math.floor(hash(n * 5 + seed) * 0xffffff).toString(16).padStart(6, '0');
    g.fillText(`[${tag}] node-${String(host).padStart(2, '0')} ${id} ${Math.floor(hash(n * 7) * 999)}ms`, 8, h - l * 13 + shift - 2);
  }
  g.fillStyle = '#03120a';
  g.fillRect(0, 0, w, 20);
  frame(g, w, h, '> tail -f /var/log/itwars', '#3dff8a');
}

/** Two scrolling line graphs on a grid. */
function graph(g: CanvasRenderingContext2D, w: number, h: number, t: number, seed: number): void {
  g.fillStyle = '#040c18';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(80,140,255,0.18)';
  g.lineWidth = 1;
  for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y < h; y += 30) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  const series = (k: number, color: string, fill: string): number => {
    g.beginPath();
    let last = 0;
    for (let x = 0; x <= w; x += 4) {
      const u = x + t * (40 + k * 25);
      const v = 0.5 + 0.22 * Math.sin(u * 0.045 + seed + k) + 0.12 * Math.sin(u * 0.13 + seed * 2) + 0.05 * Math.sin(u * 0.5 + k);
      last = h - 22 - v * (h - 50);
      if (x === 0) g.moveTo(x, last); else g.lineTo(x, last);
    }
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.stroke();
    if (fill) { g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.fillStyle = fill; g.fill(); }
    return last;
  };
  series(0, '#35d6ff', 'rgba(53,214,255,0.14)');
  const end = series(1, '#ff4fd0', '');
  g.fillStyle = '#ff4fd0';
  g.font = '700 16px monospace';
  g.fillText(`${Math.round(100 - (end / h) * 100)}%`, w - 48, 34);
  frame(g, w, h, 'CPU / NET LOAD', '#35d6ff');
}

/** Nodes joined by links, with packets travelling along them. */
function network(g: CanvasRenderingContext2D, w: number, h: number, t: number, seed: number): void {
  g.fillStyle = '#050a1c';
  g.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2 + 6;
  const nodes = [{ x: cx, y: cy }];
  for (let k = 0; k < 7; k++) {
    const a = k * 0.9 + seed;
    const r = 0.55 + 0.3 * hash(k + seed * 9);
    nodes.push({ x: cx + Math.cos(a) * w * 0.38 * r, y: cy + Math.sin(a) * h * 0.36 * r });
  }
  const links: [number, number][] = [];
  for (let k = 1; k < nodes.length; k++) { links.push([0, k]); if (k > 1 && k % 2 === 0) links.push([k - 1, k]); }
  g.lineWidth = 1.5;
  for (const [a, b] of links) {
    g.strokeStyle = 'rgba(90,150,255,0.55)';
    g.beginPath(); g.moveTo(nodes[a]!.x, nodes[a]!.y); g.lineTo(nodes[b]!.x, nodes[b]!.y); g.stroke();
  }
  links.forEach(([a, b], k) => {
    const f = (t * 0.45 + k * 0.37) % 1;
    g.fillStyle = k % 3 === 0 ? '#ffd23f' : '#5dffb0';
    g.fillRect(nodes[a]!.x + (nodes[b]!.x - nodes[a]!.x) * f - 2.5, nodes[a]!.y + (nodes[b]!.y - nodes[a]!.y) * f - 2.5, 5, 5);
  });
  nodes.forEach((n, k) => {
    const r = (k === 0 ? 9 : 6) + Math.sin(t * 3 + k) * 1.5;
    g.fillStyle = k === 0 ? '#ffd23f' : '#4a8cff';
    g.fillRect(n.x - r, n.y - r, r * 2, r * 2);
  });
  frame(g, w, h, 'NETWORK TOPOLOGY', '#4a8cff');
}

/** A radar with a rotating sweep and fading blips. */
function radar(g: CanvasRenderingContext2D, w: number, h: number, t: number, seed: number): void {
  g.fillStyle = '#02100a';
  g.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2 + 6, R = h * 0.42;
  g.strokeStyle = 'rgba(60,255,140,0.35)';
  g.lineWidth = 1;
  for (const f of [0.25, 0.5, 0.75, 1]) { g.beginPath(); g.arc(cx, cy, R * f, 0, Math.PI * 2); g.stroke(); }
  g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
  const sweep = (t * 1.6 + seed) % (Math.PI * 2);
  for (let k = 0; k < 28; k++) {
    g.strokeStyle = `rgba(60,255,140,${0.5 * (1 - k / 28)})`;
    g.lineWidth = 3;
    const a = sweep - k * 0.03;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke();
  }
  for (let k = 0; k < 7; k++) {
    const a = hash(k + seed * 5) * Math.PI * 2;
    const d = R * (0.25 + 0.7 * hash(k * 3 + seed));
    const behind = (sweep - a + Math.PI * 4) % (Math.PI * 2);
    g.fillStyle = `rgba(255,210,63,${Math.max(0, 1 - behind / 3.2)})`;
    g.fillRect(cx + Math.cos(a) * d - 3, cy + Math.sin(a) * d - 3, 6, 6);
  }
  frame(g, w, h, 'PERIMETER', '#3dff8a');
}

/** A grid of server lights: nearly all green, with the odd amber and red. */
function status(g: CanvasRenderingContext2D, w: number, h: number, t: number, seed: number): void {
  g.fillStyle = '#060a10';
  g.fillRect(0, 0, w, h);
  const cols = 10, rows = 5, pad = 10, top = 24;
  const cw = (w - pad * 2) / cols, ch = (h - top - pad) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const n = hash(r * cols + c + Math.floor(t * 0.6) * 0.37 + seed * 11);
      g.fillStyle = n < 0.03 ? '#ff4a3d' : n < 0.1 ? '#ffb02e' : '#22d66b';
      g.fillRect(pad + c * cw + 2, top + r * ch + 2, cw - 4, ch - 4);
    }
  }
  frame(g, w, h, `SERVER STATUS  ${(99 + hash(Math.floor(t * 0.6) + seed)).toFixed(2)}%`, '#22d66b');
}

/** Bouncing level meters, cyan at one end and magenta at the other. */
function bars(g: CanvasRenderingContext2D, w: number, h: number, t: number, seed: number): void {
  g.fillStyle = '#080614';
  g.fillRect(0, 0, w, h);
  const n = 20, bw = (w - 20) / n;
  for (let b = 0; b < n; b++) {
    const v = 0.15 + 0.85 * Math.abs(Math.sin(t * 2.1 + b * 0.7 + seed) * Math.cos(t * 1.3 + b * 0.31));
    const bh = v * (h - 46);
    g.fillStyle = `hsl(${190 + (b / n) * 130}, 90%, 58%)`;
    g.fillRect(10 + b * bw + 1, h - 12 - bh, bw - 3, bh);
  }
  frame(g, w, h, 'TRAFFIC', '#b06bff');
}

/** The drawer of each screen kind. */
const DRAW: Record<ScreenKind, (g: CanvasRenderingContext2D, w: number, h: number, t: number, seed: number) => void> = { terminal, graph, network, radar, status, bars };

/** All the animated screens of one map. */
export class ScreenWall {
  private readonly canvas = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private lastDraw = -1;

  /**
   * @param parent - Group the screen mesh is added to.
   * @param specs - The map's screens; the first is drawn into cell 0, and so on.
   * @param mirror - Also add a flipped copy under the floor (a glossy-floor map).
   */
  constructor(parent: THREE.Object3D, private readonly specs: readonly ScreenSpec[], mirror: boolean) {
    const rows = Math.max(1, Math.ceil(specs.length / COLS));
    this.canvas.width = COLS * CELL_W;
    this.canvas.height = rows * CELL_H;
    this.g = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    if (specs.length === 0) return;
    this.draw(0);

    const geos = specs.map((s, i) => {
      const geo = new THREE.PlaneGeometry(s.w, s.h);
      // Point the plane's UVs at this screen's cell (canvas row 0 is the top, v = 1).
      const col = i % COLS, row = Math.floor(i / COLS);
      const uv = geo.getAttribute('uv');
      for (let k = 0; k < uv.count; k++) {
        uv.setX(k, (col + uv.getX(k)) / COLS);
        uv.setY(k, 1 - (row + (1 - uv.getY(k))) / rows);
      }
      // Planes face +z; turn them to face along the wall normal.
      if (s.axis === 'x') geo.rotateY(s.facing === 1 ? 0 : Math.PI);
      else geo.rotateY(s.facing === 1 ? Math.PI / 2 : -Math.PI / 2);
      geo.translate(s.x, s.y, s.z);
      return geo;
    });
    const mesh = new THREE.Mesh(mergeGeometries(geos)!, new THREE.MeshBasicMaterial({
      map: this.tex, color: new THREE.Color(GLOW, GLOW, GLOW), toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    mesh.frustumCulled = false;
    parent.add(mesh);
    if (mirror) {
      const reflection = new THREE.Mesh(mesh.geometry, mesh.material);
      reflection.scale.y = -1;
      reflection.frustumCulled = false;
      parent.add(reflection);
    }
  }

  /**
   * Redraws the screens a few times a second.
   * @param t - Time in seconds.
   */
  update(t: number): void {
    if (this.specs.length === 0 || t - this.lastDraw < 1 / FPS) return;
    this.draw(t);
  }

  /** Draws every screen into its cell and uploads the canvas. */
  private draw(t: number): void {
    this.lastDraw = t;
    const g = this.g;
    this.specs.forEach((s, i) => {
      const x = (i % COLS) * CELL_W, y = Math.floor(i / COLS) * CELL_H;
      g.save();
      g.beginPath();
      g.rect(x, y, CELL_W, CELL_H);
      g.clip();
      g.translate(x, y);
      DRAW[s.kind](g, CELL_W, CELL_H, t, i);
      g.restore();
    });
    this.tex.needsUpdate = true;
  }
}
