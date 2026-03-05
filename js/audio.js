import { gameState } from "./state.js";

// ============================================================
//  AUDIO SYSTEM — Synthetic Space Ambience
// ============================================================

let audioCtx = null;
let masterGain = null;
let ambienceGain = null;
let ambienceNodes = [];
let fadeTimer = null;
let bgMusic = null;
let bgMusicGain = null;
let menuMusic = null;
let menuMusicGain = null;

function getCtx() {
  if (!audioCtx) return null;
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

// ============================================================
//  REVERB — convolution reverb via noise impulse
// ============================================================
function createReverb(duration = 4, decay = 3) {
  const ctx = audioCtx;
  const length = ctx.sampleRate * duration;
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = impulse.getChannelData(c);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  const convolver = ctx.createConvolver();
  convolver.buffer = impulse;
  return convolver;
}

// ============================================================
//  SPACE AMBIENCE — deep cinematic drone
//  Sub bass rumble + slow filter swept pad + high shimmer
//  + occasional noise wisps for that "void of space" feeling
// ============================================================
function buildSpaceAmbience() {
  const ctx = audioCtx;
  const reverb = createReverb(6, 2.5);
  const reverbG = ctx.createGain();
  reverbG.gain.setValueAtTime(0.55, ctx.currentTime);
  reverb.connect(reverbG);
  reverbG.connect(ambienceGain);

  const dryBus = ctx.createGain();
  dryBus.gain.setValueAtTime(0.45, ctx.currentTime);
  dryBus.connect(ambienceGain);

  // --- Layer 1: Sub bass rumble (very low, barely audible, felt more than heard)
  function addOsc(freq, type, gainVal, detuneVal, target) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.detune.setValueAtTime(detuneVal, ctx.currentTime);
    g.gain.setValueAtTime(gainVal, ctx.currentTime);
    osc.connect(g);
    g.connect(target);

    // Slow amplitude LFO — breathing effect
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    lfo.frequency.setValueAtTime(0.04 + Math.random() * 0.04, ctx.currentTime);
    lfoG.gain.setValueAtTime(gainVal * 0.35, ctx.currentTime);
    lfo.connect(lfoG);
    lfoG.connect(g.gain);
    lfo.start();
    osc.start();
    return { osc, lfo };
  }

  const nodes = [];

  // Sub bass — the "weight" of space
  nodes.push(addOsc(36, "sine", 0.5, 0, dryBus));
  nodes.push(addOsc(36, "sine", 0.3, 7, dryBus)); // slight detune for width

  // Mid drone — filtered pad sent mostly to reverb
  nodes.push(addOsc(72, "sine", 0.22, 0, reverb));
  nodes.push(addOsc(72, "sine", 0.15, -5, reverb));
  nodes.push(addOsc(108, "sine", 0.1, 3, reverb)); // 3rd harmonic
  nodes.push(addOsc(54, "triangle", 0.12, 0, reverb)); // sub octave pad

  // High shimmer — very quiet, just air
  nodes.push(addOsc(432, "sine", 0.03, 0, reverb));
  nodes.push(addOsc(648, "sine", 0.015, 0, reverb));

  // --- Slow filter sweep on mid layer for movement
  const swept = ctx.createOscillator();
  const sweptG = ctx.createGain();
  const sweptF = ctx.createBiquadFilter();
  swept.type = "sawtooth";
  swept.frequency.setValueAtTime(36, ctx.currentTime);
  sweptF.type = "lowpass";
  sweptF.Q.setValueAtTime(4, ctx.currentTime);
  sweptF.frequency.setValueAtTime(80, ctx.currentTime);
  sweptG.gain.setValueAtTime(0.08, ctx.currentTime);

  // LFO modulates filter cutoff slowly
  const filterLfo = ctx.createOscillator();
  const filterLfoG = ctx.createGain();
  filterLfo.frequency.setValueAtTime(0.03, ctx.currentTime);
  filterLfoG.gain.setValueAtTime(120, ctx.currentTime);
  filterLfo.connect(filterLfoG);
  filterLfoG.connect(sweptF.frequency);
  filterLfo.start();

  swept.connect(sweptF);
  sweptF.connect(sweptG);
  sweptG.connect(reverb);
  swept.start();
  nodes.push({ osc: swept, lfo: filterLfo });

  // --- Noise wisps — occasional cosmic static
  function spawnWisp() {
    if (!audioCtx || !ambienceGain || !gameState.isPlaying) return;
    const bufLen = ctx.sampleRate * (1.5 + Math.random() * 2);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    const filt = ctx.createBiquadFilter();
    const wispG = ctx.createGain();
    filt.type = "bandpass";
    filt.frequency.setValueAtTime(200 + Math.random() * 800, ctx.currentTime);
    filt.Q.setValueAtTime(8, ctx.currentTime);
    wispG.gain.setValueAtTime(0, ctx.currentTime);
    wispG.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.8);
    wispG.gain.linearRampToValueAtTime(
      0,
      ctx.currentTime + bufLen / ctx.sampleRate,
    );

    src.buffer = buf;
    src.connect(filt);
    filt.connect(wispG);
    wispG.connect(reverb);
    src.start();

    // Schedule next wisp
    const next = 4000 + Math.random() * 8000;
    setTimeout(spawnWisp, next);
  }

  // First wisp after 3s
  setTimeout(spawnWisp, 3000);

  return nodes;
}

