/**
 * Regras do turno da campanha: renda do jogador, turno da IA rival, condição de vitória.
 * Puro/determinístico dado o RNG.
 */
import type { Kingdom, County, Faction } from "../types";
import { troopCount, emptyTroops, UNIT_TYPES } from "../types";
import { UNITS } from "../units";
import { autoResolve } from "../combat/autoResolve";
import { adjacency } from "./kingdom";
import type { Rng } from "../rng";

export interface CampaignEvent { text: string; kind: "info" | "win" | "lose"; }

/** Soma a renda dos condados de uma facção (a economia é ticada à parte). */
export function collectIncome(kingdom: Kingdom, faction: Faction): number {
  let income = 0;
  for (const c of kingdom.counties) if (c.owner === faction) income += c.income;
  return income;
}

export function resetMoves(kingdom: Kingdom): void {
  for (const c of kingdom.counties) c.moved = false;
}

/** Turno da IA rival: recruta nas fronteiras e ataca o vizinho mais fraco. */
export function runRivalTurn(kingdom: Kingdom, rng: Rng): CampaignEvent[] {
  const events: CampaignEvent[] = [];
  const reds = kingdom.counties.filter((c) => c.owner === "red");
  let gold = reds.reduce((s, c) => s + c.income, 0) + 40;

  // recrutamento nas fronteiras
  for (const c of reds) {
    const border = adjacency(kingdom.edges, c.id).some((n) => kingdom.counties[n].owner !== "red");
    if (!border) continue;
    while (gold >= 45) {
      const k = rng.pick(["pike", "sword", "archer", "knight"] as const);
      if (gold >= UNITS[k].cost) { c.troops[k]++; gold -= UNITS[k].cost; } else break;
    }
  }

  // ataques
  for (const c of reds) {
    if (c.moved) continue;
    const targets = adjacency(kingdom.edges, c.id)
      .map((n) => kingdom.counties[n])
      .filter((n) => n.owner !== "red")
      .sort((a, b) => troopCount(a.troops) - troopCount(b.troops));
    const t = targets[0];
    if (!t) continue;
    if (troopCount(c.troops) > troopCount(t.troops) * 1.1 && troopCount(c.troops) > 2) {
      const res = autoResolve(c.troops, t.troops, { defenderFortified: t.owner !== "neutral" });
      if (res.winner === "attacker") {
        const wasBlue = t.owner === "blue";
        t.owner = "red"; t.troops = res.attacker; c.troops = emptyTroops(); c.moved = true;
        events.push({ text: `${wasBlue ? "⚠ " : ""}Rival tomou ${t.name}${wasBlue ? " (seu condado!)" : ""}.`, kind: wasBlue ? "lose" : "info" });
      } else {
        c.troops = res.attacker; t.troops = res.defender; c.moved = true;
      }
    }
  }
  return events;
}

export type Victory = "blue" | "red" | null;

export function checkVictory(kingdom: Kingdom): Victory {
  const blue = kingdom.counties.filter((c) => c.owner === "blue").length;
  if (blue === 0) return "red";
  if (kingdom.counties.every((c) => c.owner === "blue")) return "blue";
  return null;
}

/** Move ou reforça: devolve true se consumiu o movimento. */
export function moveTroops(src: County, dst: County): boolean {
  if (src.moved || troopCount(src.troops) === 0) return false;
  for (const k of UNIT_TYPES) dst.troops[k] += src.troops[k];
  src.troops = emptyTroops();
  src.moved = true;
  return true;
}
