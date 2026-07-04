/**
 * Persistência da campanha — serialização PURA (testável, sem localStorage).
 * O acesso ao storage fica no store; aqui só transformamos snapshot <-> JSON.
 */
import type { County, AiFaction, Demand } from "@/domain";

export const SAVE_VERSION = 4; // v4: múltiplos lordes, relações e demandas
export const SAVE_KEY = "lotr2-2026:campaign";

export interface LogLineSnapshot { text: string; kind: "info" | "win" | "lose"; }

export interface CampaignSnapshot {
  version: number;
  gold: number;
  year: number;
  counties: County[];
  selected: number | null;
  winner: "win" | "lose" | null;
  log: LogLineSnapshot[];
  rngState: number;
  lords: Record<AiFaction, string>;
  relations: Record<AiFaction, string>;
  truceTurns: Record<AiFaction, number>;
  pendingDemand: Demand | null;
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
    const anyLords = data.lords as Record<AiFaction, string> | undefined;
    const anyRel = data.relations as Record<AiFaction, string> | undefined;
    const anyTruce = data.truceTurns as Record<AiFaction, number> | undefined;
    return {
      version: SAVE_VERSION,
      gold: data.gold,
      year: data.year,
      counties: data.counties as County[],
      selected: data.selected ?? null,
      winner: data.winner ?? null,
      log: Array.isArray(data.log) ? (data.log as LogLineSnapshot[]) : [],
      rngState: data.rngState,
      lords: { red: anyLords?.red ?? "knight", green: anyLords?.green ?? "baron" },
      relations: { red: anyRel?.red ?? "war", green: anyRel?.green ?? "war" },
      truceTurns: { red: anyTruce?.red ?? 0, green: anyTruce?.green ?? 0 },
      pendingDemand: (data.pendingDemand as Demand | null) ?? null,
    };
  } catch {
    return null;
  }
}
