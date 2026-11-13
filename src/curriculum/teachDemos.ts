// Which teaching steps get a hand demonstration (lessonId:stepIndex -> demo).
import type { DemoId } from '../hands3d/demos';

export const TEACH_DEMOS: Record<string, DemoId> = {
  'L0-0:0': 'setup', 'L0-0:1': 'shape', 'L0-1:0': 'setup', 'L0-1:3': 'fingers',
  'L2-1:0': 'quiet', 'L2-2:1': 'crossOver', 'L2-3:1': 'broken', 'L2-6:1': 'waltz',
  'D3-2:2': 'sixths', 'D3-4:2': 'holdCommon', 'C13-2:1': 'holdCommon',
  'L7-1:0': 'touch', 'L7-2:0': 'legato', 'L7-2:1': 'staccato',
  'L9-1:0': 'thumbUnder', 'L9-4:1': 'leap', 'L9-5:0': 'thumbUnder', 'L9-5:1': 'substitution', 'C13-8:3': 'substitution',
  'L9-8:0': 'grace', 'L9-8:1': 'mordent', 'L9-8:2': 'trill', 'S14-1:2': 'octaves',
};
export const demoFor = (lessonId: string, step: number): DemoId | undefined => TEACH_DEMOS[`${lessonId}:${step}`];
