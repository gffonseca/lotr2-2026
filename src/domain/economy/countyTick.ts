/**
 * Loop econômico do condado (modo gestão) — regra pura, uma estação por chamada.
 * Determinística dado o RNG. Retorna o novo estado + eventos para a UI narrar.
 */
import type { CountyEconomy, Season } from "../types";
import { Rng } from "../rng";

export const ECONOMY_CONFIG = {
  foodPerFamily: 3,
  seedPerField: 6,
  yieldPerField: 46,
  totalFields: 12,
  cattleBreed: 0.12,
  cattleMeat: 34,
  cattleWinterFeed: 2,
  sheepBreed: 0.14,
  woolPerSheep: 1.1,
  woodPerFamily: 5,
  stonePerFamily: 3,
  ironPerFamily: 2,
  ironPerWeapon: 2,
  weaponsPerSmith: 2,
  taxBase: 1.2,
  tenderCapacity: 6,
} as const;

export const SEASON_NAMES = ["Primavera", "Verão", "Outono", "Inverno"] as const;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function createCountyEconomy(): CountyEconomy {
  return {
    year: 1, season: 0, pop: 20, happy: 70, gold: 100, tax: 15,
    store: { grain: 120, cattle: 8, sheep: 10, wood: 30, stone: 10, iron: 6, weapons: 0 },
    fieldsPlanted: 0,
    labor: { farm: 6, cattle: 2, sheep: 2, wood: 3, stone: 1, iron: 1, smith: 0 },
  };
}

export function laborUsed(e: CountyEconomy): number {
  const l = e.labor;
  return l.farm + l.cattle + l.sheep + l.wood + l.stone + l.iron + l.smith;
}

export function foodReserve(e: CountyEconomy): number {
  const c = ECONOMY_CONFIG;
  return (e.store.grain + e.store.cattle * c.cattleMeat) / (e.pop * c.foodPerFamily || 1);
}

export interface TickResult {
  events: string[];
  starved: number;
  born: number;
  left: number;
}

/** Avança uma estação. Muta `e` no lugar e devolve os eventos. */
export function tickCounty(e: CountyEconomy, rng: Rng): TickResult {
  const c = ECONOMY_CONFIG;
  const st = e.store;
  const a = e.labor;
  const season = e.season;
  const events: string[] = [];

  // recursos
  st.wood += a.wood * c.woodPerFamily;
  st.stone += a.stone * c.stonePerFamily;
  st.iron += a.iron * c.ironPerFamily;

  // ferraria
  if (a.smith > 0) {
    const cap = a.smith * c.weaponsPerSmith;
    const w = Math.min(cap, Math.floor(st.iron / c.ironPerWeapon));
    st.weapons += w; st.iron -= w * c.ironPerWeapon;
    if (w > 0) events.push(`Ferraria forjou ${w} armas`);
  }

  // fazenda (ciclo sazonal)
  if (season === 0) {
    const planted = Math.min(c.totalFields, Math.floor(a.farm), Math.floor(st.grain / c.seedPerField));
    st.grain -= planted * c.seedPerField;
    e.fieldsPlanted = planted;
    if (planted) events.push(`Plantados ${planted} campos`);
  } else if (season === 2) {
    const care = clamp(a.farm / (e.fieldsPlanted || 1), 0.4, 1);
    const harvest = Math.round(e.fieldsPlanted * c.yieldPerField * care);
    st.grain += harvest; e.fieldsPlanted = 0;
    if (harvest) events.push(`Colheita: +${harvest} grãos`);
  }

  // rebanhos
  const cattleCap = a.cattle * c.tenderCapacity;
  if (season !== 3) {
    st.cattle += Math.floor(st.cattle * c.cattleBreed * clamp(cattleCap / (st.cattle || 1), 0, 1));
  } else {
    const need = st.cattle * c.cattleWinterFeed;
    if (st.grain >= need) st.grain -= need;
    else {
      const die = Math.ceil((need - st.grain) / c.cattleWinterFeed);
      st.grain = 0; st.cattle = Math.max(0, st.cattle - die);
      if (die) events.push(`${die} gado morreu de fome no inverno`);
    }
  }
  const sheepCap = a.sheep * c.tenderCapacity;
  const sf = clamp(sheepCap / (st.sheep || 1), 0, 1);
  if (season !== 3) st.sheep += Math.floor(st.sheep * c.sheepBreed * sf);
  const wool = Math.round(st.sheep * c.woolPerSheep * sf);
  const woolGold = Math.round(wool * 2.2);
  e.gold += woolGold;
  if (wool) events.push(`Lã: ${wool} vendida por ${woolGold} moedas`);

  // impostos
  const taxGold = Math.round((e.pop * e.tax * c.taxBase) / 10);
  e.gold += taxGold;
  events.push(`Impostos renderam ${taxGold} moedas`);

  // consumo de comida
  const need = e.pop * c.foodPerFamily;
  let starved = 0;
  if (st.grain >= need) st.grain -= need;
  else {
    let deficit = need - st.grain; st.grain = 0;
    while (deficit > 0 && st.cattle > 0) { st.cattle--; deficit -= c.cattleMeat; }
    if (deficit > 0) { starved = Math.min(e.pop, Math.ceil(deficit / c.foodPerFamily)); e.pop -= starved; }
  }
  if (starved) events.push(`⚠ FOME: ${starved} famílias pereceram`);

  // felicidade
  const reserve = foodReserve(e);
  let dh = 0;
  dh += reserve > 2 ? 4 : reserve > 1 ? 1 : -6;
  dh += st.cattle > 0 && st.grain > 0 ? 2 : 0;
  dh += e.tax <= 10 ? 2 : e.tax <= 20 ? 0 : -(e.tax - 20) / 3;
  dh += laborUsed(e) >= e.pop * 0.6 ? 1 : -1;
  if (starved) dh -= 10;
  e.happy = Math.round(clamp(e.happy + dh, 0, 100));

  // população
  let born = 0, left = 0;
  if (e.happy >= 60 && reserve > 1.2) { born = Math.max(1, Math.round(e.pop * 0.05)); e.pop += born; }
  else if (e.happy < 30) { left = Math.max(1, Math.round(e.pop * 0.04)); e.pop = Math.max(1, e.pop - left); }
  if (born) events.push(`👶 ${born} novas famílias`);
  if (left) events.push(`🚪 ${left} famílias partiram`);

  // avança o relógio (rng reservado p/ eventos futuros: pragas, clima)
  void rng;
  e.season = ((e.season + 1) % 4) as Season;
  if (e.season === 0) e.year++;

  return { events, starved, born, left };
}
