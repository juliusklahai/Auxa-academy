// Combines the MusicAnimationBridge output with HandRig/FingerIK: places the palm, solves every finger
// toward its key (or its relaxed spot), and returns bone rotations ready for the renderer.
// The wrist and forearm help the fingers the way a pianist's do: when a finger cannot quite reach
// its key, the hand drifts toward it (forward for the short thumb and little finger, sideways for a
// thumb passing under, lower for a deep press), and the forearm rotates toward the thumb or the little
// finger when they play.
import { FINGERS, type V3 } from './anatomy';
import type { HandAnim } from './bridge';
import { HAND_ROLL, REST, REST_CONTACT, boneRotations, fingerContact, frameFor, solveFinger, toLocal, toWorld, type FingerParams, type HandFrame, type Q } from './kinematics';

export interface HandPose { frame: HandFrame; bones: Q[]; tips: V3[]; press: number[]; err: number[] }

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export class HandPoser {
  params: FingerParams[] = FINGERS.map((f) => [...REST[f.id]] as FingerParams);
  private adj: V3 = [0, 0, 0];
  private roll = HAND_ROLL;
  private dip = 0;

  reset() { this.params = FINGERS.map((f) => [...REST[f.id]] as FingerParams); this.adj = [0, 0, 0]; this.roll = HAND_ROLL; this.dip = 0; }

  pose(a: HandAnim, follow = 0.35): HandPose {
    const w = a.fingers.map((f) => clamp(f.w, 0, 1));
    const maxPress = Math.max(...a.fingers.map((f) => f.press));
    this.dip += (maxPress * 1.5 - this.dip) * follow;
    const rollT = HAND_ROLL + 0.16 * (w[4] + 0.4 * w[3] - w[0] - 0.35 * w[1]) / Math.max(1, w.reduce((s, x) => s + x, 0) * 0.6);
    this.roll += (rollT - this.roll) * follow;
    const frame = frameFor(a.x + this.adj[0], a.y + this.adj[1], a.yaw, 1.5 - this.dip + this.adj[2] + (a.z ?? 0), this.roll);
    const tips: V3[] = [], press: number[] = [], err: number[] = [];
    const res: V3 = [0, 0, 0];
    let ws = 0;
    FINGERS.forEach((f, i) => {
      const fa = a.fingers[i];
      const rest = toWorld(frame, REST_CONTACT[i]);
      const tgt: V3 = w[i] > 0 ? [rest[0] + (fa.target[0] - rest[0]) * w[i], rest[1] + (fa.target[1] - rest[1]) * w[i], rest[2] + (fa.target[2] - rest[2]) * w[i]] : rest;
      const r = solveFinger(f.id, toLocal(frame, tgt), this.params[i]);
      this.params[i] = r.p;
      const tip = toWorld(frame, fingerContact(f, r.p));
      tips.push(tip);
      press.push(fa.press);
      err.push(r.err);
      if (w[i] > 0.2) { const k = w[i] * w[i]; res[0] += (tgt[0] - tip[0]) * k; res[1] += (tgt[1] - tip[1]) * k; res[2] += (tgt[2] - tip[2]) * k; ws += k; }
    });
    // let the hand follow what the fingers could not reach (smoothly, within natural limits)
    const want: V3 = ws > 0
      ? [clamp(this.adj[0] + res[0] / ws * 0.9, -26, 26), clamp(this.adj[1] + res[1] / ws * 0.9, -12, 34), clamp(this.adj[2] + res[2] / ws * 0.9, -16, 6)]
      : [0, 0, 0];
    for (let k = 0; k < 3; k++) this.adj[k] += (want[k] - this.adj[k]) * follow * (ws > 0 ? 1 : 0.4);
    return { frame, bones: boneRotations(this.params), tips, press, err };
  }
}
