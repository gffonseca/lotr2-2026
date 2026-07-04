import { describe, it, expect } from "vitest";
import { createKingdom, Rng, runRivalTurn, LORDS, factionPower, troopCount } from "@/domain";
import type { Kingdom } from "@/domain";

function resetMoves(k: Kingdom) { k.counties.forEach((c) => (c.moved = false)); }

describe("IA estratégica do rival (Fase 3)", () => {
  it("factionPower cresce com mais tropas", () => {
    const k = createKingdom(new Rng(1));
    const before = factionPower(k, "blue");
    k.counties.find((c) => c.owner === "blue")!.troops.knight += 5;
    expect(factionPower(k, "blue")).toBeGreaterThan(before);
  });

  it("respeita a trégua: nunca toma condado do jogador", () => {
    const k = createKingdom(new Rng(7));
    const rng = new Rng(7);
    const blue0 = k.counties.filter((c) => c.owner === "blue").length;
    for (let i = 0; i < 12; i++) { resetMoves(k); runRivalTurn(k, rng, LORDS.baron, true); }
    const blueNow = k.counties.filter((c) => c.owner === "blue").length;
    expect(blueNow).toBeGreaterThanOrEqual(blue0);
  });

  it("turno do rival é determinístico e sem NaN", () => {
    const run = () => {
      const k = createKingdom(new Rng(9));
      const rng = new Rng(9);
      for (let i = 0; i < 10; i++) { resetMoves(k); runRivalTurn(k, rng, LORDS.knight, false); }
      const nan = k.counties.some((c) => !Number.isFinite(troopCount(c.troops)));
      return { sig: k.counties.map((c) => `${c.owner}:${troopCount(c.troops)}`).join(","), nan };
    };
    const a = run(), b = run();
    expect(a.sig).toBe(b.sig);
    expect(a.nan).toBe(false);
  });

  it("sem trégua, o rival agressivo expande (toma neutros/jogador)", () => {
    const k = createKingdom(new Rng(2));
    const rng = new Rng(2);
    const red0 = k.counties.filter((c) => c.owner === "red").length;
    for (let i = 0; i < 20; i++) { resetMoves(k); runRivalTurn(k, rng, LORDS.baron, false); }
    const redNow = k.counties.filter((c) => c.owner === "red").length;
    expect(redNow).toBeGreaterThan(red0);
  });
});
