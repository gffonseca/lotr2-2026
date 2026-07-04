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
export interface SimEvent { type: "hit" | "shot" | "gate" | "death" | "lob" | "breach" | "oil"; x: number; y: number; }

/** Máquinas de cerco do atacante (Fase 2/3). */
export type SiegeKind = "catapult" | "ram" | "sapper" | "tower";
export interface SiegeEngine {
  id: number; kind: SiegeKind; x: number; y: number; hp: number; maxHp: number;
  cd: number; progress: number; done: boolean;
}
/** Projétil em arco (catapulta) — dano em área ao cair. */
export interface Lob { sx: number; sy: number; x: number; y: number; tx: number; ty: number; t: number; ttl: number; }
/** Brecha na muralha (aberta por sapador). */
export interface Breach { y: number; halfH: number; }

export interface SiegeLoadout { catapults?: number; rams?: number; sappers?: number; towers?: number; }

export interface BattleConfig {
  attacker: Troops;
  defender: Troops;
  fortified: boolean;
  width: number;
  height: number;
  seed: number;
  siege?: SiegeLoadout;   // máquinas de cerco do atacante (Fase 2)
  boilingOil?: boolean;   // defensor tem óleo fervente (Fase 2)
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Coeficientes das máquinas de cerco e do óleo (Fase 2). */
export const SIEGE = {
  // balanceamento afinado: portão dura mais, catapulta menos brutal, aríete decisivo mas não instantâneo
  catapult: { hp: 120, cd: 3.6, speed: 34, range: 420, splash: 48, dmgGate: 48, dmgUnit: 28 },
  ram: { hp: 280, cd: 1.0, speed: 66, dmgGate: 46 },
  sapper: { hp: 90, speed: 58, sapTime: 8, breachHalfH: 60 },
  tower: { hp: 240, speed: 40, breachHalfH: 72 }, // cruza a muralha e abre passagem ampla no topo
  oil: { cd: 5.5, radius: 74, dmg: 42, charges: 3 },
  gateHp: 720, // portão mais resistente (era 600)
} as const;

export class BattleSim {
  readonly width: number;
  readonly height: number;
  units: BattleUnit[] = [];
  projectiles: Projectile[] = [];
  events: SimEvent[] = [];
  sieges: SiegeEngine[] = [];
  lobs: Lob[] = [];
  breaches: Breach[] = [];
  oilCharges = 0;
  gate: Gate;
  over = false;
  winner: "blue" | "red" | null = null;

  private rng: Rng;
  private uid = 0;
  private sid = 0;
  private aiTimer = 0;
  private oilCd = 0;
  private hasOil = false;
  private wallX: number;

  constructor(cfg: BattleConfig) {
    this.width = cfg.width;
    this.height = cfg.height;
    this.rng = new Rng(cfg.seed);
    this.wallX = cfg.width - 150;
    this.gate = {
      x: this.wallX, y: cfg.height / 2, w: 26, h: 120,
      hp: cfg.fortified ? SIEGE.gateHp : 0, maxHp: cfg.fortified ? SIEGE.gateHp : 1,
    };
    this.deploy(cfg.attacker, "blue", 90);
    this.deploy(cfg.defender, "red", cfg.fortified ? this.wallX - 90 : this.wallX - 40);
    this.hasOil = !!cfg.boilingOil && cfg.fortified;
    this.oilCharges = this.hasOil ? SIEGE.oil.charges : 0;
    if (cfg.fortified) this.deploySiege(cfg.siege);
  }

