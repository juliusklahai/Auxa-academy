// Lookahead metronome scheduler on the AudioContext clock (stable even when the UI thread is busy).

import { audio } from './engine';
import { msPerBeat } from './timing';

export class Metronome {
  bpm = 80;
  beatsPerBar = 4;
  subdivision = 1;
  running = false;
  onBeat: ((beatIndex: number, accent: boolean) => void) | null = null;
  private nextTime = 0; // ctx seconds
  private step = 0;
  private timer = 0;

  start(bpm = this.bpm, beatsPerBar = this.beatsPerBar) {
    const ctx = audio.ensure();
    this.stop();
    this.bpm = bpm;
    this.beatsPerBar = beatsPerBar;
    this.running = true;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.08;
    this.timer = window.setInterval(() => this.tick(), 25);
    this.tick();
  }

  setBpm(bpm: number) { this.bpm = Math.max(20, Math.min(300, bpm)); }

  private tick() {
    const ctx = audio.ctx!;
    const stepSec = msPerBeat(this.bpm) / 1000 / this.subdivision;
    while (this.nextTime < ctx.currentTime + 0.12) {
      const isBeat = this.step % this.subdivision === 0;
      const beat = Math.floor(this.step / this.subdivision);
      const accent = isBeat && beat % this.beatsPerBar === 0;
      audio.click(accent, !isBeat, (this.nextTime - ctx.currentTime) * 1000);
      if (isBeat && this.onBeat) {
        const delay = (this.nextTime - ctx.currentTime) * 1000;
        const b = beat;
        window.setTimeout(() => this.onBeat?.(b % this.beatsPerBar, accent), Math.max(0, delay));
      }
      this.nextTime += stepSec;
      this.step++;
    }
  }

  stop() {
    clearInterval(this.timer);
    this.running = false;
  }
}

export const metronome = new Metronome();
