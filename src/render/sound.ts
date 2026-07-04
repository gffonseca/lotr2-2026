/**
 * SoundManager — SFX simples via HTMLAudio, com mute e throttle.
 * Usa WAVs originais extraídos (servidos de /public/sfx). Falha em silêncio.
 */
export type Sfx = "attack" | "arrow" | "gate" | "victory";

const URLS: Record<Sfx, string> = {
  attack: "/sfx/attack.wav",
  arrow: "/sfx/arrow.wav",
  gate: "/sfx/gate.wav",
  victory: "/sfx/victory.wav",
};

const THROTTLE_MS: Record<Sfx, number> = { attack: 70, arrow: 80, gate: 120, victory: 0 };

export class Sound {
  muted = false;
  private base = new Map<Sfx, HTMLAudioElement>();
  private lastPlayed = new Map<Sfx, number>();

  preload(): void {
    if (typeof Audio === "undefined") return;
    (Object.keys(URLS) as Sfx[]).forEach((k) => {
      try {
        const a = new Audio(URLS[k]);
        a.preload = "auto";
        this.base.set(k, a);
      } catch { /* ignore */ }
    });
  }

  play(name: Sfx, volume = 0.35): void {
    if (this.muted) return;
    const now = performance.now();
    const last = this.lastPlayed.get(name) ?? 0;
    if (now - last < THROTTLE_MS[name]) return;
    this.lastPlayed.set(name, now);
    const src = this.base.get(name);
    if (!src) return;
    try {
      const node = src.cloneNode(true) as HTMLAudioElement;
      node.volume = volume;
      void node.play().catch(() => { /* autoplay bloqueado até interação */ });
    } catch { /* ignore */ }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }
}