// ============================================================
//  SFX
// ============================================================
function playClick() {
  const ctx = getCtx();
  if (!ctx || gameState.isMuted) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g);
  g.connect(masterGain);
  osc.frequency.setValueAtTime(1100, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.05);
  g.gain.setValueAtTime(0.18, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
  osc.start();
  osc.stop(ctx.currentTime + 0.07);
}

function playError() {
  const ctx = getCtx();
  if (!ctx || gameState.isMuted) return;
  [200, 175].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sawtooth";
    osc.connect(g);
    g.connect(masterGain);
    const t = ctx.currentTime + i * 0.06;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.start(t);
    osc.stop(t + 0.09);
  });
}

function playFail() {
  const ctx = getCtx();
  if (!ctx || gameState.isMuted) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sawtooth";
  osc.connect(g);
  g.connect(masterGain);
  osc.frequency.setValueAtTime(280, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.35);
  g.gain.setValueAtTime(0.25, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
  osc.start();
  osc.stop(ctx.currentTime + 0.35);
}

function playExplosion() {
  const ctx = getCtx();
  if (!ctx || gameState.isMuted) return;
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  const filt = ctx.createBiquadFilter();
  const g = ctx.createGain();
  filt.type = "lowpass";
  filt.frequency.setValueAtTime(1000, ctx.currentTime);
  filt.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.5);
  src.buffer = buf;
  src.connect(filt);
  filt.connect(g);
  g.connect(masterGain);
  g.gain.setValueAtTime(0.7, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
  src.start();
  src.stop(ctx.currentTime + 0.5);

  const osc = ctx.createOscillator();
  const og = ctx.createGain();
  osc.connect(og);
  og.connect(masterGain);
  osc.frequency.setValueAtTime(100, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(25, ctx.currentTime + 0.3);
  og.gain.setValueAtTime(0.5, ctx.currentTime);
  og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
  osc.start();
  osc.stop(ctx.currentTime + 0.3);
}

function playPowerup() {
  const ctx = getCtx();
  if (!ctx || gameState.isMuted) return;
  [300, 450, 600, 900, 1200].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.connect(g);
    g.connect(masterGain);
    const t = ctx.currentTime + i * 0.065;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.start(t);
    osc.stop(t + 0.15);
  });
}

function playGameOver() {
  const ctx = getCtx();
  if (!ctx || gameState.isMuted) return;
  [523, 415, 349, 262].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.connect(g);
    g.connect(masterGain);
    const t = ctx.currentTime + i * 0.28;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.start(t);
    osc.stop(t + 0.5);
  });
}

export const sounds = {
  type: playClick,
  error: playError,
  fail: playFail,
  explode: playExplosion,
  powerup: playPowerup,
  gameOver: playGameOver,
};

