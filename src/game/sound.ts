import type { BuildMaterial, WeaponId } from '../shared/gameTypes';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  private ensureCtx(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(m: boolean): void {
    this.muted = m;
  }

  public playShoot(weaponId: WeaponId, volume = 0.35): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (weaponId === 'pickaxe') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.12);
      gain.gain.setValueAtTime(0.18 * volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.14);
      return;
    }

    // Filtered noise burst + low punch oscillator
    const dur = weaponId === 'sniper' ? 0.28 : weaponId === 'shotgun' ? 0.22 : 0.11;
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.28));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(
      weaponId === 'sniper' ? 900 : weaponId === 'shotgun' ? 680 : weaponId === 'smg' ? 1650 : 1200,
      now,
    );
    filter.Q.value = 1.1;

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(volume * (weaponId === 'sniper' ? 0.9 : 0.65), now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter).connect(nGain).connect(ctx.destination);
    noise.start(now);

    const punch = ctx.createOscillator();
    const pGain = ctx.createGain();
    punch.type = 'sine';
    punch.frequency.setValueAtTime(weaponId === 'sniper' ? 150 : 190, now);
    punch.frequency.exponentialRampToValueAtTime(42, now + 0.09);
    pGain.gain.setValueAtTime(volume * 0.6, now);
    pGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    punch.connect(pGain).connect(ctx.destination);
    punch.start(now);
    punch.stop(now + 0.11);
  }

  public playBuild(material: BuildMaterial): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    if (material === 'wood') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(195, now);
      osc.frequency.exponentialRampToValueAtTime(95, now + 0.09);
    } else if (material === 'brick') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(145, now);
      osc.frequency.exponentialRampToValueAtTime(65, now + 0.1);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(210, now + 0.11);
    }
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playHitmarker(headshot = false): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(headshot ? 1480 : 980, now);
    osc.frequency.exponentialRampToValueAtTime(headshot ? 1960 : 620, now + 0.06);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  public playPickup(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.setValueAtTime(740, now + 0.05);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playElimination(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);
      gain.gain.setValueAtTime(0.16, now + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.26);
    });
  }
}

export const soundEngine = new SoundEngine();
