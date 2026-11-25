export interface StickmanAudioSettings {
  musicVolume: number; // 0..100, default 70
  sfxVolume: number;   // 0..100, default 70
  muted: boolean;
}

const AUDIO_STORAGE_KEY = 'ze_stickman_audio_settings_v1';

class StickmanAudioEngine {
  private ctx: AudioContext | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private musicTimer: number | null = null;
  private musicActive = false;
  private musicBeat = 0;

  public settings: StickmanAudioSettings = {
    musicVolume: 70,
    sfxVolume: 70,
    muted: false
  };

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(AUDIO_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          this.settings = {
            musicVolume:
              typeof parsed.musicVolume === 'number'
                ? Math.max(0, Math.min(100, parsed.musicVolume))
                : 70,
            sfxVolume:
              typeof parsed.sfxVolume === 'number'
                ? Math.max(0, Math.min(100, parsed.sfxVolume))
                : 70,
            muted: Boolean(parsed.muted)
          };
        }
      } catch {}
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return null;
        this.ctx = new AudioCtx();

        // Studio compressor prevents distortion/clipping across simultaneous hits
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-14, this.ctx.currentTime);
        this.compressor.knee.setValueAtTime(16, this.ctx.currentTime);
        this.compressor.ratio.setValueAtTime(6, this.ctx.currentTime);
        this.compressor.attack.setValueAtTime(0.002, this.ctx.currentTime);
        this.compressor.release.setValueAtTime(0.18, this.ctx.currentTime);

        this.masterGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        this.musicGain = this.ctx.createGain();

        this.sfxGain.connect(this.compressor);
        this.musicGain.connect(this.compressor);
        this.compressor.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        // Pre-bake 2s smooth white/pink noise buffer for instant zero-delay playback
        const sampleRate = this.ctx.sampleRate;
        const len = sampleRate * 2;
        const buf = this.ctx.createBuffer(1, len, sampleRate);
        const data = buf.getChannelData(0);
        let b0 = 0;
        let b1 = 0;
        let b2 = 0;
        for (let i = 0; i < len; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.997 * b0 + white * 0.029;
          b1 = 0.985 * b1 + white * 0.032;
          b2 = 0.95 * b2 + white * 0.048;
          data[i] = (b0 + b1 + b2 + white * 0.35) * 0.55;
        }
        this.noiseBuffer = buf;
        this.applyVolumes();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  public unlock() {
    this.ensureContext();
  }

  private applyVolumes() {
    if (!this.ctx || !this.masterGain || !this.sfxGain || !this.musicGain) return;
    const now = this.ctx.currentTime;
    const master = this.settings.muted ? 0 : 1;
    this.masterGain.gain.setTargetAtTime(master, now, 0.02);
    this.sfxGain.gain.setTargetAtTime((this.settings.sfxVolume / 100) * 0.95, now, 0.02);
    this.musicGain.gain.setTargetAtTime((this.settings.musicVolume / 100) * 0.36, now, 0.04);
  }

  public updateSettings(partial: Partial<StickmanAudioSettings>) {
    this.settings = {
      ...this.settings,
      ...partial
    };
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(this.settings));
      } catch {}
    }
    this.applyVolumes();
  }

  public startMusic() {
    if (this.musicActive) return;
    this.musicActive = true;
    if (typeof window === 'undefined') return;

    const scheduleStep = () => {
      if (!this.musicActive) return;
      const ctx = this.ensureContext();
      if (ctx && this.musicGain && !this.settings.muted && this.settings.musicVolume > 0) {
        const now = ctx.currentTime;
        const step = this.musicBeat % 16;

        // Epic war-drum pulse + minor obsidian chord progression
        if (step % 4 === 0) {
          const drum = ctx.createOscillator();
          const dg = ctx.createGain();
          drum.type = 'sine';
          drum.frequency.setValueAtTime(92, now);
          drum.frequency.exponentialRampToValueAtTime(38, now + 0.18);
          dg.gain.setValueAtTime(0.32, now);
          dg.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
          drum.connect(dg);
          dg.connect(this.musicGain);
          drum.start(now);
          drum.stop(now + 0.25);
        }

        if (step % 8 === 0) {
          const roots = [110, 98, 87.31, 98]; // A2 -> G2 -> F2 -> G2
          const root = roots[Math.floor(this.musicBeat / 16) % roots.length];
          [root, root * 1.5].forEach((freq) => {
            const pad = ctx.createOscillator();
            const pg = ctx.createGain();
            const filt = ctx.createBiquadFilter();
            filt.type = 'lowpass';
            filt.frequency.setValueAtTime(420, now);
            pad.type = 'triangle';
            pad.frequency.setValueAtTime(freq, now);
            pg.gain.setValueAtTime(0.001, now);
            pg.gain.linearRampToValueAtTime(0.11, now + 0.15);
            pg.gain.exponentialRampToValueAtTime(0.001, now + 1.55);
            pad.connect(filt);
            filt.connect(pg);
            pg.connect(this.musicGain!);
            pad.start(now);
            pad.stop(now + 1.6);
          });
        }
      }
      this.musicBeat += 1;
      this.musicTimer = window.setTimeout(scheduleStep, 260);
    };

    scheduleStep();
  }

  public stopMusic() {
    this.musicActive = false;
    if (this.musicTimer) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private playFilteredNoise(
    duration: number,
    filterType: BiquadFilterType,
    freqStart: number,
    freqEnd: number,
    q: number,
    peakGain: number,
    delay = 0
  ) {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || !this.noiseBuffer) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.setValueAtTime(q, t);
    filter.frequency.setValueAtTime(Math.max(40, freqStart), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), t + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(peakGain, t + Math.min(0.02, duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  private playTone(
    type: OscillatorType,
    freqStart: number,
    freqEnd: number,
    duration: number,
    peakGain: number,
    delay = 0
  ) {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(25, freqStart), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(25, freqEnd), t + duration);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(peakGain, t + Math.min(0.012, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  // PEDANG: SWING wuuusss tajam
  public playSwordSwing(isFireWing = false) {
    this.playFilteredNoise(0.2, 'bandpass', 520, 2600, 2.8, 0.45);
    this.playTone('triangle', 680, 240, 0.14, 0.16);
    if (isFireWing) {
      this.playFilteredNoise(0.24, 'lowpass', 950, 320, 1.5, 0.28, 0.03);
    }
  }

  // KENA PEDANG: SLASH + DUG
  public playSwordHit(isFireWing = false) {
    this.playFilteredNoise(0.11, 'highpass', 1800, 4200, 1.4, 0.42);
    this.playTone('sine', 165, 48, 0.16, 0.48); // DUG punch
    if (isFireWing) {
      this.playFilteredNoise(0.22, 'bandpass', 1400, 480, 1.8, 0.26, 0.02);
    }
  }

  // TANGAN KOSONG: Punch swoosh & thud
  public playPunchSwing() {
    this.playFilteredNoise(0.11, 'bandpass', 420, 1200, 2.2, 0.28);
  }

  public playPunchHit() {
    this.playTone('sine', 190, 55, 0.12, 0.42);
    this.playFilteredNoise(0.07, 'lowpass', 900, 320, 1.0, 0.24);
  }

  // PANAH: Tarik KREK -> Lepas SHUUT -> Kena TUK (atau Panah Api: BOOM api)
  public playBowDraw() {
    this.playTone('sawtooth', 170, 240, 0.06, 0.12);
    this.playFilteredNoise(0.05, 'bandpass', 1200, 1800, 4.0, 0.18);
  }

  public playBowRelease(isFire = false) {
    this.playBowDraw();
    this.playFilteredNoise(0.18, 'bandpass', 2400, 950, 3.2, 0.36, 0.03);
    this.playTone('triangle', 460, 180, 0.12, 0.16, 0.03);
    if (isFire) {
      this.playFilteredNoise(0.22, 'lowpass', 1100, 360, 1.6, 0.28, 0.04);
    }
  }

  public playArrowHit(isFire = false) {
    this.playTone('triangle', 320, 95, 0.08, 0.35); // TUK
    if (isFire) {
      // BOOM api!
      this.playTone('sine', 135, 36, 0.28, 0.55);
      this.playFilteredNoise(0.32, 'lowpass', 900, 160, 1.4, 0.48);
    }
  }

  // TEMBAK: DOR bass nendang | NAGA ES: ROAR + SHHHH es
  public playGunShot(isIceDragon = false) {
    // DOR bass punch
    this.playTone('sine', 210, 42, 0.16, 0.58);
    this.playFilteredNoise(0.12, 'bandpass', 1600, 380, 1.3, 0.42);
    if (isIceDragon) {
      // ROAR naga + SHHHH semburan es jernih
      this.playTone('sawtooth', 290, 95, 0.24, 0.24);
      this.playFilteredNoise(0.34, 'highpass', 2600, 5200, 1.8, 0.34, 0.02);
    }
  }

  public playIceImpact() {
    this.playFilteredNoise(0.2, 'highpass', 3200, 6200, 2.2, 0.28);
    this.playTone('sine', 1100, 420, 0.14, 0.18);
  }

  // LONCAT: HUP + wuusss | Mendarat: DUK
  public playJump() {
    this.playTone('sine', 220, 520, 0.12, 0.24);
    this.playFilteredNoise(0.14, 'bandpass', 600, 1900, 2.4, 0.22);
  }

  public playLand() {
    this.playTone('sine', 120, 44, 0.11, 0.36);
    this.playFilteredNoise(0.08, 'lowpass', 480, 160, 1.2, 0.18);
  }

  // DASH: WUSH angin kenceng
  public playDash() {
    this.playFilteredNoise(0.24, 'bandpass', 450, 2400, 2.0, 0.48);
    this.playTone('sine', 340, 140, 0.15, 0.14);
  }

  // GACHA: KLIK KLIK | HADIAH UTAMA: JRENG + sorak | AMPAS: TET sedih
  public playGachaTick() {
    this.playTone('triangle', 980, 420, 0.032, 0.26);
    this.playFilteredNoise(0.02, 'highpass', 2500, 4000, 1.5, 0.1);
  }

  public playGachaUtama() {
    // JRENG power chord + celebratory swell cheer
    const chord = [261.63, 329.63, 392.0, 523.25, 659.25];
    chord.forEach((f, idx) => {
      this.playTone('sawtooth', f * 0.99, f, 0.55, 0.13, idx * 0.015);
      this.playTone('triangle', f * 2, f * 2, 0.6, 0.09, idx * 0.015);
    });
    // Sorak cheer noise swell
    this.playFilteredNoise(0.85, 'bandpass', 900, 2200, 1.1, 0.28, 0.12);
    [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
      this.playTone('triangle', f, f, 0.28, 0.16, 0.18 + idx * 0.08);
    });
  }

  public playGachaGood() {
    [440, 554.37, 659.25, 880].forEach((f, idx) => {
      this.playTone('triangle', f, f, 0.24, 0.18, idx * 0.07);
    });
  }

  public playGachaAmpas() {
    // TET sedih
    this.playTone('sawtooth', 280, 240, 0.18, 0.18, 0);
    this.playTone('sawtooth', 240, 175, 0.36, 0.2, 0.2);
  }

  public playVictory() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
      this.playTone('triangle', f, f, 0.26, 0.22, idx * 0.09);
    });
  }

  public playDefeat() {
    [330, 293.66, 261.63, 196].forEach((f, idx) => {
      this.playTone('sine', f, f * 0.96, 0.24, 0.2, idx * 0.14);
    });
  }

  // CHARACTER-DISTINCT SKILL SFX
  public playRexFlurry() {
    [0, 0.07, 0.14, 0.21].forEach((d, idx) => {
      this.playFilteredNoise(0.09, 'bandpass', 650 + idx * 180, 1800, 2.4, 0.34, d);
      this.playTone('sine', 180 + idx * 15, 58, 0.1, 0.36, d + 0.02);
    });
  }

  public playShieldActivate(metallic = false) {
    if (metallic) {
      this.playTone('triangle', 420, 860, 0.22, 0.28);
      this.playTone('sine', 640, 320, 0.32, 0.22, 0.05);
    } else {
      this.playTone('triangle', 260, 410, 0.18, 0.26);
      this.playFilteredNoise(0.16, 'lowpass', 900, 350, 1.5, 0.22);
    }
  }

  public playKiraShadowDash() {
    this.playFilteredNoise(0.22, 'highpass', 1800, 4800, 2.2, 0.38);
    this.playTone('sine', 780, 240, 0.18, 0.26);
  }

  public playKiraArrowRain() {
    [0, 0.06, 0.12, 0.18, 0.24].forEach((d) => {
      this.playFilteredNoise(0.14, 'bandpass', 2200, 900, 3.0, 0.24, d);
    });
  }

  public playBrunoEarthSlam() {
    this.playTone('sine', 110, 28, 0.42, 0.65);
    this.playFilteredNoise(0.38, 'lowpass', 520, 90, 1.2, 0.55);
  }

  public playFrostIceShot() {
    this.playFilteredNoise(0.22, 'highpass', 3000, 6200, 2.5, 0.32);
    this.playTone('triangle', 1150, 520, 0.16, 0.22);
  }

  public playFrostBlizzard() {
    this.playFilteredNoise(0.95, 'bandpass', 900, 2800, 1.8, 0.42);
    this.playTone('sine', 880, 440, 0.45, 0.18, 0.1);
  }

  public playVanShadowVanish() {
    // Crimson hayabusa shadow blink + blazing sword cut
    this.playFilteredNoise(0.14, 'bandpass', 1400, 4200, 2.6, 0.42);
    this.playTone('sawtooth', 520, 135, 0.13, 0.24);
    this.playTone('sine', 150, 42, 0.15, 0.45, 0.02);
  }

  public playVanDragonTransform() {
    // Epic fiery dragon roar + wing gust
    this.playTone('sawtooth', 165, 58, 0.52, 0.38);
    this.playTone('sine', 95, 36, 0.58, 0.55);
    this.playFilteredNoise(0.55, 'lowpass', 1100, 260, 1.4, 0.46);
  }

  public playVanDragonBreath() {
    this.playFilteredNoise(0.26, 'bandpass', 720, 280, 1.4, 0.32);
    this.playTone('sawtooth', 140, 82, 0.18, 0.16);
  }

  public playUpgradeSuccess() {
    [440, 587.33, 880, 1174.66].forEach((f, idx) => {
      this.playTone('triangle', f, f, 0.24, 0.22, idx * 0.07);
    });
  }
}

export const stickmanAudio = new StickmanAudioEngine();
