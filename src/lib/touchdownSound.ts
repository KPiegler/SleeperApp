/**
 * Touchdown-Sound, komplett prozedural per Web Audio API erzeugt - keine Audiodatei im Projekt
 * nötig (keine Lizenzfrage). Browser verlangen eine User-Geste, bevor Audio starten darf -
 * `unlockTouchdownSound` wird deshalb aus einem Klick-Handler aufgerufen; `playTouchdownSound`
 * versucht zusätzlich defensiv zu resumen, falls die Seite schon anderweitig "aktiviert" wurde.
 */
let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

export function unlockTouchdownSound(): void {
  const audioCtx = getContext();
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
}

function playHornNote(audioCtx: AudioContext, time: number, freq: number, duration: number, gainPeak: number): void {
  const osc1 = audioCtx.createOscillator();
  osc1.type = 'sawtooth';
  osc1.frequency.value = freq;
  const osc2 = audioCtx.createOscillator();
  osc2.type = 'square';
  osc2.frequency.value = freq * 1.004;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1800;

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(gainPeak, time + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);

  osc1.start(time);
  osc2.start(time);
  osc1.stop(time + duration + 0.05);
  osc2.stop(time + duration + 0.05);
}

function playCrowdSwell(audioCtx: AudioContext, time: number, duration: number, gainPeak: number): void {
  const bufferSize = Math.floor(audioCtx.sampleRate * duration);
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1200;
  filter.Q.value = 0.6;

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(gainPeak, time + duration * 0.6);
  gain.gain.linearRampToValueAtTime(0, time + duration);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);

  noise.start(time);
  noise.stop(time + duration);
}

/** Dreiklang-Fanfare (aufsteigend, gehaltener Schlussakkord) + kurzer Crowd-Swell. */
export function playTouchdownSound(): void {
  const audioCtx = getContext();
  if (!audioCtx) return;

  const fire = () => {
    const now = audioCtx.currentTime;
    playHornNote(audioCtx, now, 523.25, 0.22, 0.22);
    playHornNote(audioCtx, now + 0.16, 659.25, 0.22, 0.22);
    playHornNote(audioCtx, now + 0.32, 783.99, 0.6, 0.26);
    playCrowdSwell(audioCtx, now, 1.3, 0.14);
  };

  if (audioCtx.state === 'running') {
    fire();
  } else {
    audioCtx
      .resume()
      .then(() => {
        if (audioCtx.state === 'running') fire();
      })
      .catch(() => {});
  }
}
