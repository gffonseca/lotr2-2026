/**
 * Auto-resolução estratégica de combate (camada do mapa).
 * Determinística (sem RNG). Usa força + counters do catálogo UNITS.
 * Validada: exército maior vence, piques resistem a cavalaria, def fortificado leva vantagem.
 */
import type { Troops, UnitType, BattleResult } from "../types";
import { UNIT_TYPES, cloneTroops, troopCount } from "../types";
import { UNITS, armyHP } from "../units";

const CASUALTY_DIVISOR = 55; // calibra o ritmo de baixas por rodada
const FALL_ORDER: UnitType[] = ["archer", "sword", "mace", "pike", "knight"];

function effectivePower(force: Troops, foe: Troops, isDefender: boolean, fort: number): number {
  let p = 0;
  const foeCount = troopCount(foe);
  for (const k of UNIT_TYPES) {
    if (force[k] <= 0) continue;
    let s = UNITS[k].str;
    if (k === "pike" && foe.knight > 0) s *= 1.35;
    if (UNITS[k].cavalry) s *= foe.pike > foeCount * 0.3 ? 0.7 : 1.4;
    if (UNITS[k].ranged) s *= 1.1;
    p += force[k] * s;
  }
  return p * (isDefender ? fort : 1);
}

function applyCasualties(force: Troops, kills: number): void {
  let toll = Math.max(0, Math.round(kills));
  let guard = 0;
  while (toll > 0 && troopCount(force) > 0 && guard < 1000) {
    guard++;
    for (const k of FALL_ORDER) {
      if (toll <= 0) break;
      if (force[k] > 0) { force[k]--; toll--; }
    }
  }
}

export interface AutoResolveOptions {
  defenderFortified?: boolean;
  maxRounds?: number;
}

export function autoResolve(
  attacker: Troops,
  defender: Troops,
  opts: AutoResolveOptions = {},
): BattleResult {
  const A = cloneTroops(attacker);
  const D = cloneTroops(defender);
  const fort = opts.defenderFortified ? 1.25 : 1;
  const maxRounds = opts.maxRounds ?? 40;
  let rounds = 0;

  while (troopCount(A) > 0 && troopCount(D) > 0 && rounds < maxRounds) {
    rounds++;
    const pa = effectivePower(A, D, false, fort);
    const pd = effectivePower(D, A, true, fort);
    applyCasualties(D, Math.max(1, pa / CASUALTY_DIVISOR));
    applyCasualties(A, Math.max(1, pd / CASUALTY_DIVISOR));
  }

  const winner: BattleResult["winner"] =
    troopCount(A) > 0 && troopCount(D) <= 0 ? "attacker" : troopCount(D) > 0 ? "defender" : "attacker";

  return { winner, attacker: A, defender: D, rounds };
}

// re-export utilitário conveniente
export { armyHP };
