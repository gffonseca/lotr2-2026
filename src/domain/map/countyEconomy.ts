/**
 * Economia estratégica POR CONDADO (M4) — regra pura, um passo por turno.
 * Substitui a renda abstrata (pop×1.1): renda e crescimento agora emergem de
 * comida, população e prosperidade. Determinística dado o RNG.
 */
import type { County, Kingdom } from "../types";
import type { Rng } from "../rng";

export const COUNTY_ECON = {
  foodPerPop: 1,        // comida consumida por unidade de população/turno
  farmYield: 2.2,       // comida por fazenda/turno
  yieldJitter: 0.25,    // variação (±) na colheita
  growthRate: 0.045,    // crescimento populacional quando bem alimentado
  starveProsperityHit: 8,
  prosperityDrift: 2,   // recuperação de prosperidade por turno
  grainCapPerPop: 4,    // teto de estoque de comida (relativo à pop)
  incomePerPop: 0.8,    // renda base por população
  farmCost: 60,         // custo para desenvolver +1 fazenda
} as const;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Inicializa os campos econômicos de um condado a partir da população. */
export function initCountyEconomy(c: County): void {
  c.farms = Math.max(2, Math.round(c.pop / 2));
  c.grain = c.pop; // começa com uma estação de comida
  c.prosperity = 60;
  c.income = strategicIncome(c);
}

export function strategicIncome(c: County): number {
  return Math.round(c.pop * COUNTY_ECON.incomePerPop * (0.5 + c.prosperity / 100));
}

/** Avança a economia de UM condado em um turno. Muta `c`. */
export function tickCountyStrategic(c: County, rng: Rng): void {
  const k = COUNTY_ECON;
  const jitter = 1 - k.yieldJitter + rng.next() * (2 * k.yieldJitter);
  const produced = c.farms * k.farmYield * jitter;
  const needed = c.pop * k.foodPerPop;
  c.grain += produced - needed;

  if (c.grain < 0) {
    // fome: perde população e prosperidade
    const starve = Math.min(Math.max(0, c.pop - 1), Math.ceil(-c.grain));
    c.pop -= starve;
    c.grain = 0;
    c.prosperity = clamp(c.prosperity - k.starveProsperityHit, 0, 100);
  } else {
    if (c.grain > c.pop && c.prosperity >= 50) {
      c.pop += Math.max(1, Math.round(c.pop * k.growthRate));
    }
    c.grain = Math.min(c.grain, c.pop * k.grainCapPerPop);
    c.prosperity = clamp(c.prosperity + k.prosperityDrift, 0, 100);
  }

  c.income = strategicIncome(c);
}

/** Aplica a economia a todos os condados (fim de turno). */
export function tickEconomy(kingdom: Kingdom, rng: Rng): void {
  for (const c of kingdom.counties) tickCountyStrategic(c, rng);
}

/** Desenvolve uma fazenda no condado (aumenta capacidade de comida). Devolve true se pago. */
export function developFarm(c: County, treasury: number): { ok: boolean; cost: number } {
  const cost = COUNTY_ECON.farmCost;
  if (treasury < cost) return { ok: false, cost };
  c.farms += 1;
  return { ok: true, cost };
}
