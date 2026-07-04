/**
 * Diplomacia e personalidades dos lordes rivais (Fase 3).
 * Determinístico e puro — aceitação depende de personalidade, força e tributo.
 */
import type { AiFaction } from "../types";

export type Personality = "baron" | "knight" | "countess" | "bishop";
/** Relação do jogador com um lorde. */
export type RelationState = "war" | "truce" | "alliance";

export interface LordProfile {
  id: Personality;
  name: string;
  epithet: string;
  aggression: number;    // >1 = mais agressivo (ataca com menos vantagem)
  truceBias: number;     // 0..1 = disposição a aceitar trégua
  targetsPlayer: number; // 0..1 = preferência por atacar o jogador vs neutros
}

export const LORDS: Record<Personality, LordProfile> = {
  baron:    { id: "baron",    name: "Barão Aldric",        epithet: "o Impiedoso",  aggression: 1.35, truceBias: 0.20, targetsPlayer: 0.90 },
  knight:   { id: "knight",   name: "Cavaleiro Roderick",  epithet: "o Oportunista", aggression: 1.05, truceBias: 0.45, targetsPlayer: 0.55 },
  countess: { id: "countess", name: "Condessa Isolde",     epithet: "a Próspera",    aggression: 0.80, truceBias: 0.60, targetsPlayer: 0.40 },
  bishop:   { id: "bishop",   name: "Bispo Constantin",    epithet: "o Cauteloso",   aggression: 0.65, truceBias: 0.80, targetsPlayer: 0.35 },
};

export const PERSONALITIES: Personality[] = ["baron", "knight", "countess", "bishop"];

export const TRUCE_TURNS = 4;

/** Custo (tributo) para propor trégua, proporcional à força do rival. */
export function truceCost(rivalPower: number): number {
  return Math.max(60, Math.round(rivalPower * 1.1));
}

export interface TruceOffer { tribute: number; playerPower: number; rivalPower: number; }
export interface TruceResult { accept: boolean; reason: string; }

/** Avalia se o rival aceita a trégua. Score >= 0.55 aceita. */
export function evaluateTruce(p: LordProfile, o: TruceOffer): TruceResult {
  const ratio = o.playerPower / (o.rivalPower || 1); // >1 = jogador mais forte
  const fear = Math.max(0, Math.min(1, ratio - 1));  // quão intimidado
  const bribe = Math.min(0.5, o.tribute / 400);
  const score = p.truceBias * 0.6 + fear * 0.5 + bribe;
  const accept = score >= 0.55;
  const reason = accept
    ? ratio > 1.2 ? "Sua força o intimida — ele aceita a trégua."
      : o.tribute >= 100 ? "O tributo o agrada. Trégua selada."
      : "Ele consente com a trégua, por ora."
    : p.aggression > 1.2 ? "Ele despreza sua oferta e prepara as tropas."
      : "Ele não vê motivo para uma trégua agora.";
  return { accept, reason };
}

// ------------------- Aliança (mais difícil que trégua) -------------------
export const ALLIANCE_TURNS = 8;
export function allianceCost(lordPower: number): number { return Math.max(120, Math.round(lordPower * 1.8)); }

export function evaluateAlliance(p: LordProfile, o: TruceOffer): TruceResult {
  const ratio = o.playerPower / (o.rivalPower || 1);
  const fear = Math.max(0, Math.min(1, ratio - 1));
  const bribe = Math.min(0.4, o.tribute / 700);
  const score = p.truceBias * 0.45 + fear * 0.4 + bribe;
  const accept = score >= 0.6;
  return {
    accept,
    reason: accept ? "Ele sela uma aliança convosco." : "Ele não confia o bastante para uma aliança.",
  };
}

// ------------------- Demanda / blefe -------------------
export const DEMAND_TRUCE_TURNS = 3;
export interface Demand { faction: AiFaction; lordName: string; tribute: number; willFollowThrough: boolean; }

/** Chance de um lorde emitir uma demanda num turno (maior se agressivo). */
export function demandChance(p: LordProfile): number { return 0.10 + p.aggression * 0.10; }
/** Chance de a ameaça ser real (agressivo cumpre; cauteloso blefa). */
export function demandFollowThrough(p: LordProfile): number { return Math.min(0.9, Math.max(0.1, p.aggression * 0.6)); }
