/**
 * Simulação tática de batalha em tempo real — NÚCLEO DE REGRAS, sem render.
 * Determinística (dado o mesmo seed + mesmos comandos + mesmo dt).
 * A camada de render (Pixi) chama step(dt) e lê `units`/`projectiles`/`gate`.
 */
import type { Troops, UnitType, Faction } from "../types";
import { UNIT_TYPES, emptyTroops } from "../types";
import { UNITS, tacticalCounter } from "../units";
import { Rng } from "../rng";

export interface BattleUnit {
  id: number;
  type: UnitType;
  team: Faction; // "blue" | "red"
  x: number; y: number;
  hp: number; maxHp: number;
  cd: number;
  facing: number;
  routing: boolean;
  orderKind: "move" | "attack" | "gate" | null;
  orderX: number | null; orderY: number | null;
  targetId: number | null;
}

export interface Projectile {
  x: number; y: number; vx: number; vy: number;
  t: number; ttl: number; targetId: number; ownerType: UnitType; ownerTeam: Faction; dmg: number;
}

export interface Gate { x: number; y: number; w: number; h: number; hp: number; maxHp: number; }

/** Evento cosmético de um passo (consumido pelo render p/ som e partículas). */
export interface SimEvent { type: "hit" | "shot" | "gate" | "death"; x: number; y: number; }

