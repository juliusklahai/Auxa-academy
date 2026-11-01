// HandMaterial + renderer: draws the two skinned hands with Three.js on a transparent canvas laid
// exactly over the DOM keyboard (orthographic camera looking straight down; 1 world unit = 1 CSS px).
//
// Passes, per hand:
//   1. depth pre-pass (no colour): keeps only the front-most surface, so the 80%-opaque hand never
//      shows its own fingers or palm through itself (no X-ray look) and overlapping hands sort correctly
//   2. contour: inverted hull pushed out along the skinned normal (dark outline that bends with the hand)
//   3. matte skin: lit, semi-transparent, light hatching in the shadows, per-finger highlight
//   4. nails, then anatomical strokes (skinned ribbons on the surface: creases, nails, tendons, folds)

import * as THREE from 'three';
import { inflateSync } from 'fflate';
import type { Hand } from '../core/types';
import { HAND_DATA, HAND_LAYOUT } from './handData';
import { BONE_DEFS, qAxis, type Q } from './kinematics';
import { chainStart } from './anatomy';
import type { HandPose } from './pose';

export interface HandStyle { opacity: number; color: string; stroke: number; outline: boolean }
export const HAND_COLORS: Record<string, string> = { white: '#f6f3ee', skin: '#e8c2a4', blue: '#a9c9f5', pink: '#f4bfd0' };
const INK = new THREE.Color('#2b2622');

// ---------- decode the precomputed hand ----------
let decoded: Record<string, ArrayBufferView> | null = null;
function data() {
  if (decoded) return decoded;
  const bin = Uint8Array.from(atob(HAND_DATA), (c) => c.charCodeAt(0));
  const raw = inflateSync(bin);
  const out: Record<string, ArrayBufferView> = {};
  const T: Record<string, new (b: ArrayBuffer, o: number, n: number) => ArrayBufferView> = { Int16Array, Int8Array, Uint16Array, Uint8Array } as never;
  for (const [k, [off, len, type]] of Object.entries(HAND_LAYOUT)) {
    const C = T[type];
    const bytes = (C as unknown as { BYTES_PER_ELEMENT: number }).BYTES_PER_ELEMENT;
    out[k] = new C(raw.buffer, raw.byteOffset + off, len / bytes);
  }
  return (decoded = out);
}
const f32 = (a: ArrayBufferView, s: number) => Float32Array.from(a as Int16Array, (x) => x / s);

let geoCache: { body: THREE.BufferGeometry; nails: THREE.BufferGeometry; strokes: THREE.BufferGeometry } | null = null;
function geometries() {
  if (geoCache) return geoCache;
  const d = data();
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.BufferAttribute(f32(d.pos, 100), 3));
  body.setAttribute('normal', new THREE.BufferAttribute(d.nor as Int8Array, 3, true));
  body.setAttribute('skinIndex', new THREE.BufferAttribute(d.si as Uint8Array, 4));
  body.setAttribute('skinWeight', new THREE.BufferAttribute(d.sw as Uint8Array, 4, true));
  body.setAttribute('aPart', new THREE.BufferAttribute(Float32Array.from(d.part as Uint8Array), 1));
  body.setIndex(new THREE.BufferAttribute(d.idx as Uint16Array, 1));
  const nails = new THREE.BufferGeometry();
  nails.setAttribute('position', new THREE.BufferAttribute(f32(d.nailPos, 100), 3));
  nails.setAttribute('normal', new THREE.BufferAttribute(d.nailNor as Int8Array, 3, true));
  nails.setAttribute('skinIndex', new THREE.BufferAttribute(d.nailSi as Uint8Array, 4));
  nails.setAttribute('skinWeight', new THREE.BufferAttribute(d.nailSw as Uint8Array, 4, true));
  nails.setIndex(new THREE.BufferAttribute(d.nailIdx as Uint16Array, 1));
  const strokes = new THREE.BufferGeometry();
  strokes.setAttribute('position', new THREE.BufferAttribute(f32(d.stPos, 100), 3));
  strokes.setAttribute('normal', new THREE.BufferAttribute(d.stNor as Int8Array, 3, true));
  strokes.setAttribute('aSide', new THREE.BufferAttribute(d.stSide as Int8Array, 3, true));
  strokes.setAttribute('aOff', new THREE.BufferAttribute(Float32Array.from(d.stOff as Int8Array, (x) => (x / 127) * 1.2), 1));
  strokes.setAttribute('aAlpha', new THREE.BufferAttribute(d.stAlpha as Uint8Array, 1, true));
  strokes.setAttribute('skinIndex', new THREE.BufferAttribute(d.stSi as Uint8Array, 4));
  strokes.setAttribute('skinWeight', new THREE.BufferAttribute(d.stSw as Uint8Array, 4, true));
  strokes.setIndex(new THREE.BufferAttribute(d.stIdx as Uint16Array, 1));
  for (const g of [body, nails, strokes]) g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 60, 0), 400);
  return (geoCache = { body, nails, strokes });
}