// ============================================================
//  ATMOSPHERE SYSTEM
// ============================================================
export const atmosphereSystem = {
  isPlaying: false,

  async init() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(0.8, audioCtx.currentTime);
    masterGain.connect(audioCtx.destination);

    ambienceGain = audioCtx.createGain();
    ambienceGain.gain.setValueAtTime(0, audioCtx.currentTime);
    ambienceGain.connect(masterGain);

    // Load menu music (Shatta Wale)
    menuMusicGain = audioCtx.createGain();
    menuMusicGain.gain.setValueAtTime(0, audioCtx.currentTime);
    menuMusicGain.connect(masterGain);

    try {
      const response = await fetch("./audio/freepik-deep-calm.mp3");
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      menuMusic = audioCtx.createBufferSource();
      menuMusic.buffer = audioBuffer;
      menuMusic.loop = true;
      menuMusic.connect(menuMusicGain);
      menuMusic.start(0);

      // Fade in menu music immediately
      menuMusicGain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 2);
    } catch (err) {
      console.warn("Failed to load menu music:", err);
    }

    // Load gameplay music (freepik deep calm)
    bgMusicGain = audioCtx.createGain();
    bgMusicGain.gain.setValueAtTime(0, audioCtx.currentTime);
    bgMusicGain.connect(masterGain);

    try {
      const response = await fetch("./audio/gamebackgroundsound.mp3");
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      bgMusic = audioCtx.createBufferSource();
      bgMusic.buffer = audioBuffer;
      bgMusic.loop = true;
      bgMusic.connect(bgMusicGain);
      bgMusic.start(0);
    } catch (err) {
      console.warn("Failed to load background music:", err);
    }
  },

  start() {
    if (this.isPlaying || gameState.isMuted || !audioCtx) return;
    if (audioCtx.state === "suspended") audioCtx.resume();

    this.isPlaying = true;

    // Fade out menu music
    if (menuMusicGain) {
      menuMusicGain.gain.cancelScheduledValues(audioCtx.currentTime);
      menuMusicGain.gain.setValueAtTime(
        menuMusicGain.gain.value,
        audioCtx.currentTime,
      );
      menuMusicGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1.5);
    }

    // Fade in gameplay music
    if (bgMusicGain) {
      bgMusicGain.gain.cancelScheduledValues(audioCtx.currentTime);
      bgMusicGain.gain.setValueAtTime(0, audioCtx.currentTime);
      bgMusicGain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 2);
    }
  },

  stop() {
    if (!this.isPlaying || !audioCtx) return;
    this.isPlaying = false;

    // Fade out gameplay music
    if (bgMusicGain) {
      bgMusicGain.gain.cancelScheduledValues(audioCtx.currentTime);
      bgMusicGain.gain.setValueAtTime(
        bgMusicGain.gain.value,
        audioCtx.currentTime,
      );
      bgMusicGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1.5);
    }

    // Fade in menu music
    if (menuMusicGain) {
      menuMusicGain.gain.cancelScheduledValues(audioCtx.currentTime);
      menuMusicGain.gain.setValueAtTime(0, audioCtx.currentTime);
      menuMusicGain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 2);
    }
  },

  toggle() {
    gameState.isMuted = !gameState.isMuted;
    const btn = document.getElementById("mute-btn");
    if (btn) {
      btn.textContent = gameState.isMuted ? "🔇" : "🔊";
      btn.classList.toggle("muted", gameState.isMuted);
    }
    if (gameState.isMuted) {
      // Mute all audio
      if (masterGain) {
        masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
        masterGain.gain.setValueAtTime(
          masterGain.gain.value,
          audioCtx.currentTime,
        );
        masterGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
      }
    } else {
      // Unmute all audio
      if (masterGain) {
        masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
        masterGain.gain.setValueAtTime(0, audioCtx.currentTime);
        masterGain.gain.linearRampToValueAtTime(
          0.8,
          audioCtx.currentTime + 0.3,
        );
      }
    }
  },
};

// ============================================================
//  AUDIO GATE
// ============================================================
export function initAudioGate() {
  const gate = document.getElementById("audio-gate");
  const btn = document.getElementById("audio-start-btn");
  if (!gate) return;

  const unlock = async () => {
    btn?.removeEventListener("click", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("pointerdown", unlock);

    gate.classList.add("hidden");
    gate.setAttribute("aria-hidden", "true");

    await atmosphereSystem.init();
    if (!gameState.isMuted) atmosphereSystem.start();
  };

  if (btn) btn.addEventListener("click", unlock);
  window.addEventListener("keydown", unlock, { once: true });
  window.addEventListener("pointerdown", unlock, { once: true });
}
