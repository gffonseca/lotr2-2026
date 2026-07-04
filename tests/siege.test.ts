import { describe, it, expect } from "vitest";
import { BattleSim, emptyTroops, type Troops } from "@/domain";

const T = (p: Partial<Troops>): Troops => ({ ...emptyTroops(), ...p });
const base = { width: 1000, height: 560, seed: 1, fortified: true as const };

function run(sim: BattleSim, seconds: number, dt = 1 / 30): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps && !sim.over; i++) sim.step(dt);
}

describe("Fase 2 — máquinas de cerco", () => {
  it("catapulta danifica o portão ao longo do tempo", () => {
    const sim = new BattleSim({ ...base, attacker: T({ sword: 1 }), defender: T({ pike: 1 }), siege: { catapults: 1 } });
    const g0 = sim.gate.hp;
    run(sim, 18);
    expect(sim.gate.hp).toBeLessThan(g0);
  });

  it("aríete quebra o portão", () => {
    const sim = new BattleSim({ ...base, attacker: T({ sword: 1 }), defender: T({ pike: 1 }), siege: { rams: 1 } });
    const g0 = sim.gate.hp;
    run(sim, 32);
    expect(sim.gate.hp).toBeLessThan(g0 * 0.6);
  });

  it("sapador abre uma brecha na muralha", () => {
    const sim = new BattleSim({ ...base, attacker: T({ sword: 1 }), defender: T({ pike: 1 }), siege: { sappers: 1 } });
    expect(sim.breaches.length).toBe(0);
    run(sim, 30);
    expect(sim.breaches.length).toBeGreaterThan(0);
  });

  it("óleo fervente fere atacantes colados no portão", () => {
    const sim = new BattleSim({ ...base, attacker: T({ sword: 3 }), defender: T({ pike: 1 }), boilingOil: true });
    sim.units.filter((u) => u.team === "blue").slice(0, 3).forEach((u, i) => {
      u.x = sim.gate.x - 20; u.y = sim.gate.y - 15 + i * 12;
      u.orderKind = "gate"; u.orderX = sim.gate.x - 30; u.orderY = sim.gate.y;
    });
    const c0 = sim.oilCharges;
    expect(c0).toBe(3);
    run(sim, 8);
    expect(sim.oilCharges).toBeLessThan(c0);
  });

  it("determinístico: mesmo seed com cerco -> mesmo resultado", () => {
    const mk = () => new BattleSim({ ...base, attacker: T({ sword: 4 }), defender: T({ pike: 3, archer: 2 }), siege: { catapults: 1, rams: 1 }, boilingOil: true });
    const runReport = () => { const s = mk(); run(s, 25); return `${s.gate.hp}|${s.breaches.length}|${JSON.stringify(s.survivors("blue"))}`; };
    expect(runReport()).toBe(runReport());
  });

  it("sem fortificação não há cerco nem óleo", () => {
    const sim = new BattleSim({ ...base, fortified: false, attacker: T({ sword: 2 }), defender: T({ sword: 2 }), siege: { catapults: 1 }, boilingOil: true });
    expect(sim.sieges.length).toBe(0);
    expect(sim.oilCharges).toBe(0);
  });
});
