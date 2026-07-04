/**
 * Tipos base do domínio. Camada pura — nenhuma dependência de Pixi/DOM.
 * Tudo aqui é serializável e determinístico (fundação p/ multiplayer e replays).
 */

export type UnitType = "sword" | "pike" | "archer" | "knight" | "mace";
export const UNIT_TYPES: readonly UnitType[] = ["sword", "pike", "archer", "knight", "mace"] as const;

export type Faction = "blue" | "red" | "green" | "neutral";
/** Facções controladas pela IA (lordes rivais). */
export const AI_FACTIONS = ["red", "green"] as const;
export type AiFaction = (typeof AI_FACTIONS)[number];

/** Quantidade de cada tipo de unidade numa companhia/exército. */
export type Troops = Record<UnitType, number>;

/** Estatísticas de um tipo de unidade — táticas (tempo real) + estratégicas (mapa). */
export interface UnitStats {
  readonly name: string;
  readonly glyph: string;
  // táticas
  readonly hp: number;
  readonly dmg: number;
  readonly range: number;
  readonly speed: number;
  readonly cooldown: number; // segundos entre ataques
  readonly radius: number;
  readonly armor: number;
  readonly ranged?: boolean;
  readonly cavalry?: boolean;
  readonly siege?: number; // multiplicador de dano a estruturas
  // estratégicas
  readonly str: number; // força para auto-resolução
  readonly cost: number; // custo de recrutamento (ouro)
}

/** Condado no mapa estratégico. */
export interface County {
  readonly id: number;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  owner: Faction;
  troops: Troops;
  pop: number;
  income: number;
  moved: boolean;
  // --- economia estratégica (M4) ---
  farms: number;       // capacidade de produção de comida
  grain: number;       // estoque de comida
  prosperity: number;  // 0..100 — afeta renda e crescimento
}

export interface Kingdom {
  readonly counties: County[];
  /** arestas de adjacência (pares de ids). */
  readonly edges: ReadonlyArray<readonly [number, number]>;
}

export type Season = 0 | 1 | 2 | 3; // Primavera, Verão, Outono, Inverno

/** Estado do condado no loop econômico (modo gestão). */
export interface CountyEconomy {
  year: number;
  season: Season;
  pop: number;
  happy: number;
  gold: number;
  tax: number;
  store: {
    grain: number; cattle: number; sheep: number;
    wood: number; stone: number; iron: number; weapons: number;
  };
  fieldsPlanted: number;
  labor: Record<"farm" | "cattle" | "sheep" | "wood" | "stone" | "iron" | "smith", number>;
}

/** Resultado de um combate (auto-resolvido ou tático). */
export interface BattleResult {
  winner: "attacker" | "defender";
  attacker: Troops;
  defender: Troops;
  rounds?: number;
}

export type Screen = "menu" | "county" | "battle" | "campaign";

export function emptyTroops(): Troops {
  return { sword: 0, pike: 0, archer: 0, knight: 0, mace: 0 };
}

export function troopCount(t: Troops): number {
  return UNIT_TYPES.reduce((s, k) => s + t[k], 0);
}

export function cloneTroops(t: Troops): Troops {
  return { sword: t.sword, pike: t.pike, archer: t.archer, knight: t.knight, mace: t.mace };
}
