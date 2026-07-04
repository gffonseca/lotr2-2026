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

const idleUrl = (team: SpriteTeam, t: UnitType) => `/sprites/${team}_${t}.png`;
const walkUrl = (team: SpriteTeam, t: UnitType) => `/sprites/${team}_${t}_walk.png`;

const ALL_URLS: string[] = (["blue", "red"] as SpriteTeam[]).flatMap((team) =>
  UNIT_TYPES.flatMap((t) => [idleUrl(team, t), walkUrl(team, t)]),
);

const frameCache = new Map<string, Texture[]>();
let loaded = false;

export async function preloadUnitSprites(): Promise<void> {
  if (loaded) return;
  try {
    await Assets.load(ALL_URLS);
    loaded = true;
  } catch {
    loaded = false;
  }
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
