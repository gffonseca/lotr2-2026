import { describe, it, expect } from "vitest";
import { LORDS, evaluateTruce, truceCost, PERSONALITIES } from "@/domain";

describe("diplomacia (Fase 3)", () => {
  it("Barão (agressivo) recusa tributo pequeno em força equilibrada", () => {
    expect(evaluateTruce(LORDS.baron, { tribute: 60, playerPower: 100, rivalPower: 100 }).accept).toBe(false);
  });

  it("Bispo (cauteloso) aceita trégua com facilidade", () => {
    expect(evaluateTruce(LORDS.bishop, { tribute: 60, playerPower: 100, rivalPower: 100 }).accept).toBe(true);
  });

  it("qualquer lorde aceita se o jogador é muito mais forte", () => {
    expect(evaluateTruce(LORDS.baron, { tribute: 0, playerPower: 300, rivalPower: 100 }).accept).toBe(true);
  });

  it("tributo maior aumenta a chance de aceitação", () => {
    const low = evaluateTruce(LORDS.knight, { tribute: 0, playerPower: 100, rivalPower: 100 });
    const high = evaluateTruce(LORDS.knight, { tribute: 400, playerPower: 100, rivalPower: 100 });
    expect(high.accept && !low.accept).toBe(true);
  });

  it("custo do tributo é proporcional à força do rival", () => {
    expect(truceCost(200)).toBeGreaterThan(truceCost(50));
    expect(truceCost(0)).toBe(60);
  });

  it("há 4 personalidades com traços distintos", () => {
    expect(PERSONALITIES.length).toBe(4);
    const aggressions = PERSONALITIES.map((p) => LORDS[p].aggression);
    expect(new Set(aggressions).size).toBe(4);
  });
});
