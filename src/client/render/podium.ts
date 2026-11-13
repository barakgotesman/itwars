/**
 * The post-match podium: up to three pedestals (winner centre and tallest), each carrying a character
 * model and a name/kills plate, plus spotlight beams and falling confetti. Built straight into the real
 * game scene at a fixed spot in the office (the lobby's waiting area) rather than a separate stage, so it
 * shares the map's own lighting, fog and atmosphere instead of a fabricated backdrop.
 */
import * as THREE from 'three';
import { PlayerModel } from '@client/render/players';

/** One player standing on the podium, ranked by kills. */
export interface PodiumEntry {
  id: number;
  name: string;
  model: number;
  color: number;
  kills: number;
}

/** A podium built into the scene; call `update` every frame while shown and `dispose` to remove it. */
export interface PodiumScene {
  update(t: number): void;
  dispose(): void;
}

/** Pedestal height by rank (0 = winner), metres. */
const RANK_HEIGHT = [1.3, 0.85, 0.55];
/** Pedestal x position by rank (local to the podium group): winner centre, 2nd left, 3rd right. */
const RANK_X = [0, -2.6, 2.6];
/** Accent colour by rank: gold, silver, bronze. */
const RANK_ACCENT = [0xffd34d, 0xc7cdd6, 0xcd7f32];
const PEDESTAL_SIZE = 1.7;
/** Confetti colours: the three rank accents plus a couple of neutral office colours. */
const CONFETTI_COLORS = [0xffd34d, 0xc7cdd6, 0xcd7f32, 0x2f80ed, 0xffffff];

/** Draws a name plate: rank, name and kill count, as a camera-facing sprite. */
function plate(rank: number, name: string, kills: number): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(10,12,16,0.72)';
  g.fillRect(0, 0, 384, 128);
  g.fillStyle = `#${RANK_ACCENT[rank]!.toString(16).padStart(6, '0')}`;
  g.fillRect(0, 0, 384, 10);
  g.textAlign = 'center';
  g.fillStyle = '#fff';
  g.font = 'bold 44px monospace';
  g.fillText(name, 192, 54, 368);
  g.font = 'bold 36px monospace';
  g.fillStyle = `#${RANK_ACCENT[rank]!.toString(16).padStart(6, '0')}`;
  g.fillText(`#${rank + 1} - ${kills} ${kills === 1 ? 'kill' : 'kills'}`, 192, 102, 368);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(1.9, 0.63, 1);
  return s;
}

/** Builds one pedestal (a flat-shaded box with a glowing top rim) at the given rank's position and height. */
function buildPedestal(rank: number): THREE.Group {
  const group = new THREE.Group();
  const h = RANK_HEIGHT[rank]!;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(PEDESTAL_SIZE, h, PEDESTAL_SIZE),
    new THREE.MeshLambertMaterial({ color: 0x3a4152 }),
  );
  body.position.y = h / 2;
  body.receiveShadow = true;
  group.add(body);
  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(PEDESTAL_SIZE + 0.04, 0.06, PEDESTAL_SIZE + 0.04),
    new THREE.MeshBasicMaterial({ color: RANK_ACCENT[rank]!, toneMapped: false }),
  );
  rim.position.y = h + 0.03;
  group.add(rim);
  group.position.x = RANK_X[rank]!;
  return group;
}

/** A square-sided light shaft from the ceiling all the way down to the floor at a pedestal, in the rank's
 *  accent colour: narrow at the (unseen) fixture, widening into a pool of light where it lands. */
function buildBeam(rank: number): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    color: RANK_ACCENT[rank]!, transparent: true, opacity: 0.22, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const height = 7;
  const beam = new THREE.Mesh(new THREE.ConeGeometry(1.4, height, 4, 1, true), mat);
  beam.rotation.y = Math.PI / 4;
  beam.position.set(RANK_X[rank]!, height / 2, 0);
  return beam;
}

/** A flat glowing pool on the floor where a beam lands, so the light clearly touches the ground. */
function buildFloorPool(rank: number): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    color: RANK_ACCENT[rank]!, transparent: true, opacity: 0.35, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false,
  });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), mat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(RANK_X[rank]!, 0.02, 0);
  return pool;
}

/** A tight spotlight over each pedestal, angled down from the camera's side so the room can be dimmed around it. */
function buildSpot(rank: number): THREE.SpotLight {
  const light = new THREE.SpotLight(RANK_ACCENT[rank]!, 160, 10, 0.45, 0.5, 1.6);
  light.position.set(RANK_X[rank]!, 4.6, -1.6);
  light.target.position.set(RANK_X[rank]!, RANK_HEIGHT[rank]!, 0);
  return light;
}

