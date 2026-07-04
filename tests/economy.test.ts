import { describe, it, expect } from "vitest";
import { createCountyEconomy, tickCounty, foodReserve } from "@/domain/economy/countyTick";
import { Rng } from "@/domain/rng";

describe("countyTick (economia sazonal)", () => {
  it("3 anos: população cresce, sem NaN, grãos nunca negativos", () => {
    const e = createCountyEconomy();
    e.labor = { farm: 8, cattle: 2, sheep: 2, wood: 2, stone: 1, iron: 1, smith: 0 };
    const rng = new Rng(123);
    const startPop = e.pop;
    for (let i = 0; i < 12; i++) {
      tickCounty(e, rng);
      expect(e.store.grain).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(e.pop)).toBe(true);
      expect(Number.isFinite(e.gold)).toBe(true);
    }
    expect(e.pop).toBeGreaterThan(startPop);
    expect(foodReserve(e)).toBeGreaterThan(1);
  });

  it("colheita ocorre no outono (season 2 -> grãos sobem)", () => {
    const e = createCountyEconomy();
    e.labor.farm = 8;
    const rng = new Rng(1);
    // primavera: planta
    tickCounty(e, rng); // -> verão
    tickCounty(e, rng); // -> outono
    const before = e.store.grain;
    tickCounty(e, rng); // resolve o outono, colhe
    expect(e.store.grain).toBeGreaterThan(before);
  });

  it("determinístico: mesmo seed -> mesmo estado", () => {
    const run = () => {
      const e = createCountyEconomy();
      const rng = new Rng(999);
      for (let i = 0; i < 8; i++) tickCounty(e, rng);
      return JSON.stringify(e);
    };
    expect(run()).toBe(run());
  });
});
