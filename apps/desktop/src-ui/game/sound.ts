import { getStoredSettings } from '../state/settings';

/**
 * Move sound.
 *
 * The recorded sample ships as a normal bundled asset (`public/sounds/luozi.mp3`,
 * copied into the built frontend), so it works fully offline — there is no need
 * to also inline a base64 copy in the source. If playback is unavailable (asset
 * missing, autoplay blocked, no audio device) we fall back to a short WebAudio
 * synthesised click.
 */

const PUBLIC_URL = '/sounds/luozi.mp3';

let audioPublic: HTMLAudioElement | null = null;
let ctx: AudioContext | null = null;

function ensureAudio(): HTMLAudioElement | null {
  try {
    if (!audioPublic) {
      audioPublic = new Audio(PUBLIC_URL);
      audioPublic.preload = 'auto';
    }
    return audioPublic;
  } catch {
    return null;
  }
}

function ensureContext(): AudioContext | null {
  try {
    if (ctx) {
      if (ctx.state === 'suspended') void ctx.resume();
      return ctx;
    }
    const AC = (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const cur = ctx!;
    if (cur.state === 'suspended') {
      const resume = () => {
        void cur.resume();
        window.removeEventListener('click', resume);
        window.removeEventListener('touchstart', resume);
      };
      window.addEventListener('click', resume, { once: true });
      window.addEventListener('touchstart', resume, { once: true });
    }
    return ctx;
  } catch {
    return null;
  }
}

function fallbackSynth() {
  const ac = ensureContext();
  if (!ac) return;
  try {
    const now = ac.currentTime;
    const o1 = ac.createOscillator();
    const g1 = ac.createGain();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(680, now);
    o1.frequency.exponentialRampToValueAtTime(320, now + 0.06);
    g1.gain.setValueAtTime(0.45, now);
    g1.gain.exponentialRampToValueAtTime(0.01, now + 0.09);
    const f1 = ac.createBiquadFilter();
    f1.type = 'highpass';
    f1.frequency.value = 380;
    o1.connect(f1); f1.connect(g1); g1.connect(ac.destination);
    const c = ac.createOscillator();
    const cg = ac.createGain();
    c.type = 'square';
    c.frequency.setValueAtTime(3800, now);
    cg.gain.setValueAtTime(0.13, now);
    cg.gain.exponentialRampToValueAtTime(0.01, now + 0.018);
    c.connect(cg); cg.connect(ac.destination);
    o1.start(now); c.start(now);
    o1.stop(now + 0.09); c.stop(now + 0.018);
  } catch {}
}

/** 落子声：实录 sample，失败回退合成音。 */
export function playMoveSound(): void {
  try {
    const { soundEnabled } = getStoredSettings();
    if (!soundEnabled) return;
  } catch {
    return;
  }
  const a = ensureAudio();
  if (a) {
    try {
      // Slight randomisation so repeated drops do not sound mechanical.
      a.playbackRate = 0.98 + Math.random() * 0.04;
      a.volume = 0.72 + Math.random() * 0.06;
      a.currentTime = 0;
      const p = a.play();
      if (p && typeof (p as any).catch === 'function') {
        (p as any).catch(() => fallbackSynth());
      }
      return;
    } catch {
      /* fall through to the synth */
    }
  }
  fallbackSynth();
}

export function playPreviewSound(): void {
  const a = ensureAudio();
  if (a) {
    try {
      a.playbackRate = 1;
      a.volume = 0.72;
      a.currentTime = 0;
      a.play().catch(() => fallbackSynth());
      return;
    } catch {}
  }
  fallbackSynth();
}
