import { describe, it, expect } from "vitest";
import { autoResolve } from "@/domain/combat/autoResolve";
import { BattleSim } from "@/domain/combat/tacticalSim";
import { emptyTroops, troopCount, type Troops } from "@/domain/types";

function troops(p: Partial<Troops>): Troops {
  return { ...emptyTroops(), ...p };
}

describe("autoResolve (estratégico)", () => {
  it("exército maior vence o menor", () => {
    const r = autoResolve(troops({ sword: 6, pike: 4, knight: 2 }), troops({ sword: 2, pike: 2 }), { defenderFortified: true });
    expect(r.winner).toBe("attacker");
    expect(troopCount(r.attacker)).toBeGreaterThan(0);
  });

  it("piques resistem a cavalaria pura", () => {
    const r = autoResolve(troops({ knight: 5 }), troops({ pike: 6 }), { defenderFortified: true });
    expect(r.winner).toBe("defender");
  });

  it("sempre termina (<= maxRounds) e sem NaN", () => {
    const r = autoResolve(troops({ sword: 4, pike: 3, archer: 2 }), troops({ sword: 4, pike: 3, archer: 2 }), { defenderFortified: true });
    expect(r.rounds).toBeLessThanOrEqual(40);
    expect(Number.isFinite(troopCount(r.attacker))).toBe(true);
    expect(Number.isFinite(troopCount(r.defender))).toBe(true);
  });
});

describe("BattleSim (tático)", () => {
  it("determinístico: mesmo seed -> mesmo resultado", () => {
    const cfg = { attacker: troops({ sword: 4, knight: 2 }), defender: troops({ pike: 4 }), fortified: false, width: 1000, height: 560, seed: 42 };
    const run = () => {
      const s = new BattleSim({ ...cfg });
      let guard = 0;
      while (!s.over && guard++ < 5000) s.step(1 / 60);
      return { winner: s.winner, blue: s.survivors("blue"), red: s.survivors("red") };
    };
    expect(run()).toEqual(run());
  });

  it("batalha termina em tempo finito com vencedor", () => {
    const s = new BattleSim({ attacker: troops({ knight: 3, sword: 4 }), defender: troops({ archer: 3, sword: 2 }), fortified: false, width: 1000, height: 560, seed: 7 });
    let guard = 0;
    while (!s.over && guard++ < 10000) s.step(1 / 60);
    expect(s.over).toBe(true);
    expect(s.winner === "blue" || s.winner === "red").toBe(true);
  });
});
