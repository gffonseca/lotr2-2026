/**
 * Persistência da campanha — serialização PURA (testável, sem localStorage).
 * O acesso ao storage fica no store; aqui só transformamos snapshot <-> JSON.
 */
import type { County } from "@/domain";

export const SAVE_VERSION = 3; // v3: diplomacia (personalidade do rival + trégua)
export const SAVE_KEY = "lotr2-2026:campaign";

export interface LogLineSnapshot { text: string; kind: "info" | "win" | "lose"; }

export interface CampaignSnapshot {
  version: number;
  gold: number;
  year: number;
  counties: County[];
  selected: number | null;
  winner: "blue" | "red" | null;
  log: LogLineSnapshot[];
  rngState: number;
  rivalPersonality: string;
  truceTurns: number;
}

export function serialize(snap: CampaignSnapshot): string {
  return JSON.stringify(snap);
}

/** Desserializa e valida. Retorna null se inválido/incompatível. */
export function deserialize(json: string): CampaignSnapshot | null {
  try {
    const data = JSON.parse(json) as Partial<CampaignSnapshot>;
    if (!data || data.version !== SAVE_VERSION) return null;
    if (!Array.isArray(data.counties) || data.counties.length === 0) return null;
    if (typeof data.gold !== "number" || typeof data.year !== "number") return null;
    if (typeof data.rngState !== "number") return null;
    return {
      version: SAVE_VERSION,
      gold: data.gold,
      year: data.year,
      counties: data.counties as County[],
      selected: data.selected ?? null,
      winner: data.winner ?? null,
      log: Array.isArray(data.log) ? (data.log as LogLineSnapshot[]) : [],
      rngState: data.rngState,
      rivalPersonality: typeof data.rivalPersonality === "string" ? data.rivalPersonality : "knight",
      truceTurns: typeof data.truceTurns === "number" ? data.truceTurns : 0,
    };
  } catch {
    return null;
  }
}
