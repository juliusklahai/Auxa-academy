// Web MIDI input (Chrome, Edge, Opera, Firefox 108+ on desktop). Safari/iOS: not supported.

export interface MidiNoteEvent { midi: number; on: boolean; velocity: number; at: number }

export class MidiInput {
  access: MIDIAccess | null = null;
  devices: string[] = [];
  sustain = false;
  onNote: ((e: MidiNoteEvent) => void) | null = null;
  onDevices: ((names: string[]) => void) | null = null;

  get supported() { return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator; }

  async connect(): Promise<string[]> {
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
    const d = m.data;
    if (!d || d.length < 2) return;
    const cmd = d[0] & 0xf0;
    const at = performance.now();
    if (cmd === 0x90 && d[2] > 0) this.onNote?.({ midi: d[1], on: true, velocity: d[2] / 127, at });
    else if (cmd === 0x80 || (cmd === 0x90 && d[2] === 0)) this.onNote?.({ midi: d[1], on: false, velocity: 0, at });
    else if (cmd === 0xb0 && d[1] === 64) this.sustain = d[2] >= 64;
  }
}

export const midiIn = new MidiInput();