// ---------- materials ----------
class Materials {
  readonly u = {
    uOutline: { value: 0.9 }, uStroke: { value: 0.45 }, uHi: { value: new Array(17).fill(0) }, uHiColor: { value: new THREE.Color('#d7f23a') },
    uFix: { value: new Array(17).fill(0) }, uFixColor: { value: new THREE.Color('#ff8a3d') }, uHatchPx: { value: 5 },
  };
  readonly depth = new THREE.MeshBasicMaterial({ colorWrite: false });
  readonly outline: THREE.MeshBasicMaterial;
  readonly skin: THREE.MeshStandardMaterial;
  readonly nail: THREE.MeshStandardMaterial;
  readonly stroke: THREE.MeshBasicMaterial;

  constructor() {
    const u = this.u;
    this.outline = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide, transparent: true, depthWrite: false });
    this.outline.onBeforeCompile = (s) => {
      s.uniforms.uOutline = u.uOutline;
      s.vertexShader = 'uniform float uOutline;\n' + s.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\n transformed += normalize(objectNormal) * uOutline;');
    };
    this.skin = new THREE.MeshStandardMaterial({ color: HAND_COLORS.white, roughness: 0.93, metalness: 0, transparent: true, depthWrite: false, depthFunc: THREE.LessEqualDepth });
    this.skin.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, { uHi: u.uHi, uHiColor: u.uHiColor, uFix: u.uFix, uFixColor: u.uFixColor, uHatchPx: u.uHatchPx });
      // highlight follows the skin weights, so it fades smoothly across the knuckles and webbing
      s.vertexShader = 'uniform float uHi[17];\nuniform float uFix[17];\nvarying float vHi;\nvarying float vFix;\n' +
        s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
 ivec4 si = ivec4(skinIndex + 0.5);
 vHi = dot(skinWeight, vec4(uHi[si.x], uHi[si.y], uHi[si.z], uHi[si.w]));
 vFix = dot(skinWeight, vec4(uFix[si.x], uFix[si.y], uFix[si.z], uFix[si.w]));`);
      s.fragmentShader = 'uniform vec3 uHiColor;\nuniform vec3 uFixColor;\nuniform float uHatchPx;\nvarying float vHi;\nvarying float vFix;\n' +
        s.fragmentShader.replace('#include <opaque_fragment>', `
  outgoingLight = mix(outgoingLight, uHiColor, clamp(vHi, 0.0, 1.0) * 0.6);
  outgoingLight = mix(outgoingLight, uFixColor, clamp(vFix, 0.0, 1.0) * 0.7);
  float lum = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
  float shade = 1.0 - smoothstep(0.42, 0.78, lum);
  float hatch = step(0.6, fract((gl_FragCoord.x - gl_FragCoord.y) / uHatchPx)) * shade;
  outgoingLight *= 1.0 - hatch * 0.22;
  #include <opaque_fragment>`);
    };
    this.nail = new THREE.MeshStandardMaterial({ color: '#fbf4f1', roughness: 0.55, metalness: 0, transparent: true, depthWrite: false, depthFunc: THREE.LessEqualDepth, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    this.stroke = new THREE.MeshBasicMaterial({ color: INK, side: THREE.DoubleSide, transparent: true, depthWrite: false, depthFunc: THREE.LessEqualDepth, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.stroke.onBeforeCompile = (s) => {
      s.uniforms.uStroke = u.uStroke;
      s.vertexShader = 'attribute vec3 aSide;\nattribute float aOff;\nattribute float aAlpha;\nuniform float uStroke;\nvarying float vA;\n' +
        s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += aSide * aOff * uStroke; vA = aAlpha;');
      s.fragmentShader = 'varying float vA;\n' + s.fragmentShader.replace('#include <opaque_fragment>', 'diffuseColor.a *= vA;\n#include <opaque_fragment>').replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity );');
    };
  }

  setStyle(st: HandStyle, k: number) {
    this.skin.color.set(HAND_COLORS[st.color] ?? st.color);
    this.skin.opacity = st.opacity;
    this.nail.opacity = Math.min(1, st.opacity * 1.05);
    this.outline.opacity = Math.min(1, 0.35 + st.opacity * 0.65);
    this.outline.visible = st.outline;
    this.stroke.opacity = Math.min(1, 0.25 + st.opacity * 0.75);
    this.stroke.visible = st.stroke > 0;
    // outline about 1.6 css px, stroke ribbons ~ 1 css px at stroke = 1, independent of zoom
    this.u.uOutline.value = 1.6 / k;
    this.u.uStroke.value = (1.05 * Math.max(0.2, st.stroke)) / k;
  }
}

// ---------- one hand ----------
class HandView {
  readonly group = new THREE.Group();
  readonly root = new THREE.Group();
  readonly bones: THREE.Bone[];
  private meshes: THREE.SkinnedMesh[] = [];

  constructor(readonly hand: Hand, mats: Materials) {
    const g = geometries();
    this.bones = BONE_DEFS.map((b) => { const bone = new THREE.Bone(); bone.name = b.name; return bone; });
    // the forearm pivots at the wrist (same head as the palm) so it can tilt and turn naturally
    BONE_DEFS.forEach((b, i) => {
      const bone = this.bones[i];
      if (i <= 1) { this.root.add(bone); bone.position.set(0, 0, 0); return; }
      const parent = BONE_DEFS[b.parent];
      const ph = b.parent <= 1 ? [0, 0, 0] : parent.head;
      bone.position.set(b.head[0] - ph[0], b.head[1] - ph[1], b.head[2] - ph[2]);
      this.bones[b.parent].add(bone);
    });
    this.group.add(this.root);
    const skeleton = new THREE.Skeleton(this.bones);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, order: number) => {
      const m = new THREE.SkinnedMesh(geo, mat);
      m.renderOrder = order + (hand === 'LH' ? 0 : 0.5);
      m.frustumCulled = false;
      this.group.add(m);
      m.bind(skeleton, new THREE.Matrix4());
      this.meshes.push(m);
      return m;
    };
    this.group.updateMatrixWorld(true);
    skeleton.calculateInverses();
    add(g.body, mats.depth, 0);
    add(g.body, mats.outline, 1);
    add(g.body, mats.skin, 2);
    add(g.nails, mats.nail, 3);
    add(g.strokes, mats.stroke, 4);
  }

  place(k: number, H: number) {
    this.group.scale.set(this.hand === 'LH' ? -k : k, k, k);
    this.group.position.set(0, -H, 0);
  }

  apply(p: HandPose, yaw: number) {
    this.root.position.set(p.frame.pos[0], p.frame.pos[1], p.frame.pos[2]);
    this.root.quaternion.set(p.frame.rot[0], p.frame.rot[1], p.frame.rot[2], p.frame.rot[3]);
    p.bones.forEach((q: Q, i) => { if (i > 0) this.bones[i].quaternion.set(q[0], q[1], q[2], q[3]); });
    // forearm: level with the keys, turned toward the player's body
    const fq = qAxis([1, 0, 0], -0.2);
    const yq = qAxis([0, 0, 1], -yaw * 0.6);
    this.bones[0].quaternion.set(yq[0], yq[1], yq[2], yq[3]).multiply(new THREE.Quaternion(fq[0], fq[1], fq[2], fq[3]));
  }

  set visible(v: boolean) { this.group.visible = v; }
}

