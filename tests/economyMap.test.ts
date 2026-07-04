import { describe, it, expect } from "vitest";
import { createKingdom, Rng, tickCountyStrategic, tickEconomy, initCountyEconomy, strategicIncome } from "@/domain";
import type { County } from "@/domain";

function county(pop: number, farms: number): County {
  const c: County = { id: 0, name: "Test", x: 0, y: 0, owner: "blue", troops: { sword: 0, pike: 0, archer: 0, knight: 0, mace: 0 }, pop, income: 0, moved: false, farms, grain: pop, prosperity: 60 };
  return c;
}

describe("economia estratégica por condado (M4)", () => {
  it("condado com fazendas suficientes cresce e prospera", () => {
    const c = county(10, 8); // 8 fazendas alimentam bem 10 pop
    const rng = new Rng(5);
    const p0 = c.pop;
    for (let i = 0; i < 6; i++) tickCountyStrategic(c, rng);
    expect(c.pop).toBeGreaterThan(p0);
    expect(c.prosperity).toBeGreaterThanOrEqual(60);
    expect(c.income).toBeGreaterThan(0);
  });

  it("condado sem fazendas passa fome e perde população", () => {
    const c = county(20, 0); // sem produção
    const rng = new Rng(5);
    for (let i = 0; i < 6; i++) tickCountyStrategic(c, rng);
    expect(c.pop).toBeLessThan(20);
    expect(c.prosperity).toBeLessThan(60);
  });

  it("renda cresce com prosperidade", () => {
    const poor = county(10, 5); poor.prosperity = 20;
    const rich = county(10, 5); rich.prosperity = 100;
    expect(strategicIncome(rich)).toBeGreaterThan(strategicIncome(poor));
  });

  it("tickEconomy é determinístico e não gera NaN", () => {
    const run = () => {
      const rng = new Rng(2026);
      const k = createKingdom(rng);
      for (let i = 0; i < 10; i++) tickEconomy(k, rng);
      return k.counties.map((c) => `${c.pop}|${c.income}|${Math.round(c.prosperity)}`).join(",");
    };
    const a = run(), b = run();
    expect(a).toBe(b);
    expect(a).not.toMatch(/NaN/);
  });

  it("initCountyEconomy popula os campos", () => {
    const c = county(12, 0);
    c.farms = 0; c.grain = 0; c.prosperity = 0;
    initCountyEconomy(c);
    expect(c.farms).toBeGreaterThan(0);
    expect(c.prosperity).toBe(60);
    expect(c.income).toBeGreaterThan(0);
  });
});
