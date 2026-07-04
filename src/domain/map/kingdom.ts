/**
 * Mapa do reino — condados, arestas, adjacência e criação do estado inicial.
 */
import type { County, Kingdom, Faction } from "../types";
import { emptyTroops } from "../types";
import type { Rng } from "../rng";
import { initCountyEconomy } from "./countyEconomy";

interface CountySeed { id: number; name: string; x: number; y: number; }

const SEEDS: readonly CountySeed[] = [
  { id: 0, name: "Ravenmoor", x: 150, y: 105 },
  { id: 1, name: "Ashford",   x: 340, y: 85 },
  { id: 2, name: "Blackfen",  x: 540, y: 115 },
  { id: 3, name: "Greystone", x: 720, y: 105 },
  { id: 4, name: "Thornwood", x: 230, y: 290 },
  { id: 5, name: "Kingsvale", x: 440, y: 300 },
  { id: 6, name: "Duncastle", x: 650, y: 290 },
  { id: 7, name: "Millbrook", x: 150, y: 485 },
  { id: 8, name: "Redmarsh",  x: 400, y: 505 },
  { id: 9, name: "Ironhold",  x: 700, y: 485 },
];

export const EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [0, 4], [1, 5], [2, 5], [3, 6], [4, 5],
  [5, 6], [4, 7], [5, 8], [6, 9], [7, 8], [8, 9], [8, 6], [1, 4], [2, 6],
];

export function adjacency(edges: ReadonlyArray<readonly [number, number]>, id: number): number[] {
  const a = new Set<number>();
  for (const [u, v] of edges) {
    if (u === id) a.add(v);
    if (v === id) a.add(u);
  }
  return [...a];
}

/** Cria o reino inicial. Player começa em Millbrook (7), rival em Greystone (3). */
export function createKingdom(rng: Rng): Kingdom {
  const counties: County[] = SEEDS.map((s) => ({
    ...s,
    owner: "neutral" as Faction,
    troops: emptyTroops(),
    pop: rng.int(8, 16),
    income: 0,
    moved: false,
    farms: 0,
    grain: 0,
    prosperity: 0,
  }));

  const player = counties[7];
  player.owner = "blue";
  player.troops = { sword: 4, pike: 3, archer: 2, knight: 1, mace: 1 };
  player.pop = 18;

  const rival = counties[3];
  rival.owner = "red";
  rival.troops = { sword: 4, pike: 3, archer: 3, knight: 1, mace: 1 };
  rival.pop = 18;

  for (const c of counties) {
    if (c.owner === "neutral") {
      c.troops = { sword: rng.int(1, 3), pike: rng.int(1, 3), archer: rng.int(0, 2), knight: 0, mace: 0 };
    }
    initCountyEconomy(c);
  }

  return { counties, edges: EDGES };
}
