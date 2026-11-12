// Four-part settings of public-domain hymn tunes, written by Auxa's own arranger (src/compose/harmony.ts,
// 'hymn' style: note against note, planned cadences, rule-checked voice leading), then tidied by hand.
// Tunes: Old Hundredth (Genevan Psalter, 1551), New Britain / Amazing Grace (1829), Hymn to Joy (Beethoven, 1824).
export interface HymnSetting { title: string; tune: string; key: string; timeSig: [number, number]; tempo: number; S: string; A: string; T: string; B: string; chords: string }

export const HYMNS: Record<'old100' | 'amazing' | 'joy', HymnSetting> = {
  old100: {
    title: "Praise God, from whom all blessings flow", tune: "Old Hundredth", key: "G major", timeSig: [4, 4], tempo: 80,
    S: "R:3 G4:1 G4:1 F#4:1 E4:1 D4:1 G4:1 A4:1 B4:1 B4:1 B4:1 B4:1 A4:1 G4:1 C5:1 B4:1 A4:1 G4:1 A4:1 B4:1 A4:1 G4:1 E4:1 F#4:1 G4:1 D5:1 B4:1 G4:1 A4:1 C5:1 B4:1 A4:1 G4:2",
    A: "R:3 D4:1 E4:1 D4:1 B3:1 D4:1 B3:1 D4:1 D4:1 D4:1 G4:1 G4:1 E4:1 E4:1 F#4:1 G4:1 E4:1 E4:1 F#4:1 G4:1 F#4:1 G4:1 E4:1 D4:1 B3:1 D4:1 D4:1 E4:1 E4:1 E4:1 D4:1 D4:1 B3:2",
    T: "R:3 B3:1 C4:1 A3:1 G3:1 F#3:1 G3:1 F#3:1 G3:1 G3:1 G3:1 G3:1 C4:1 C4:1 A3:1 B3:1 C4:1 C4:1 A3:1 G3:1 A3:1 B3:1 C4:1 A3:1 G3:1 F#3:1 G3:1 G3:1 C4:1 G3:1 G3:1 F#3:1 G3:2",
    B: "R:3 G2:1 C3:1 D3:1 E3:1 D3:1 G2:1 D3:1 G2:1 G2:1 E2:1 G2:1 A2:1 C3:1 D3:1 G2:1 A2:1 C3:1 D3:1 E3:1 D3:1 G2:1 C3:1 D3:1 E3:1 D3:1 G2:1 C3:1 A2:1 C3:1 D3:1 D3:1 G2:2",
    chords: "I IV V vi V I V I I vi I ii IV V7 I ii IV V vi V I IV V vi V I IV ii IV I64/2 V I IV",
  },
  amazing: {
    title: "Amazing Grace", tune: "New Britain", key: "G major", timeSig: [3, 4], tempo: 76,
    S: "R:2 D4:1 G4:2 B4:0.5 G4:0.5 B4:2 A4:1 G4:2 E4:1 D4:2 D4:1 G4:2 B4:0.5 G4:0.5 B4:2 A4:1 D5:3 D5:2 B4:1 D5:1.5 B4:0.5 G4:1 B4:2 A4:1 G4:2 E4:1 D4:2 D4:1 G4:2 B4:0.5 G4:0.5 B4:2 A4:1 G4:3",
    A: "R:2 B3:1 E4:2 E4:1 D4:2 D4:1 B3:2 C4:1 A3:2 B3:1 E4:2 G4:1 G4:2 E4:1 F#4:3 G4:2 G4:1 F#4:2 G4:1 G4:2 F#4:1 G4:2 G3:1 D4:2 B3:1 E4:2 E4:1 D4:2 D4:1 B3:3",
    T: "R:2 G3:1 G3:2 G3:1 G3:2 F#3:1 G3:2 G3:1 F#3:2 G3:1 G3:2 G3:1 G3:2 C4:1 A3:3 B3:2 G3:1 A3:2 B3:1 D4:2 D4:1 B3:2 G3:1 F#3:2 G3:1 G3:2 G3:1 G3:2 F#3:1 G3:3",
    B: "R:2 G3:1 C3:2 E2:1 G2:2 D3:1 G2:2 C3:1 D3:2 G3:1 C3:2 E2:1 G2:2 A2:1 D3:3 G2:2 E3:1 D3:2 G3:1 G3:2 D3:1 G2:2 C3:1 D3:2 G3:1 C3:2 E2:1 G2:2 D3:1 G2:3",
    chords: "I IV vi I V I IV V I IV vi I ii V I vi V I I V I IV V I IV vi I V I",
  },
  joy: {
    title: "Joyful, joyful (Hymn to Joy)", tune: "Hymn to Joy", key: "C major", timeSig: [4, 4], tempo: 88,
    S: "E4:1 E4:1 F4:1 G4:1 G4:1 F4:1 E4:1 D4:1 C4:1 C4:1 D4:1 E4:1 E4:1.5 D4:0.5 D4:2 E4:1 E4:1 F4:1 G4:1 G4:1 F4:1 E4:1 D4:1 C4:1 C4:1 D4:1 E4:1 D4:1.5 C4:0.5 C4:2",
    A: "C4:1 C4:1 C4:1 B3:1 C4:1 A3:1 C4:1 B3:1 C4:1 A3:1 A3:1 C4:1 C4:2 B3:2 C4:1 C4:1 C4:1 B3:1 C4:1 A3:1 C4:1 B3:1 C4:1 A3:1 B3:1 C4:1 B3:2 C4:2",
    T: "G3:1 A3:1 A3:1 G3:1 E3:1 F3:1 G3:1 G3:1 E3:1 F3:1 F3:1 G3:1 G3:2 G3:2 G3:1 A3:1 A3:1 G3:1 E3:1 F3:1 G3:1 G3:1 E3:1 F3:1 D3:1 C3:1 D3:2 E3:2",
    B: "C3:1 A2:1 F2:1 G2:1 C3:1 D3:1 C3:1 G2:1 C3:1 F3:1 D3:1 G2:1 G2:2 G2:2 C3:1 A2:1 F2:1 G2:1 C3:1 D3:1 C3:1 G2:1 C3:1 F2:1 G2:1 A2:1 G2:2 C3:2",
    chords: "I vi IV V I ii I V I IV ii I64/2 I64/2 V I vi IV V I ii I V I IV V vi V I",
  },
};
