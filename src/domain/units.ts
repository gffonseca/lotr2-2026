/**
 * Catálogo de unidades — FONTE ÚNICA DE VERDADE de balanceamento.
 * Compartilhado por auto-resolução (mapa) e simulação tática (batalha).
 * Números portados dos protótipos validados.
 */
import type { UnitStats, UnitType, Troops } from "./types";
import { UNIT_TYPES } from "./types";

export const UNITS: Record<UnitType, UnitStats> = {
  sword:  { name: "Espadachim", glyph: "✚", hp: 120, dmg: 16, range: 15,  speed: 52, cooldown: 0.70, radius: 11, armor: 3, str: 16, cost: 40 },
  pike:   { name: "Piqueiro",   glyph: "◆", hp: 130, dmg: 14, range: 20,  speed: 46, cooldown: 0.80, radius: 11, armor: 4, str: 15, cost: 45 },
  archer: { name: "Arqueiro",   glyph: "➹", hp: 80,  dmg: 12, range: 210, speed: 50, cooldown: 1.10, radius: 10, armor: 1, str: 14, cost: 50, ranged: true },
  knight: { name: "Cavaleiro",  glyph: "▲", hp: 200, dmg: 24, range: 16,  speed: 96, cooldown: 0.70, radius: 13, armor: 6, str: 26, cost: 110, cavalry: true },
  mace:   { name: "Maceiro",    glyph: "⬢", hp: 140, dmg: 20, range: 15,  speed: 48, cooldown: 0.85, radius: 11, armor: 2, str: 20, cost: 60, siege: 2.2 },
};

/**
 * Multiplicador de counter tático (atacante -> alvo). Regras de pedra-papel-tesoura.
 */
export function tacticalCounter(attacker: UnitType, target: UnitType): number {
  let m = 1;
  const tgt = UNITS[target];
  if (attacker === "pike" && tgt.cavalry) m *= 2.4;
  if (attacker === "knight" && (target === "archer" || target === "sword")) m *= 1.7;
  if (attacker === "knight" && target === "pike") m *= 0.5;
  if (attacker === "archer" && tgt.cavalry) m *= 0.7;
  if (attacker === "mace") m *= 1.3;
  return m;
}

export function armyHP(t: Troops): number {
  return UNIT_TYPES.reduce((s, k) => s + t[k] * UNITS[k].hp, 0);
}

export function armyPower(t: Troops): number {
  return UNIT_TYPES.reduce((s, k) => s + t[k] * UNITS[k].str, 0);
}
