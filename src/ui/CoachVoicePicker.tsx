// Choose the coach's voice: tap a voice to hear it say hello, and it becomes the coach.
import { Icon } from './Icon';
import { setSettings, useSettings } from './settings';
import { COACH_VOICES, previewVoice } from './voice';

export function CoachVoicePicker() {
  const st = useSettings();
  const cur = COACH_VOICES.some((v) => v.id === st.coachVoiceId) ? st.coachVoiceId : 'af_heart';
  return (
    <div className="field coach-voices">Coach voice
      <div className="coach-voice-list" role="radiogroup" aria-label="Coach voice">
        {COACH_VOICES.map((v) => (
          <button key={v.id} role="radio" aria-checked={cur === v.id} data-keep-voice className={`coach-voice ${cur === v.id ? 'on' : ''}`}
            onClick={() => { setSettings({ coachVoiceId: v.id }); void previewVoice(v.id); }}>
            <span className="cv-icon"><Icon name={v.id === 'device' ? 'phone' : 'speaker'} size={16} /></span>
            <span className="cv-text"><b>{v.name}</b><small>{v.about}</small></span>
            {cur === v.id && <span className="cv-check" aria-hidden>✓</span>}
          </button>
        ))}
      </div>
      <small className="muted">Tap a voice to hear it. Grace works offline; Michael and Emma need a connection the first time each line plays (Grace fills in until then).</small>
    </div>
  );
}
