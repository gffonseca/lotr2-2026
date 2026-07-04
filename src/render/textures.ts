/** Texturas procedurais (pergaminho, madeira, pedra, grama) para o render. */
import { Assets, Texture } from "pixi.js";

export type TexName = "parchment" | "wood" | "stone" | "grass" | "mapfield";

const URLS: Record<TexName, string> = {
  parchment: "/textures/parchment.png",
  wood: "/textures/wood.png",
  stone: "/textures/stone.png",
  grass: "/textures/grass.png",
  mapfield: "/textures/mapfield.png",
};

let loaded = false;

export async function preloadTextures(): Promise<void> {
  if (loaded) return;
  await Promise.all(Object.values(URLS).map(async (u) => {
    try { await Assets.load(u); } catch { /* fallback p/ cor sólida */ }
  }));
  loaded = true;
}

export function tex(name: TexName): Texture | null {
  return Assets.get<Texture>(URLS[name]) ?? null;
}
