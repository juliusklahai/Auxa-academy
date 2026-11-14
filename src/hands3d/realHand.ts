// The realistic hand: a scanned, rigged right hand (public/hands/hand.glb + skin textures) driven by the
// same poses as the drawn hand. Nothing about fingering or motion changes: every frame, each finger bone
// of the model takes the rotation our IK solved for the matching bone (see kinematics.ts).
//
// Fitting, done once on load:
//   1. The model's skeleton is put in its bind pose (a relaxed open hand).
//   2. A similarity transform (scale + rotation + offset, Horn's method) lines the model's wrist and
//      knuckles up with our anatomy's (anatomy.ts), so it sits exactly where our hand sits.
//   3. Each finger bone gets a small correction rotation that turns its rest direction onto our bind
//      direction for that segment (the scan's fingers are slightly curled; ours are straight at rest).
// Driving: model bone world rotation = (our bone's rotation) * correction * (its rest rotation).
// Left hand: the same model mirrored (negative x scale), exactly like the drawn hand.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Hand } from '../core/types';
import { FINGERS, chainStart, type V3 } from './anatomy';
import type { HandPose } from './pose';

const BASE = (import.meta.env.BASE_URL ?? './') + 'hands/';

/** model bone name prefix -> our bone index for each segment, and the finger (0 = thumb) */
const CHAINS: { pre: string; finger: number }[] = [
  { pre: 'thumb', finger: 0 }, { pre: 'index', finger: 1 }, { pre: 'middle', finger: 2 }, { pre: 'ring', finger: 3 }, { pre: 'pinky', finger: 4 },
];
function ourBoneFor(name: string): { bone: number; finger: number; seg: number } | null {
  const n = name.replace(/\.?R$/, ''); // three.js drops the dots: 'index_01.R' arrives as 'index_01R'
  // the scan's thumb has 4 bones: base = metacarpal (CMC to MCP, where most thumb movement happens),
  // 01 = proximal phalanx, 02 + 03 = the distal part. Ours has 3: meta, prox, dist.
  const t = /^thumb_(?:Ctrl_?)?(base|0[123])?$/.exec(n);
  if (t) {
    const seg = !t[1] || t[1] === 'base' ? 0 : t[1] === '01' ? 1 : 2;
    return { bone: chainStart(1) + seg, finger: 0, seg };
  }
  for (const c of CHAINS) {
    if (c.finger === 0) continue;
    const m = new RegExp(`^${c.pre}_(?:Ctrl_)?0([123])$`).exec(n);
    if (m) { const seg = +m[1] - 1; return { bone: chainStart(c.finger + 1) + seg, finger: c.finger, seg }; }
  }
  return null;
}
const v3o = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);
const fingerOf = (name: string) => { const c = CHAINS.find((x) => name.startsWith(x.pre)); return c ? c.finger : -1; };

// ---------- loading (shared by both hands) ----------
interface Template { scene: THREE.Group; tex: { map: THREE.Texture; normal: THREE.Texture; rough: THREE.Texture } }
let templateP: Promise<Template> | null = null;
function loadTemplate(): Promise<Template> {
  return (templateP ??= (async () => {
    const tl = new THREE.TextureLoader();
    const [gltf, map, normal, rough] = await Promise.all([
      new GLTFLoader().loadAsync(BASE + 'hand.glb'),
      tl.loadAsync(BASE + 'hand_color.jpg'), tl.loadAsync(BASE + 'hand_normal.jpg'), tl.loadAsync(BASE + 'hand_rough.jpg'),
    ]);
    for (const t of [map, normal, rough]) { t.flipY = false; t.anisotropy = 4; }
    map.colorSpace = THREE.SRGBColorSpace;
    return { scene: gltf.scene, tex: { map, normal, rough } };
  })());
}