/** A small blocky housing with a glowing lens, marking where each spotlight actually shines from. */
function buildFixture(rank: number): THREE.Group {
  const group = new THREE.Group();
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.34), new THREE.MeshLambertMaterial({ color: 0x1b1d22 }));
  group.add(housing);
  const lens = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.03, 0.22),
    new THREE.MeshBasicMaterial({ color: RANK_ACCENT[rank]!, toneMapped: false }),
  );
  lens.position.y = -0.1;
  group.add(lens);
  group.position.set(RANK_X[rank]!, 4.6, -1.6);
  group.rotation.x = -0.6;
  return group;
}

/** Falling confetti cubes (blocky, never round) that loop from the top once they pass the floor. */
function buildConfetti(count: number): { mesh: THREE.InstancedMesh; vel: Float32Array; spin: Float32Array } {
  const geo = new THREE.BoxGeometry(0.1, 0.1, 0.02);
  const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const vel = new Float32Array(count);
  const spin = new Float32Array(count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 11;
    const y = Math.random() * 7 + 2;
    const z = (Math.random() - 0.5) * 5 + 1;
    q.setFromEuler(new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI));
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, color.setHex(CONFETTI_COLORS[i % CONFETTI_COLORS.length]!));
    vel[i] = 0.6 + Math.random() * 0.9;
    spin[i] = (Math.random() - 0.5) * 3;
  }
  return { mesh, vel, spin };
}

/**
 * Builds the podium into an already-running game scene, at a fixed world point (the lobby's open waiting
 * area, clear of its reception desk and pillars).
 * @param scene - The live game scene.
 * @param origin - World `{x, z}` the podium is centred on; the group sits at floor level (y 0).
 * @param entries - Up to 3 players, already ranked first to third.
 */
export function addPodium(scene: THREE.Scene, origin: { x: number; z: number }, entries: readonly PodiumEntry[]): PodiumScene {
  const group = new THREE.Group();
  group.position.set(origin.x, 0, origin.z);
  scene.add(group);

  // Rank order on the pedestals is winner, 3rd, 2nd, so the tallest sits visually in the middle.
  const ranks = [0, 2, 1].filter((r) => r < entries.length);
  const models: PlayerModel[] = [];
  for (const rank of ranks) {
    const entry = entries[rank]!;
    group.add(buildPedestal(rank));
    group.add(buildBeam(rank));
    group.add(buildFloorPool(rank));
    group.add(buildFixture(rank));
    const spot = buildSpot(rank);
    group.add(spot, spot.target);
    const model = new PlayerModel(
      { id: entry.id, name: entry.name, model: entry.model, color: entry.color, spray: 0, kills: entry.kills, deaths: 0 },
      entry.id,
    );
    model.tagVisible(false);
    model.root.position.set(RANK_X[rank]!, RANK_HEIGHT[rank]!, 0);
    // The model's own face points -Z by default; the podium camera sits on the group's -Z side looking
    // toward +Z, so the model already faces it with no extra turn.
    group.add(model.root);
    models.push(model);
    // Mounted on the pedestal's own front face, below the model, rather than floating over its head.
    const p = plate(rank, entry.name, entry.kills);
    p.position.set(RANK_X[rank]!, RANK_HEIGHT[rank]! * 0.5, -(PEDESTAL_SIZE / 2 + 0.06));
    group.add(p);
  }

  const confetti = buildConfetti(70);
  group.add(confetti.mesh);

  const dummy = new THREE.Object3D();
  let last = performance.now() / 1000;
  return {
    update(t: number) {
      const dt = Math.min(0.1, Math.max(0, t - last));
      last = t;
      for (const m of models) m.idle(t);
      for (let i = 0; i < confetti.vel.length; i++) {
        confetti.mesh.getMatrixAt(i, dummy.matrix);
        dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
        dummy.position.y -= confetti.vel[i]! * dt;
        if (dummy.position.y < 0) dummy.position.y = 9;
        dummy.rotateX(confetti.spin[i]! * dt);
        dummy.rotateY(confetti.spin[i]! * dt * 0.7);
        dummy.updateMatrix();
        confetti.mesh.setMatrixAt(i, dummy.matrix);
      }
      confetti.mesh.instanceMatrix.needsUpdate = true;
    },
    dispose: () => {
      scene.remove(group);
    },
  };
}
