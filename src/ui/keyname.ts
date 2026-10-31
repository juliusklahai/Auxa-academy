const TONIC = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
/** Name of a major key (given as fifths) after transposing by n semitones. */
export const transposedKey = (fifths: number, n: number) => `${TONIC[(((fifths * 7 + n) % 12) + 12) % 12]} major`;
