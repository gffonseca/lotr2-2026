import { describe, it, expect } from "vitest";
import { createKingdom, Rng, runLordTurn, LORDS, factionPower, troopCount } from "@/domain";
import type { Kingdom, Faction } from "@/domain";

function resetMoves(k: Kingdom) { k.counties.forEach((c) => (c.moved = false)); }

describe("IA estratégica dos lordes (Fase 3 profunda)", () => {
  it("factionPower cresce com mais tropas", () => {
    const k = createKingdom(new Rng(1));
    const before = factionPower(k, "blue");
    k.counties.find((c) => c.owner === "blue")!.troops.knight += 5;
    expect(factionPower(k, "blue")).toBeGreaterThan(before);
  });

  it("o reino nasce com três facções (jogador + 2 lordes)", () => {
    const k = createKingdom(new Rng(3));
    expect(k.counties.some((c) => c.owner === "blue")).toBe(true);
    expect(k.counties.some((c) => c.owner === "red")).toBe(true);
    expect(k.counties.some((c) => c.owner === "green")).toBe(true);
  });

  it("lorde amigo (trégua/aliança) nunca toma condado do jogador", () => {
    const k = createKingdom(new Rng(7));
    const rng = new Rng(7);
    const friendly = new Set<Faction>(["red", "blue"]);
    const blue0 = k.counties.filter((c) => c.owner === "blue").length;
    for (let i = 0; i < 12; i++) { resetMoves(k); runLordTurn(k, rng, "red", LORDS.baron, friendly); }
    expect(k.counties.filter((c) => c.owner === "blue").length).toBeGreaterThanOrEqual(blue0);
  });

  it("turno do lorde é determinístico e sem NaN", () => {
    const run = () => {
      const k = createKingdom(new Rng(9));
      const rng = new Rng(9);
      const friendly = new Set<Faction>(["red"]);
      for (let i = 0; i < 10; i++) { resetMoves(k); runLordTurn(k, rng, "red", LORDS.knight, friendly); }
      const nan = k.counties.some((c) => !Number.isFinite(troopCount(c.troops)));
      return { sig: k.counties.map((c) => `${c.owner}:${troopCount(c.troops)}`).join(","), nan };
    };
    const a = run(), b = run();
    expect(a.sig).toBe(b.sig);
    expect(a.nan).toBe(false);
  });

  it("em guerra, lorde agressivo expande (toma neutros/inimigos)", () => {
    const k = createKingdom(new Rng(2));
    const rng = new Rng(2);
    const friendly = new Set<Faction>(["red"]);
    const red0 = k.counties.filter((c) => c.owner === "red").length;
    for (let i = 0; i < 20; i++) { resetMoves(k); runLordTurn(k, rng, "red", LORDS.baron, friendly); }
    expect(k.counties.filter((c) => c.owner === "red").length).toBeGreaterThan(red0);
  });

  it("IA vs IA: dois lordes em guerra podem se atacar", () => {
    const k = createKingdom(new Rng(4));
    const rng = new Rng(4);
    const redFriends = new Set<Faction>(["red"]);
    const greenFriends = new Set<Faction>(["green"]);
    const green0 = k.counties.filter((c) => c.owner === "green").length;
    const red0 = k.counties.filter((c) => c.owner === "red").length;
    for (let i = 0; i < 25; i++) {
      resetMoves(k); runLordTurn(k, rng, "red", LORDS.baron, redFriends);
      runLordTurn(k, rng, "green", LORDS.baron, greenFriends);
    }
    const redNow = k.counties.filter((c) => c.owner === "red").length;
    const greenNow = k.counties.filter((c) => c.owner === "green").length;
    // o mapa mudou (alguém cresceu além do inicial)
    expect(redNow + greenNow).toBeGreaterThan(red0 + green0);
  });
});
