// MIDI keyboards: Web MIDI in browsers (Chrome, Edge, Opera, Firefox 108+ on desktop; not Safari/iOS),
// and the phone's own MIDI system inside the Maestro apps.
import { native, onNativeMidi } from '../native/bridge';

export interface MidiNoteEvent { midi: number; on: boolean; velocity: number; at: number }

export class MidiInput {
  access: MIDIAccess | null = null;
  devices: string[] = [];
  sustain = false;
  onNote: ((e: MidiNoteEvent) => void) | null = null;
  onDevices: ((names: string[]) => void) | null = null;

  get supported() { return !!native || (typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator); }

  async connect(): Promise<string[]> {
    if (native) {
      onNativeMidi((b) => this.bytes(b), (names) => { this.devices = names; this.onDevices?.(names); });
      native.midiStart();
      return this.devices;
    }
    if (!this.supported) throw new Error('Web MIDI is not supported in this browser. Use Chrome or Edge on desktop.');
    this.access = await navigator.requestMIDIAccess({ sysex: false });
    const bind = () => {
      this.devices = [];
      this.access!.inputs.forEach((input) => {
        this.devices.push(input.name || 'MIDI device');
        input.onmidimessage = (m) => this.handle(m);
      });
      this.onDevices?.(this.devices);
    };
    bind();
    this.access.onstatechange = bind;
    return this.devices;
  }

  private handle(m: MIDIMessageEvent) {
    if (m.data) this.bytes(Array.from(m.data));
  }

  /** One or more MIDI messages (native buffers can hold several, with running status). */
  private status = 0;
  bytes(b: ArrayLike<number>) {
    for (let i = 0; i < b.length;) {
      if (b[i] >= 0xf0) { i++; continue; } // system messages: not needed
      if (b[i] & 0x80) this.status = b[i++];
      if (!this.status) { i++; continue; }
      const kind = this.status & 0xf0;
      const n = kind === 0xc0 || kind === 0xd0 ? 1 : 2;
      if (i + n > b.length) break;
      this.message([this.status, b[i], n === 2 ? b[i + 1] : 0]);
      i += n;
    }
  }

  private message(d: number[]) {
    const cmd = d[0] & 0xf0;
    const at = performance.now();
    if (cmd === 0x90 && d[2] > 0) this.onNote?.({ midi: d[1], on: true, velocity: d[2] / 127, at });
    else if (cmd === 0x80 || (cmd === 0x90 && d[2] === 0)) this.onNote?.({ midi: d[1], on: false, velocity: 0, at });
    else if (cmd === 0xb0 && d[1] === 64) this.sustain = d[2] >= 64;
  }
}

export const midiIn = new MidiInput();
