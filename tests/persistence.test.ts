import { describe, it, expect } from "vitest";
import { serialize, deserialize, SAVE_VERSION, type CampaignSnapshot } from "@/state/persistence";
import { createKingdom, Rng } from "@/domain";

function makeSnapshot(): CampaignSnapshot {
  const rng = new Rng(2026);
  const kingdom = createKingdom(rng);
  return {
    version: SAVE_VERSION,
    gold: 275,
    year: 4,
    counties: kingdom.counties,
    selected: 7,
    winner: null,
    log: [{ text: "⚔ Ashford tomado!", kind: "win" }],
    rngState: rng.snapshot(),
    lords: { red: "knight", green: "baron" },
    relations: { red: "truce", green: "war" },
    truceTurns: { red: 2, green: 0 },
    pendingDemand: null,
  };
}

describe("persistência da campanha", () => {
  it("round-trip: serialize -> deserialize preserva o estado", () => {
    const snap = makeSnapshot();
    const restored = deserialize(serialize(snap));
    expect(restored).not.toBeNull();
    expect(restored!.gold).toBe(275);
    expect(restored!.year).toBe(4);
    expect(restored!.selected).toBe(7);
    expect(restored!.rngState).toBe(snap.rngState);
    expect(restored!.counties.length).toBe(snap.counties.length);
    expect(restored!.counties[7].owner).toBe("blue");
  });

  it("rejeita versão incompatível", () => {
    const bad = serialize({ ...makeSnapshot(), version: 999 });
    expect(deserialize(bad)).toBeNull();
  });

  it("rejeita JSON corrompido", () => {
    expect(deserialize("{não é json")).toBeNull();
    expect(deserialize("{}")).toBeNull();
  });

  it("determinismo: restaurar rngState reproduz a mesma sequência", () => {
    const rng = new Rng(1);
    for (let i = 0; i < 5; i++) rng.next();
    const state = rng.snapshot();
    const a = [rng.next(), rng.next(), rng.next()];
    const rng2 = new Rng(0);
    rng2.restore(state);
    const b = [rng2.next(), rng2.next(), rng2.next()];
    expect(b).toEqual(a);
  });
});