  private deploySiege(loadout?: SiegeLoadout): void {
    if (!loadout) return;
    const place = (kind: SiegeKind, n: number, x0: number) => {
      let y = 90;
      for (let i = 0; i < n; i++) {
        const hp = SIEGE[kind].hp;
        this.sieges.push({ id: this.sid++, kind, x: x0 + this.rng.range(-10, 10), y, hp, maxHp: hp, cd: 0, progress: 0, done: false });
        y += 95; if (y > this.height - 60) y = 150;
      }
    };
    // catapulta já entra dentro do alcance; aríete/sapador/torre partem da retaguarda
    place("catapult", loadout.catapults ?? 0, this.wallX - SIEGE.catapult.range + 40);
    place("ram", loadout.rams ?? 0, 150);
    place("sapper", loadout.sappers ?? 0, 150);
    place("tower", loadout.towers ?? 0, 130);
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

  formation: "grid" | "line" | "column" | "wedge" = "line";
  setFormation(f: "grid" | "line" | "column" | "wedge"): void { this.formation = f; }

  private formationOffset(i: number, n: number): { ox: number; oy: number } {
    const c = (n - 1) / 2, S = 22;
    switch (this.formation) {
      case "line":   return { ox: (i - c) * S, oy: 0 };
      case "column": return { ox: 0, oy: (i - c) * S };
      case "wedge":  return { ox: (i - c) * S, oy: Math.abs(i - c) * (S * 0.8) };
      default: {      // grid 5 de largura
        const cols = 5;
        return { ox: ((i % cols) - (cols - 1) / 2) * 24, oy: (Math.floor(i / cols) - 1) * 24 };
      }
    }
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
      const off = this.formationOffset(i, ids.length);
      if (enemy) { u.orderKind = "attack"; u.targetId = enemy.id; u.orderX = u.orderY = null; }
      else if (nearGate) { u.orderKind = "gate"; u.targetId = null; u.orderX = this.gate.x - 30; u.orderY = this.gate.y + off.oy; }
      else { u.orderKind = kind; u.targetId = null; u.orderX = px + off.ox; u.orderY = py + off.oy; }
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

  /** A muralha é atravessável nesta altura? (portão aberto ou brecha) */
  private passableAt(ny: number): boolean {
    if (this.gate.hp <= 0 && Math.abs(ny - this.gate.y) < this.gate.h / 2) return true;
    for (const b of this.breaches) if (Math.abs(ny - b.y) < b.halfH) return true;
    return false;
  }

  /** Y do vão mais próximo (portão aberto ou brecha); mira no portão se nada aberto. */
  private nearestGapY(y: number): number {
    const gaps: number[] = [];
    if (this.gate.hp <= 0) gaps.push(this.gate.y);
    for (const b of this.breaches) gaps.push(b.y);
    if (gaps.length === 0) return this.gate.y; // nada aberto: aguarda no portão
    let best = gaps[0], bd = Infinity;
    for (const gy of gaps) { const d = Math.abs(gy - y); if (d < bd) { bd = d; best = gy; } }
    return best;
  }

  private blockedByWall(u: BattleUnit, nx: number, ny: number): boolean {
    if (this.gate.maxHp <= 1) return false; // sem muralha (não fortificado)
    const crossing = (u.x - this.wallX) * (nx - this.wallX) <= 0 || Math.abs(nx - this.wallX) < 6;
    if (!crossing) return false;
    return !this.passableAt(ny);
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
        // pathfinding simples: rota até o vão do portão/brecha se a muralha bloqueia
        let tX = destX, tY = destY;
        if (this.gate.maxHp > 1 && u.team === "blue" && (u.x - this.wallX) * (destX - this.wallX) <= 0 && u.x < this.wallX) {
          if (!this.passableAt(u.y)) {
            const gapY = this.nearestGapY(u.y);
            tX = this.wallX - 24; tY = gapY;
            if (Math.abs(u.y - gapY) < 12 && this.passableAt(gapY)) { tX = this.wallX + 24; tY = gapY; } // alinhado -> atravessa
          }
        }
        const dx = tX - u.x, dy = tY - u.y, d = Math.hypot(dx, dy) || 1;
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

    // --- Fase 2: cerco, catapultas em arco, óleo ---
    this.updateSieges(dt);
    this.updateLobs(dt);
    this.updateOil(dt);

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

  // ===================== Fase 2: máquinas de cerco =====================
  private moveEngine(o: { x: number; y: number }, tx: number, ty: number, speed: number, dt: number): boolean {
    const dx = tx - o.x, dy = ty - o.y, d = Math.hypot(dx, dy);
    if (d < 4) return true;
    o.x += (dx / d) * speed * dt; o.y += (dy / d) * speed * dt;
    return false;
  }

  private updateSieges(dt: number): void {
    for (const s of this.sieges) {
      if (s.hp <= 0) continue;
      if (s.kind === "catapult") {
        if (Math.abs(s.x - this.wallX) > SIEGE.catapult.range) {
          this.moveEngine(s, this.wallX - SIEGE.catapult.range + 30, s.y, SIEGE.catapult.speed, dt);
        } else {
          s.cd -= dt;
          if (s.cd <= 0 && this.gate.hp > 0) { this.lobAt(this.gate.x - 8, this.gate.y); s.cd = SIEGE.catapult.cd; }
        }
      } else if (s.kind === "ram") {
        const tx = this.wallX - 30, ty = this.gate.y;
        if (!this.moveEngine(s, tx, ty, SIEGE.ram.speed, dt)) continue;
        s.cd -= dt;
        if (s.cd <= 0 && this.gate.hp > 0) {
          this.gate.hp -= SIEGE.ram.dmgGate;
          this.events.push({ type: "gate", x: this.gate.x, y: ty });
          s.cd = SIEGE.ram.cd;
        }
      } else if (s.kind === "sapper") {
        if (s.done) continue;
        const targetY = Math.max(70, this.gate.y - 170);
        if (!this.moveEngine(s, this.wallX - 18, targetY, SIEGE.sapper.speed, dt)) continue;
        s.progress += dt;
        if (s.progress >= SIEGE.sapper.sapTime) {
          this.breaches.push({ y: targetY, halfH: SIEGE.sapper.breachHalfH / 2 });
          s.done = true;
          this.events.push({ type: "breach", x: this.wallX, y: targetY });
        }
      } else { // tower — cruza a muralha e abre passagem ampla ao encostar (sem escavar)
        if (s.done) continue;
        const targetY = Math.min(this.height - 90, this.gate.y + 170);
        if (!this.moveEngine(s, this.wallX - 16, targetY, SIEGE.tower.speed, dt)) continue;
        this.breaches.push({ y: targetY, halfH: SIEGE.tower.breachHalfH / 2 });
        s.done = true;
        this.events.push({ type: "breach", x: this.wallX, y: targetY });
      }
    }
  }

  private lobAt(tx: number, ty: number): void {
    const cat = this.sieges.find((s) => s.kind === "catapult" && s.hp > 0);
    const sx = cat ? cat.x : 60, sy = cat ? cat.y : this.height / 2;
    this.lobs.push({ sx, sy, x: sx, y: sy, tx, ty, t: 0, ttl: 1.4 });
    this.events.push({ type: "lob", x: sx, y: sy });
  }

  private updateLobs(dt: number): void {
    for (const l of this.lobs) {
      l.t += dt;
      const p = Math.min(1, l.t / l.ttl);
      l.x = l.sx + (l.tx - l.sx) * p;
      l.y = l.sy + (l.ty - l.sy) * p - Math.sin(Math.PI * p) * 90; // trajetória em arco
      if (l.t >= l.ttl) {
        if (this.gate.hp > 0 && Math.abs(l.tx - this.gate.x) < 44 && Math.abs(l.ty - this.gate.y) < this.gate.h / 2 + 20) {
          this.gate.hp -= SIEGE.catapult.dmgGate;
          this.events.push({ type: "gate", x: this.gate.x, y: l.ty });
        }
        for (const u of this.units) if (u.hp > 0 && dist(u, { x: l.tx, y: l.ty }) < SIEGE.catapult.splash) this.damage(u, SIEGE.catapult.dmgUnit);
        this.events.push({ type: "hit", x: l.tx, y: l.ty });
      }
    }
    this.lobs = this.lobs.filter((l) => l.t < l.ttl);
  }

  private updateOil(dt: number): void {
    if (!this.hasOil || this.oilCharges <= 0) return;
    this.oilCd -= dt;
    if (this.oilCd > 0) return;
    const near = this.units.filter((u) => u.team === "blue" && u.hp > 0 &&
      Math.abs(u.x - this.gate.x) < SIEGE.oil.radius && Math.abs(u.y - this.gate.y) < this.gate.h / 2 + 40);
    if (near.length >= 2) {
      for (const u of near) this.damage(u, SIEGE.oil.dmg);
      this.events.push({ type: "oil", x: this.gate.x, y: this.gate.y });
      this.oilCharges--;
      this.oilCd = SIEGE.oil.cd;
    }
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
