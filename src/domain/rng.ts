/**
 * RNG determinístico (mulberry32). Semente reproduzível — base para
 * multiplayer determinístico, replays e testes estáveis.
 * NUNCA use Math.random() no domínio; passe uma instância de Rng.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Float em [0, 1). */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float em [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Inteiro em [min, max] (inclusivo). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Elemento aleatório de um array. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /** Snapshot do estado (para serializar/restaurar). */
  snapshot(): number {
    return this.state;
  }
  restore(state: number): void {
    this.state = state >>> 0;
  }
}
