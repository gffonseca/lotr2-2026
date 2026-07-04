/**
 * Manifesto e carregamento dos sprites reais extraídos do jogo original (.PL8 -> PNG).
 * Servidos de /public/sprites. Enquanto não carregam, o render usa tokens (fallback).
 *  - idle:  {team}_{unit}.png          (1 frame, recortado)
 *  - walk:  {team}_{unit}_walk.png      (strip 6 frames × 48px, para animação) [M5.1]
 */
import { Assets, Texture, Rectangle } from "pixi.js";
import type { UnitType } from "@/domain";
import { UNIT_TYPES } from "@/domain";

export type SpriteTeam = "blue" | "red";
export const WALK_FRAMES = 6;
export const WALK_CELL = 48;

// --- Animação 8-direcional (M5.1 → 8-dir) ---
// Liga/desliga o modo direcional. Se as direções saírem tortas, ponha false
// (volta ao ciclo de walk + flip, que é robusto).
export const USE_DIRECTIONAL = true;
export const DIR_COUNT = 8;
export const DIR_FRAMES = 3; // frames por direção no atlas (_dir.png tem 8×3 = 24 células)
/**
 * Mapa octante→grupo do atlas. Octante 0 = leste (+x), sentido horário (y p/ baixo).
 * Como o layout original é ambíguo, este array é AJUSTÁVEL: se uma direção
 * apontar errado, permute os índices até bater. Identidade é o palpite inicial.
 */
export const DIRECTION_GROUPS: number[] = [0, 1, 2, 3, 4, 5, 6, 7];

const idleUrl = (team: SpriteTeam, t: UnitType) => `/sprites/${team}_${t}.png`;
const walkUrl = (team: SpriteTeam, t: UnitType) => `/sprites/${team}_${t}_walk.png`;
const dirUrl = (team: SpriteTeam, t: UnitType) => `/sprites/${team}_${t}_dir.png`;

const ALL_URLS: string[] = (["blue", "red"] as SpriteTeam[]).flatMap((team) =>
  UNIT_TYPES.flatMap((t) => [idleUrl(team, t), walkUrl(team, t), dirUrl(team, t)]),
);

/** Converte um ângulo de facing (rad, atan2 com y p/ baixo) num octante 0..7. */
export function facingToOctant(facing: number): number {
  const oct = Math.round(facing / (Math.PI / 4));
  return ((oct % DIR_COUNT) + DIR_COUNT) % DIR_COUNT;
}

const dirCache = new Map<string, Texture[]>();

/** Frames (3) da direção `octant` para a unidade, ou null se ausente/desligado. */
export function unitDirFrames(team: SpriteTeam, type: UnitType, octant: number): Texture[] | null {
  if (!USE_DIRECTIONAL) return null;
  const key = `${team}_${type}`;
  let atlas = dirCache.get(key);
  if (!atlas) {
    const strip = Assets.get<Texture>(dirUrl(team, type));
    if (!strip) return null;
    atlas = [];
    for (let i = 0; i < DIR_COUNT * DIR_FRAMES; i++) {
      atlas.push(new Texture({ source: strip.source, frame: new Rectangle(i * WALK_CELL, 0, WALK_CELL, WALK_CELL) }));
    }
    dirCache.set(key, atlas);
  }
  const group = DIRECTION_GROUPS[octant] ?? octant;
  return atlas.slice(group * DIR_FRAMES, group * DIR_FRAMES + DIR_FRAMES);
}

const frameCache = new Map<string, Texture[]>();
let loaded = false;

export async function preloadUnitSprites(): Promise<void> {
  if (loaded) return;
  // carrega cada asset independentemente: um faltante não derruba os demais
  await Promise.all(ALL_URLS.map(async (u) => {
    try { await Assets.load(u); } catch { /* asset ausente -> fallback no render */ }
  }));
  loaded = true;
}

/** Textura idle (1 frame), ou null. */
export function unitTexture(team: SpriteTeam, type: UnitType): Texture | null {
  return Assets.get<Texture>(idleUrl(team, type)) ?? null;
}

/** Frames de animação (fatiados do strip), ou null se ausente. */
export function unitFrames(team: SpriteTeam, type: UnitType): Texture[] | null {
  const key = `${team}_${type}`;
  const cached = frameCache.get(key);
  if (cached) return cached;
  const strip = Assets.get<Texture>(walkUrl(team, type));
  if (!strip) return null;
  const frames: Texture[] = [];
  for (let i = 0; i < WALK_FRAMES; i++) {
    frames.push(new Texture({ source: strip.source, frame: new Rectangle(i * WALK_CELL, 0, WALK_CELL, WALK_CELL) }));
  }
  frameCache.set(key, frames);
  return frames;
}