// ---------- Horn's method: best similarity transform a -> b ----------
function similarity(a: THREE.Vector3[], b: THREE.Vector3[]) {
  const ca = a.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(a.length);
  const cb = b.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(b.length);
  const A = a.map((p) => p.clone().sub(ca)), B = b.map((p) => p.clone().sub(cb));
  const scale = Math.sqrt(B.reduce((s, p) => s + p.lengthSq(), 0) / A.reduce((s, p) => s + p.lengthSq(), 0));
  let Sxx = 0, Sxy = 0, Sxz = 0, Syx = 0, Syy = 0, Syz = 0, Szx = 0, Szy = 0, Szz = 0;
  A.forEach((p, i) => { const q = B[i]; Sxx += p.x * q.x; Sxy += p.x * q.y; Sxz += p.x * q.z; Syx += p.y * q.x; Syy += p.y * q.y; Syz += p.y * q.z; Szx += p.z * q.x; Szy += p.z * q.y; Szz += p.z * q.z; });
  const N = [
    [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
    [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
    [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
    [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz],
  ];
  // largest eigenvector by power iteration on a shifted matrix
  const shift = Math.abs(Sxx) + Math.abs(Syy) + Math.abs(Szz) + Math.abs(Sxy) + Math.abs(Sxz) + Math.abs(Syx) + Math.abs(Syz) + Math.abs(Szx) + Math.abs(Szy) + 1e-9;
  let v = [1, 0.1, 0.1, 0.1];
  for (let it = 0; it < 200; it++) {
    const w = [0, 1, 2, 3].map((r) => N[r][0] * v[0] + N[r][1] * v[1] + N[r][2] * v[2] + N[r][3] * v[3] + shift * v[r]);
    const l = Math.hypot(...w); v = w.map((x) => x / l);
  }
  const rot = new THREE.Quaternion(v[1], v[2], v[3], v[0]).normalize(); // (w, x, y, z) -> three's (x, y, z, w)
  const t = cb.clone().sub(ca.clone().multiplyScalar(scale).applyQuaternion(rot));
  return { scale, rot, t };
}

// ---------- materials with a per-finger glow (the playing finger lights up) ----------
function skinMaterial(tex: Template['tex']) {
  const u = { uHi: { value: new Array(48).fill(0) }, uFix: { value: new Array(48).fill(0) } };
  const m = new THREE.MeshStandardMaterial({ map: tex.map, normalMap: tex.normal, normalScale: new THREE.Vector2(0.6, -0.6), roughness: 0.74, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uHi[48];\nuniform float uFix[48];\nvarying float vHi;\nvarying float vFix;')
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
        vHi = skinWeight.x * uHi[int(skinIndex.x)] + skinWeight.y * uHi[int(skinIndex.y)] + skinWeight.z * uHi[int(skinIndex.z)] + skinWeight.w * uHi[int(skinIndex.w)];
        vFix = skinWeight.x * uFix[int(skinIndex.x)] + skinWeight.y * uFix[int(skinIndex.y)] + skinWeight.z * uFix[int(skinIndex.z)] + skinWeight.w * uFix[int(skinIndex.w)];`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vHi;\nvarying float vFix;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(0.12, 0.89, 0.86) * smoothstep(0.25, 1.0, vHi) * 0.5 + vec3(0.95, 0.35, 0.25) * smoothstep(0.25, 1.0, vFix) * 0.55;`);
  };
  return { m, u };
}

// ---------- one hand ----------
export class RealHandView {
  readonly group = new THREE.Group();
  readonly root = new THREE.Group();
  ready = false;
  private bones: THREE.Bone[] = [];
  private map: (ReturnType<typeof ourBoneFor> | null)[] = [];
  private restQ: THREE.Quaternion[] = [];
  private corr: THREE.Quaternion[] = [];
  /** which of our joints each scan bone aims at (finger, joint index, blend toward the next joint) */
  private target: ({ finger: number; j: number; mix: number } | null)[] = [];
  /** each bone's aiming direction in its own rest frame (towards its child joint) */
  private aimDir: THREE.Vector3[] = [];
  private parentIdx: number[] = [];
  private parentConstQ: THREE.Quaternion[] = [];
  private jointFinger: number[] = [];
  /** how strongly each model bone glows with its finger (fingertip side full, knuckle side faint) */
  private jointGlow: number[] = [];
  private mats: { m: THREE.MeshStandardMaterial; u: { uHi: { value: number[] }; uFix: { value: number[] } } } | null = null;
  // pushed back a hair so it never fights the skin for the same pixels
  private depth = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 4 });

  constructor(readonly hand: Hand) {
    this.group.add(this.root);
    this.group.visible = false;
  }

  async load(): Promise<void> {
    const tpl = await loadTemplate();
    const scene = cloneSkinned(tpl.scene) as THREE.Group;
    let mesh: THREE.SkinnedMesh | null = null;
    scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh; });
    if (!mesh) throw new Error('No skinned mesh in hand.glb');
    const sk = (mesh as THREE.SkinnedMesh).skeleton;
    // fit in a temporary parent: bind pose, then line the knuckles up with ours
    const fit = new THREE.Group();
    fit.add(scene);
    sk.pose();
    fit.updateMatrixWorld(true);
    const P = (n: string) => { const b = sk.bones.find((x) => x.name === n || x.name === n.replace(/\./g, '')); if (!b) throw new Error(`missing bone ${n}`); return b.getWorldPosition(new THREE.Vector3()); };
    const v3 = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);
    const src = [P('pulse.R'), P('thumb_01.R'), P('index_01.R'), P('middle_01.R'), P('ring_01.R'), P('pinky_01.R')];
    // thumb_01 starts at the thumb's MCP joint (its knuckle), the others at the finger knuckles
    const dst = [v3([0, 0, 0]), v3(FINGERS[0].joints[1]), ...FINGERS.slice(1).map((f) => v3(f.joints[0]))];
    const s = similarity(src, dst);
    fit.scale.setScalar(s.scale); fit.quaternion.copy(s.rot); fit.position.copy(s.t);
    // still detached: "world" here is the hand's own root space (no keyboard scale, no left-hand mirror)
    fit.updateMatrixWorld(true);
    const rootInv = new THREE.Quaternion();
    this.bones = sk.bones;
    const index = new Map(this.bones.map((b, i) => [b, i]));
    this.bones.forEach((b, i) => {
      const q = rootInv.clone().multiply(b.getWorldQuaternion(new THREE.Quaternion()));
      this.restQ[i] = q;
      const m = ourBoneFor(b.name);
      this.map[i] = m;
      this.jointFinger[i] = fingerOf(b.name);
      this.jointGlow[i] = m ? [0.12, 0.8, 1][m.seg] : 0;
      let c = new THREE.Quaternion();
      if (m) {
        const f = FINGERS[m.finger];
        const ours = v3(f.joints[m.seg + 1]).sub(v3(f.joints[m.seg])).normalize();
        // the scan's segment direction: towards the next joint of the same chain when there is one
        // (a bone's own +Y axis need not point there), otherwise along its +Y axis
        const kid = b.children.find((c) => (c as THREE.Bone).isBone && ourBoneFor(c.name)?.finger === m.finger) as THREE.Bone | undefined;
        const theirs = kid
          ? kid.getWorldPosition(new THREE.Vector3()).sub(b.getWorldPosition(new THREE.Vector3())).normalize()
          : new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize();
        c = new THREE.Quaternion().setFromUnitVectors(theirs, ours);
      }
      this.corr[i] = c;
      // aiming: thumb base -> our MCP, 01 -> our IP, 02 -> partway to the tip, 03 -> tip; fingers 01/02/03 -> PIP/DIP/tip
      const isCtrl = /Ctrl/.test(b.name);
      if (m && !isCtrl) {
        const n = b.name.replace(/\.?R$/, '');
        const th = m.finger === 0;
        const j = th ? (n.endsWith('base') ? 1 : n.endsWith('01') ? 2 : n.endsWith('02') ? 2 : 3) : m.seg + 1;
        const mix = th && n.endsWith('02') ? 0.45 : 0;
        this.target[i] = { finger: m.finger, j, mix };
        const kid = b.children.find((ch) => (ch as THREE.Bone).isBone && !/Ctrl/.test(ch.name) && ourBoneFor(ch.name)?.finger === m.finger);
        const dirRoot = kid ? kid.getWorldPosition(new THREE.Vector3()).sub(b.getWorldPosition(new THREE.Vector3())) : new THREE.Vector3(0, 1, 0).applyQuaternion(q);
        this.aimDir[i] = dirRoot.normalize().applyQuaternion(q.clone().invert());
      } else this.target[i] = null;
      const par = b.parent as THREE.Bone | null;
      const pi = par && (par as THREE.Bone).isBone ? index.get(par) ?? -1 : -1;
      this.parentIdx[i] = pi;
      this.parentConstQ[i] = pi < 0 && par ? rootInv.clone().multiply(par.getWorldQuaternion(new THREE.Quaternion())) : new THREE.Quaternion();
    });
    // materials: depth pre-pass (no see-through fingers when translucent), then the skin
    this.root.add(fit);
    const tplMesh = mesh as THREE.SkinnedMesh;
    this.mats = skinMaterial(tpl.tex);
    tplMesh.material = this.mats.m;
    tplMesh.frustumCulled = false;
    tplMesh.renderOrder = this.hand === 'LH' ? 2 : 2.5;
    const pre = new THREE.SkinnedMesh(tplMesh.geometry, this.depth);
    pre.bind(sk, tplMesh.bindMatrix);
    pre.frustumCulled = false;
    pre.renderOrder = this.hand === 'LH' ? 1 : 1.5;
    tplMesh.parent!.add(pre);
    this.ready = true;
  }

  place(k: number, H: number) {
    this.group.scale.set(this.hand === 'LH' ? -k : k, k, k);
    this.group.position.set(0, -H, 0);
  }

  setOpacity(o: number) {
    if (!this.mats) return;
    this.mats.m.transparent = o < 0.999;
    this.mats.m.opacity = o;
    this.mats.m.needsUpdate = true;
  }

  apply(p: HandPose, lift = 0) {
    if (!this.ready) return;
    this.root.position.set(p.frame.pos[0], p.frame.pos[1], p.frame.pos[2]);
    this.root.scale.setScalar(1 + Math.max(0, lift) / 320);
    this.root.quaternion.set(p.frame.rot[0], p.frame.rot[1], p.frame.rot[2], p.frame.rot[3]);
    this.root.updateMatrixWorld(true);
    const rootInv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    // our hand model's joints in root space (forward kinematics of the solved pose)
    const Q = p.bones.map((q) => new THREE.Quaternion(q[0], q[1], q[2], q[3]));
    const joints: THREE.Vector3[][] = FINGERS.map((f) => {
      const s = chainStart(f.id);
      let R = Q[1].clone();
      const js = [v3o(f.joints[0]).applyQuaternion(Q[1])];
      for (let k = 0; k < 3; k++) { R = R.multiply(Q[s + k]); js.push(js[k].clone().add(v3o(f.joints[k + 1]).sub(v3o(f.joints[k])).applyQuaternion(R))); }
      return js;
    });
    const palm = Q[1];
    const D: THREE.Quaternion[] = [];
    const head = new THREE.Vector3(), tip = new THREE.Vector3();
    this.bones.forEach((b, i) => {
      const pi = this.parentIdx[i];
      const parentD = pi >= 0 ? D[pi] : this.parentConstQ[i];
      // start rigid with the parent (or the palm for palm bones), keeping the bone's natural twist
      const baseD = pi >= 0 ? D[pi].clone().multiply(this.restQ[pi].clone().invert()).multiply(this.restQ[i]) : palm.clone().multiply(this.restQ[i]);
      b.quaternion.copy(parentD.clone().invert().multiply(baseD));
      b.updateMatrixWorld(true);
      D[i] = baseD;
      const t = this.target[i];
      if (!t) return;
      // then swing it so it points at the joint our model has next (aim, not copy): the scan's own
      // proportions differ a little from ours, and aiming keeps fingertips and the thumb on the keys
      b.getWorldPosition(head).applyMatrix4(rootInv);
      const goal = joints[t.finger][t.j].clone().lerp(joints[t.finger][Math.min(3, t.j + 1)], t.mix);
      const want = goal.sub(head).normalize();
      const cur = this.aimDir[i].clone().applyQuaternion(baseD).normalize();
      const swing = new THREE.Quaternion().setFromUnitVectors(cur, want);
      D[i] = swing.multiply(baseD);
      b.quaternion.copy(parentD.clone().invert().multiply(D[i]));
      b.updateMatrixWorld(true);
      void tip;
    });
  }

  /** debugging: where the scan's joints are vs where our hand model puts them (root space, mm) */
  debugJoints(p: HandPose) {
    const Q = p.bones.map((q) => new THREE.Quaternion(q[0], q[1], q[2], q[3]));
    const out: Record<string, number[][]> = {};
    const rootInv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    FINGERS.forEach((f, fi) => {
      const s = chainStart(f.id);
      let R = Q[1].clone();
      const ours: THREE.Vector3[] = [v3o(f.joints[0]).applyQuaternion(Q[1])];
      for (let k = 0; k < 3; k++) { R = R.clone().multiply(Q[s + k]); ours.push(ours[k].clone().add(v3o(f.joints[k + 1]).sub(v3o(f.joints[k])).applyQuaternion(R))); }
      const names = fi === 0 ? ['thumb_01', 'thumb_02', 'thumb_03'] : [`${CHAINS[fi].pre}_01`, `${CHAINS[fi].pre}_02`, `${CHAINS[fi].pre}_03`];
      const theirs = names.map((n) => { const b = this.bones.find((x) => x.name.replace(/\.?R$/, '') === n); return b ? b.getWorldPosition(new THREE.Vector3()).applyMatrix4(rootInv) : new THREE.Vector3(NaN); });
      out[f.name] = [...ours.map((v) => [v.x, v.y, v.z].map(Math.round)), ...theirs.map((v) => [v.x, v.y, v.z].map(Math.round))];
    });
    return out;
  }

  /** per-finger glow, index 0 = thumb */
  setHighlight(hi: number[], fix: number[]) {
    if (!this.mats) return;
    this.mats.u.uHi.value = this.jointFinger.map((f, i) => (f >= 0 ? (hi[f] ?? 0) * this.jointGlow[i] : 0));
    this.mats.u.uFix.value = this.jointFinger.map((f, i) => (f >= 0 ? (fix[f] ?? 0) * this.jointGlow[i] : 0));
  }

  set visible(v: boolean) { this.group.visible = v; }
}
