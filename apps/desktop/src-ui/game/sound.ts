import { getStoredSettings } from '../state/settings';

const LUOZI_MP3_BASE64 = "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";
const DATA_URL_MP3 = `data:audio/mpeg;base64,${LUOZI_MP3_BASE64}`;
const PUBLIC_URL = '/sounds/luozi.mp3';

let audioData: HTMLAudioElement | null = null;
let audioPublic: HTMLAudioElement | null = null;
let ctx: AudioContext | null = null;

function ensureAudio(): HTMLAudioElement | null {
  try {
    if (!audioData) {
      audioData = new Audio(DATA_URL_MP3);
      audioData.preload = 'auto';
      (audioData as any).preservesPitch = false;
    }
    return audioData;
  } catch {
    return null;
  }
}

function ensurePublicAudio(): HTMLAudioElement | null {
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

/**
 * 实录落子：优先使用 luozi.mp3（4.4KB，data:audio/mpeg），public/sounds 亦可用作覆盖
 */
export function playMoveSound(): void {
  try {
    const { soundEnabled } = getStoredSettings();
    if (!soundEnabled) return;
  } catch {
    return;
  }
  // 优先 data URL（最可靠离线），失败回退 public 路径，再回退合成
  const a = ensureAudio();
  if (a) {
    try {
      a.playbackRate = 0.98 + Math.random() * 0.04;
      a.volume = 0.72 + Math.random() * 0.06;
      a.currentTime = 0;
      const p = a.play();
      if (p && typeof (p as any).catch === 'function') {
        (p as any).catch(() => {
          const pub = ensurePublicAudio();
          if (pub) {
            pub.currentTime = 0;
            pub.play().catch(() => fallbackSynth());
          } else fallbackSynth();
        });
      }
      return;
    } catch {
      // try public
    }
  }
  const pub = ensurePublicAudio();
  if (pub) {
    try {
      pub.currentTime = 0;
      pub.play().catch(() => fallbackSynth());
      return;
    } catch {}
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