export interface BattleConfig {
  attacker: Troops;
  defender: Troops;
  fortified: boolean;
  width: number;
  height: number;
  seed: number;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export class BattleSim {
  readonly width: number;
  readonly height: number;
  units: BattleUnit[] = [];
  projectiles: Projectile[] = [];
  events: SimEvent[] = [];
  gate: Gate;
  over = false;
  winner: "blue" | "red" | null = null;

  private rng: Rng;
  private uid = 0;
  private aiTimer = 0;
  private wallX: number;

  constructor(cfg: BattleConfig) {
    this.width = cfg.width;
    this.height = cfg.height;
    this.rng = new Rng(cfg.seed);
    this.wallX = cfg.width - 150;
    this.gate = {
      x: this.wallX, y: cfg.height / 2, w: 26, h: 120,
      hp: cfg.fortified ? 600 : 0, maxHp: cfg.fortified ? 600 : 1,
    };
    this.deploy(cfg.attacker, "blue", 90);
    this.deploy(cfg.defender, "red", cfg.fortified ? this.wallX - 90 : this.wallX - 40);
  }

  private deploy(troops: Troops, team: Faction, x0: number): void {
    let y = 70;
    for (const k of UNIT_TYPES) {
      for (let i = 0; i < troops[k]; i++) {
        this.spawn(k, x0 + this.rng.range(-16, 16), y, team);
        y += 42;
        if (y > this.height - 40) y = 92;
      }
    }
  }

  private spawn(type: UnitType, x: number, y: number, team: Faction): void {
    const s = UNITS[type];
    this.units.push({
      id: this.uid++, type, team, x, y, hp: s.hp, maxHp: s.hp, cd: 0,
      facing: team === "blue" ? 0 : Math.PI, routing: false,
      orderKind: null, orderX: null, orderY: null, targetId: null,
    });
  }

  /** Comando do jogador (via UI): mover ou atacar para um ponto. */
  orderUnits(ids: number[], px: number, py: number, kind: "move" | "attack"): void {
    let enemy: BattleUnit | null = null;
    let bd = 30;
    for (const u of this.units) {
      if (u.team === "red" && u.hp > 0) { const d = Math.hypot(u.x - px, u.y - py); if (d < bd) { bd = d; enemy = u; } }
    }
    const nearGate = this.gate.hp > 0 && Math.abs(px - this.gate.x) < 40 && Math.abs(py - this.gate.y) < this.gate.h / 2 + 20;
    ids.forEach((id, i) => {
      const u = this.units.find((x) => x.id === id);
      if (!u || u.hp <= 0) return;
      const oy = (Math.floor(i / 5) - 1) * 24;
      if (enemy) { u.orderKind = "attack"; u.targetId = enemy.id; u.orderX = u.orderY = null; }
      else if (nearGate) { u.orderKind = "gate"; u.targetId = null; u.orderX = this.gate.x - 30; u.orderY = this.gate.y + oy; }
      else { u.orderKind = kind; u.targetId = null; u.orderX = px + (i % 5 - 2) * 24; u.orderY = py + oy; }
    });
  }

  private unitById(id: number | null): BattleUnit | null {
    if (id == null) return null;
    const u = this.units.find((x) => x.id === id);
    return u && u.hp > 0 ? u : null;
  }

  private acquire(u: BattleUnit): BattleUnit | null {
    const T = UNITS[u.type];
    const reach = T.ranged ? T.range : 70;
    let best: BattleUnit | null = null, bd = reach;
    for (const e of this.units) {
      if (e.team !== u.team && e.hp > 0 && !e.routing) { const d = dist(u, e); if (d < bd) { bd = d; best = e; } }
    }
    return best;
  }

  private separate(u: BattleUnit, dt: number): void {
    let px = 0, py = 0;
    for (const o of this.units) {
      if (o === u || o.hp <= 0) continue;
      const dx = u.x - o.x, dy = u.y - o.y, d = Math.hypot(dx, dy);
      if (d > 0 && d < 22) { px += (dx / d) * (22 - d); py += (dy / d) * (22 - d); }
    }
    u.x += px * dt * 4; u.y += py * dt * 4;
  }

  private damage(target: BattleUnit, dmg: number): void {
    if (target.hp <= 0) return;
    const armor = UNITS[target.type].armor;
    target.hp = Math.max(0, target.hp - Math.max(3, dmg - armor * 0.6));
    this.events.push({ type: target.hp <= 0 ? "death" : "hit", x: target.x, y: target.y });
  }

  private blockedByWall(u: BattleUnit, nx: number, ny: number): boolean {
    if (this.gate.hp <= 0 && Math.abs(ny - this.gate.y) < this.gate.h / 2) return false;
    const crossing = (u.x - this.wallX) * (nx - this.wallX) <= 0 || Math.abs(nx - this.wallX) < 6;
    if (crossing) {
      if (Math.abs(ny - this.gate.y) < this.gate.h / 2) return this.gate.hp > 0;
      return this.gate.maxHp > 1; // muralha só existe se fortificado
    }
    return false;
  }

  private ai(dt: number): void {
    this.aiTimer -= dt;
    if (this.aiTimer > 0) return;
    this.aiTimer = 1.5;
    const blues = this.units.filter((u) => u.team === "blue" && u.hp > 0);
    if (!blues.length) return;
    for (const u of this.units) {
      if (u.team !== "red" || u.hp <= 0 || u.routing) continue;
      let best: BattleUnit | null = null, bd = Infinity;
      for (const b of blues) { const d = dist(u, b); if (d < bd) { bd = d; best = b; } }
      if (!best) continue;
      if (UNITS[u.type].ranged) { u.orderKind = "attack"; u.targetId = best.id; }
      else if (bd < 260 || this.gate.hp <= 0) { u.orderKind = "attack"; u.targetId = best.id; }
      else { u.orderKind = null; u.targetId = null; }
    }
  }

  step(dt: number): void {
    if (this.over) return;
    this.events.length = 0;
    this.ai(dt);
    for (const u of this.units) {
      if (u.hp <= 0) continue;
      const T = UNITS[u.type];
      u.cd = Math.max(0, u.cd - dt);

      if (u.routing) {
        const dir = u.team === "blue" ? -1 : 1;
        u.x += dir * T.speed * 1.3 * dt;
        this.separate(u, dt);
        if (u.x < -20 || u.x > this.width + 20) u.hp = 0;
        continue;
      }

      let tgt = this.unitById(u.targetId);
      if ((u.orderKind === "attack" || u.orderKind == null) && !tgt) {
        tgt = this.acquire(u);
        if (tgt) u.targetId = tgt.id;
      }

      let engage: BattleUnit | "gate" | null = null;
      let destX: number | null = null, destY: number | null = null;

      if (tgt) {
        const reach = T.range + UNITS[u.type].radius + UNITS[tgt.type].radius;
        if (dist(u, tgt) <= reach) engage = tgt;
        else { destX = tgt.x; destY = tgt.y; }
      } else if (u.orderX != null && u.orderY != null) {
        if (Math.hypot(u.x - u.orderX, u.y - u.orderY) > 6) { destX = u.orderX; destY = u.orderY; }
        else { u.orderX = u.orderY = null; }
      }

      if (u.orderKind === "gate" && this.gate.hp > 0 &&
          Math.abs(u.x - this.gate.x) < 34 && Math.abs(u.y - this.gate.y) < this.gate.h / 2) {
        if (u.cd <= 0 && u.team === "blue") {
          this.gate.hp -= T.dmg * (T.siege ?? 0.6);
          u.cd = T.cooldown;
          this.events.push({ type: "gate", x: this.gate.x, y: u.y });
        }
        engage = "gate"; destX = destY = null;
      }

      if (engage && engage !== "gate") {
        u.facing = Math.atan2(engage.y - u.y, engage.x - u.x);
        if (u.cd <= 0) {
          if (T.ranged) this.shoot(u, engage);
          else this.damage(engage, T.dmg * tacticalCounter(u.type, engage.type));
          u.cd = T.cooldown;
        }
        this.separate(u, dt);
      } else if (destX != null && destY != null) {
        const dx = destX - u.x, dy = destY - u.y, d = Math.hypot(dx, dy) || 1;
        u.facing = Math.atan2(dy, dx);
        const nx = u.x + (dx / d) * T.speed * dt;
        const ny = u.y + (dy / d) * T.speed * dt;
        if (!this.blockedByWall(u, nx, ny)) { u.x = nx; u.y = ny; }
        u.y = Math.max(20, Math.min(this.height - 20, u.y));
        this.separate(u, dt);
      } else {
        this.separate(u, dt);
      }
    }

    // projéteis
    for (const p of this.projectiles) {
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.t >= p.ttl) {
        const tgt = this.unitById(p.targetId);
        if (tgt && dist(p, tgt) < 18) this.damage(tgt, p.dmg);
        p.ttl = -1;
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.ttl >= 0);

    this.morale();

    const blue = this.units.filter((u) => u.team === "blue" && u.hp > 0 && !u.routing).length;
    const red = this.units.filter((u) => u.team === "red" && u.hp > 0 && !u.routing).length;
    if (red === 0) { this.over = true; this.winner = "blue"; }
    else if (blue === 0) { this.over = true; this.winner = "red"; }
  }

  private shoot(u: BattleUnit, t: BattleUnit): void {
    const d = dist(u, t) || 1, sp = 380;
    this.events.push({ type: "shot", x: u.x, y: u.y });
    this.projectiles.push({
      x: u.x, y: u.y, vx: ((t.x - u.x) / d) * sp, vy: ((t.y - u.y) / d) * sp,
      t: 0, ttl: d / sp + 0.02, targetId: t.id, ownerType: u.type, ownerTeam: u.team,
      dmg: UNITS[u.type].dmg * tacticalCounter(u.type, t.type),
    });
  }

  private morale(): void {
    for (const team of ["blue", "red"] as const) {
      const alive = this.units.filter((u) => u.team === team && u.hp > 0);
      const total = Math.max(1, this.units.filter((u) => u.team === team).length);
      const loss = 1 - alive.length / total;
      for (const u of alive) {
        if (u.routing) continue;
        if (u.hp / u.maxHp < 0.28 && loss > 0.55 && this.rng.next() < 0.02) u.routing = true;
      }
    }
  }

  survivors(team: "blue" | "red"): Troops {
    const t = emptyTroops();
    for (const u of this.units) if (u.team === team && u.hp > 0 && !u.routing) t[u.type]++;
    return t;
  }

  counts(): { blue: number; red: number; gatePct: number } {
    return {
      blue: this.units.filter((u) => u.team === "blue" && u.hp > 0).length,
      red: this.units.filter((u) => u.team === "red" && u.hp > 0).length,
      gatePct: Math.max(0, Math.round((this.gate.hp / this.gate.maxHp) * 100)),
    };
  }
}
