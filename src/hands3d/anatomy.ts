// Adult right-hand anatomy in millimetres (left hand = mirror image).
// Bind pose: palm flat in the XY plane, fingers pointing +Y, back of the hand (dorsal) facing +Z,
// thumb on the -X side. Origin = wrist joint centre. Proportions follow average adult hand data
// (hand length ~190 mm, breadth ~85 mm, middle finger ~95 mm from MCP knuckle to tip).

export type V3 = [number, number, number];

export interface FingerDef {
  id: 1 | 2 | 3 | 4 | 5;       // piano finger number (1 = thumb)
  name: string;
  joints: V3[];                // [MCP, PIP, DIP, tipEnd] for fingers; [CMC, MCP, IP, tipEnd] for the thumb
  radii: number[];             // half-width at each joint and at the tip
  flat: number;                // thickness / width ratio of the cross-section
  nailLen: number;
}

export const FINGERS: FingerDef[] = [
  { id: 1, name: 'thumb', joints: [[-18, 26, -6], [-46, 58, -4], [-58, 88, -2], [-65, 113, 0]], radii: [12.5, 10.6, 9.6, 8.6], flat: 0.88, nailLen: 12 },
  { id: 2, name: 'index', joints: [[-24, 92, 0], [-28, 132, 0], [-30, 156, 0], [-32, 177, 0]], radii: [9.2, 8.4, 7.3, 6.6], flat: 0.9, nailLen: 10.5 },
  { id: 3, name: 'middle', joints: [[-4, 96, 0], [-4, 141, 0], [-4, 169, 0], [-4, 191, 0]], radii: [9.5, 8.7, 7.5, 6.8], flat: 0.9, nailLen: 11 },
  { id: 4, name: 'ring', joints: [[15, 92, 0], [18, 134, 0], [20, 161, 0], [21.5, 182, 0]], radii: [9.0, 8.2, 7.1, 6.4], flat: 0.9, nailLen: 10.5 },
  { id: 5, name: 'little', joints: [[32, 82, 0], [37, 115, 0], [40, 135, 0], [42, 153, 0]], radii: [8.0, 7.2, 6.3, 5.8], flat: 0.9, nailLen: 9 },
];

/** Bone layout (index = skin index). */
export const BONES = [
  'forearm', 'palm',
  'thumb_meta', 'thumb_prox', 'thumb_dist',
  'index_prox', 'index_mid', 'index_dist',
  'middle_prox', 'middle_mid', 'middle_dist',
  'ring_prox', 'ring_mid', 'ring_dist',
  'little_prox', 'little_mid', 'little_dist',
] as const;

/** First bone index of a finger's 3-bone chain. */
export const chainStart = (finger: number) => (finger === 1 ? 2 : 5 + (finger - 2) * 3);

/** Joint angle limits in degrees (flexion positive = curling toward the palm). */
export const LIMITS = {
  mcp: { flex: [-20, 90], abd: [-22, 22] },
  pip: { flex: [0, 108] },
  dip: { flex: [0, 80] },
  thumbCmc: { yaw: [-25, 80], flex: [-15, 55] },
  thumbMcp: { flex: [-10, 60] },
  thumbIp: { flex: [-15, 80] },
  dipCoupling: 0.68,   // DIP flexion follows PIP (tendon coupling)
  thumbIpCoupling: 0.85,
};

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const segLens = (f: FingerDef) => [len(sub(f.joints[1], f.joints[0])), len(sub(f.joints[2], f.joints[1])), len(sub(f.joints[3], f.joints[2]))];