// ---------- the scene ----------
export class HandScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(0, 1, 0, -1, 1, 6000);
  readonly mats: Record<Hand, Materials> = { RH: new Materials(), LH: new Materials() };
  readonly views: Record<Hand, HandView>;
  private k = 1;
  private H = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'low-power' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8580, 1.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(-0.45, 0.55, 1);
    this.scene.add(key);
    this.camera.position.set(0, 0, 3000);
    this.camera.lookAt(0, 0, 0);
    this.views = { RH: new HandView('RH', this.mats.RH), LH: new HandView('LH', this.mats.LH) };
    this.scene.add(this.views.RH.group, this.views.LH.group);
  }

  /** width/height of the canvas in CSS px, key height H (px), k = px per mm. */
  resize(w: number, h: number, H: number, k: number) {
    this.k = k; this.H = H;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(w, h, false);
    Object.assign(this.camera, { left: 0, right: w, top: 0, bottom: -h });
    this.camera.updateProjectionMatrix();
    this.views.RH.place(k, H); this.views.LH.place(k, H);
    for (const m of [this.mats.RH, this.mats.LH]) m.u.uHatchPx.value = 5 * this.renderer.getPixelRatio();
  }

  setStyle(st: HandStyle) { this.mats.RH.setStyle(st, this.k); this.mats.LH.setStyle(st, this.k); }

  /** model-space mm point of a hand -> CSS px in the canvas */
  toPx(h: Hand, p: number[]): [number, number] {
    const x = h === 'LH' ? -p[0] : p[0];
    return [x * this.k, this.H - p[1] * this.k];
  }

  update(h: Hand, pose: HandPose | null, yaw = 0) {
    const v = this.views[h];
    v.visible = !!pose;
    if (pose) v.apply(pose, yaw);
  }
  /** per-finger highlight (index 0 = thumb) spread onto that finger's bones */
  setHighlight(h: Hand, hi: number[], fix: number[]) {
    const toBones = (v: number[]) => { const b = new Array(17).fill(0); v.forEach((x, i) => { const s = chainStart(i + 1); b[s] = x * (i === 0 ? 0.3 : 0.85); b[s + 1] = x; b[s + 2] = x; }); return b; };
    this.mats[h].u.uHi.value = toBones(hi);
    this.mats[h].u.uFix.value = toBones(fix);
  }
  render() { this.renderer.render(this.scene, this.camera); }
  dispose() { this.renderer.dispose(); }
}
