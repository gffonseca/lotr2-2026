/**
 * Regras do turno da campanha: renda do jogador, turno da IA rival, condição de vitória.
 * Puro/determinístico dado o RNG.
 */
import type { Kingdom, County, Faction, UnitType } from "../types";
import { troopCount, emptyTroops, UNIT_TYPES } from "../types";
import { UNITS } from "../units";
import { autoResolve } from "../combat/autoResolve";
import { adjacency } from "./kingdom";
import type { Rng } from "../rng";
import type { LordProfile } from "./diplomacy";

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

export function factionPower(kingdom: Kingdom, faction: Faction): number {
  return kingdom.counties.filter((c) => c.owner === faction)
    .reduce((s, c) => s + UNIT_TYPES.reduce((t, k) => t + c.troops[k] * UNITS[k].str, 0), 0);
}

function isBorder(kingdom: Kingdom, c: County): boolean {
  return adjacency(kingdom.edges, c.id).some((n) => kingdom.counties[n].owner !== c.owner);
}

function pickRecruit(rng: Rng, p: LordProfile): UnitType {
  const aggressive: UnitType[] = ["knight", "sword", "mace", "sword"];
  const defensive: UnitType[] = ["pike", "archer", "pike", "sword"];
  return rng.pick(p.aggression >= 1 ? aggressive : defensive);
}

function moveHalf(src: County, dst: County): void {
  for (const k of UNIT_TYPES) { const m = Math.floor(src.troops[k] / 2); dst.troops[k] += m; src.troops[k] -= m; }
}

/**
 * Turno da IA rival (Fase 3) — mais esperta:
 * recruta conforme personalidade, consolida tropas do interior para a fronteira,
 * valoriza alvos (prosperidade/renda + peso do jogador) e só ataca com vantagem
 * (maior contra fortificados; menor se agressivo). Respeita a trégua com o jogador.
 */
export function runRivalTurn(kingdom: Kingdom, rng: Rng, profile: LordProfile, truceActive: boolean): CampaignEvent[] {
  const events: CampaignEvent[] = [];
  const reds = kingdom.counties.filter((c) => c.owner === "red");
  if (reds.length === 0) return events;
  const gold = reds.reduce((s, c) => s + c.income, 0) + 40;

  // --- recrutamento: concentra nas fronteiras mais fracas; personalidades agressivas gastam mais ---
  const borders = reds.filter((c) => isBorder(kingdom, c));
  const pool = (borders.length ? borders : reds).slice().sort((a, b) => troopCount(a.troops) - troopCount(b.troops));
  const budget = gold * Math.min(1, 0.65 + profile.aggression * 0.2);
  let spent = 0;
  for (const c of pool) {
    while (gold - spent >= 45) {
      const k = pickRecruit(rng, profile);
      const cost = UNITS[k].cost;
      if (spent + cost > budget || gold - spent < cost) break;
      c.troops[k]++; spent += cost;
    }
    if (spent >= budget) break;
  }

  // --- consolidação: interior seguro reforça um vizinho de fronteira ---
  for (const c of reds) {
    if (c.moved || troopCount(c.troops) < 4 || isBorder(kingdom, c)) continue;
    const front = adjacency(kingdom.edges, c.id).map((n) => kingdom.counties[n])
      .find((n) => n.owner === "red" && !n.moved && isBorder(kingdom, n));
    if (front) { moveHalf(c, front); c.moved = true; }
  }

  // --- ataques com valorização de alvo ---
  for (const c of reds) {
    if (c.moved) continue;
    const cands = adjacency(kingdom.edges, c.id).map((n) => kingdom.counties[n])
      .filter((n) => n.owner !== "red" && !(truceActive && n.owner === "blue"));
    if (!cands.length) continue;

    let best: County | null = null, bestScore = -Infinity;
    for (const t of cands) {
      const weakness = troopCount(c.troops) - troopCount(t.troops);
      const value = t.prosperity / 50 + t.income / 10 + (t.owner === "blue" ? profile.targetsPlayer * 6 : 1);
      const score = weakness * 0.5 + value;
      if (score > bestScore) { bestScore = score; best = t; }
    }
    if (!best) continue;

    const need = (best.owner !== "neutral" ? 1.25 : 1.05) / profile.aggression;
    if (troopCount(c.troops) > troopCount(best.troops) * need && troopCount(c.troops) > 2) {
      const res = autoResolve(c.troops, best.troops, { defenderFortified: best.owner !== "neutral" });
      if (res.winner === "attacker") {
        const wasBlue = best.owner === "blue";
        best.owner = "red"; best.troops = res.attacker; c.troops = emptyTroops(); c.moved = true;
        events.push({ text: `${wasBlue ? "⚠ " : ""}${profile.name} tomou ${best.name}${wasBlue ? " (seu condado!)" : ""}.`, kind: wasBlue ? "lose" : "info" });
      } else {
        c.troops = res.attacker; best.troops = res.defender; c.moved = true;
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
