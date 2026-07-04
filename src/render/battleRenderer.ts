/**
 * BattleRenderer — desenha a simulação tática (Pixi) e trata input.
 * A REGRA está em BattleSim (domínio); aqui só render + seleção/ordens.
 * M5: sprites reais (.PL8). M5.1: AnimatedSprite (walk cycle). M6: partículas + som.
 */
import { AnimatedSprite, Container, Graphics, Sprite, Text, type FederatedPointerEvent } from "pixi.js";
import { BattleSim, type BattleConfig } from "@/domain";
import { UNITS } from "@/domain";
import { THEME } from "./theme";
import { preloadUnitSprites, unitTexture, unitFrames, type SpriteTeam } from "./sprites";
import type { Sound } from "./sound";

export type BattleEndCb = (win: boolean, attacker: ReturnType<BattleSim["survivors"]>, defender: ReturnType<BattleSim["survivors"]>) => void;

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: number; }

export class BattleRenderer {
  readonly view = new Container();
  private bg = new Graphics();
  private unitLayer = new Container();
  private tokens = new Graphics();
  private glyphs = new Container();
  private fg = new Graphics();
  private unitSprites = new Map<number, Sprite>();
  private particles: Particle[] = [];

  private sim!: BattleSim;
  private selected = new Set<number>();
  private drag: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private ended = false;
  private onEnd: BattleEndCb | null = null;
  paused = false;

  constructor(private sound?: Sound) {
    this.view.addChild(this.bg, this.unitLayer, this.tokens, this.glyphs, this.fg);
    this.view.eventMode = "static";
    this.view.hitArea = { contains: () => true } as { contains: (x: number, y: number) => boolean };
    this.view.on("pointerdown", (e: FederatedPointerEvent) => {
      if (this.ended) return;
      const p = this.view.toLocal(e.global);
      if (e.button === 2) { this.order(p.x, p.y, e.shiftKey ? "attack" : "move"); return; }
      this.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    });
    this.view.on("pointermove", (e: FederatedPointerEvent) => {
      if (!this.drag) return;
      const p = this.view.toLocal(e.global); this.drag.x1 = p.x; this.drag.y1 = p.y;
    });
    this.view.on("pointerup", (e: FederatedPointerEvent) => this.endDrag(e.shiftKey));
    this.view.on("pointerupoutside", () => this.endDrag(false));
    void preloadUnitSprites();
  }

  start(config: BattleConfig, onEnd: BattleEndCb | null): void {
    this.sim = new BattleSim(config);
    this.selected.clear();
    this.clearSprites();
    this.particles.length = 0;
    this.ended = false;
    this.onEnd = onEnd;
    this.paused = false;
  }

  private clearSprites(): void {
    for (const sp of this.unitSprites.values()) sp.destroy();
    this.unitSprites.clear();
    this.unitLayer.removeChildren();
  }

  counts() { return this.sim.counts(); }
  get isOver() { return this.ended; }

  private endDrag(additive: boolean): void {
    if (!this.drag) return;
    const { x0, y0, x1, y1 } = this.drag;
    const bx0 = Math.min(x0, x1), bx1 = Math.max(x0, x1), by0 = Math.min(y0, y1), by1 = Math.max(y0, y1);
    const isBox = bx1 - bx0 > 6 || by1 - by0 > 6;
    if (!additive) this.selected.clear();
    if (isBox) {
      for (const u of this.sim.units)
        if (u.team === "blue" && u.hp > 0 && u.x >= bx0 && u.x <= bx1 && u.y >= by0 && u.y <= by1) this.selected.add(u.id);
    } else {
      let best: number | null = null, bd = 26;
      for (const u of this.sim.units)
        if (u.team === "blue" && u.hp > 0) { const d = Math.hypot(u.x - x1, u.y - y1); if (d < bd) { bd = d; best = u.id; } }
      if (best != null) this.selected.add(best);
    }
    this.drag = null;
  }

  private order(x: number, y: number, kind: "move" | "attack"): void {
    this.sim.orderUnits([...this.selected], x, y, kind);
  }

  tick(dtMs: number): void {
    if (!this.sim) return;
    const dt = Math.min(0.05, dtMs / 1000);
    if (!this.paused && !this.ended) {
      this.sim.step(dt);
      this.consumeEvents();
      if (this.sim.over) {
        this.ended = true;
        const win = this.sim.winner === "blue";
        if (win) this.sound?.play("victory", 0.5);
        if (this.onEnd) this.onEnd(win, this.sim.survivors("blue"), this.sim.survivors("red"));
      }
    }
    this.updateParticles(dt);
    this.draw();
  }

  // --- feedback (M6): consome eventos da simulação -> som + partículas ---
  private consumeEvents(): void {
    for (const e of this.sim.events) {
      switch (e.type) {
        case "hit": this.spawn(e.x, e.y, 0xe8dcc0, 2); this.sound?.play("attack", 0.3); break;
        case "death": this.spawn(e.x, e.y, 0xc0392b, 7); break;
        case "shot": this.sound?.play("arrow", 0.25); break;
        case "gate": this.spawn(e.x, e.y, THEME.gold, 3); this.sound?.play("gate", 0.4); break;
      }
    }
  }
  private spawn(x: number, y: number, color: number, n: number): void {
    for (let i = 0; i < n; i++)
      this.particles.push({ x, y, vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 80, life: 0, max: 0.35, color });
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
  }
  private updateParticles(dt: number): void {
    for (const p of this.particles) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    this.particles = this.particles.filter((p) => p.life < p.max);
  }

  private draw(): void {
    const sim = this.sim;
    this.bg.clear(); this.tokens.clear(); this.fg.clear(); this.glyphs.removeChildren();

    this.bg.rect(0, 0, sim.width, sim.height).fill(0x233016);

    const gate = sim.gate;
    if (gate.maxHp > 1) {
      this.bg.rect(sim.width - 158, 0, 16, sim.height).fill(0x6b6b73);
      if (gate.hp > 0) {
        this.bg.rect(gate.x - gate.w / 2, gate.y - gate.h / 2, gate.w, gate.h).fill(0x5a3d22);
        const f = gate.hp / gate.maxHp;
        this.fg.rect(gate.x - 30, gate.y - gate.h / 2 - 14, 60, 7).fill(0x000000);
        this.fg.rect(gate.x - 29, gate.y - gate.h / 2 - 13, 58 * f, 5).fill(f > 0.4 ? THEME.gold : THEME.red);
      }
    }

    const alive = new Set<number>();
    for (const u of sim.units) {
      if (u.hp <= 0) continue;
      alive.add(u.id);
      const T = UNITS[u.type];
      const team: SpriteTeam = u.team === "blue" ? "blue" : "red";
      const sp = this.ensureSprite(u.id, team, u.type);

      if (sp) {
        const target = T.radius * 2.8;
        const s = target / (sp.texture.height || target);
        sp.scale.set(s, s);
        sp.scale.x = Math.abs(s) * (Math.cos(u.facing) < 0 ? -1 : 1);
        sp.x = u.x; sp.y = u.y;
        sp.tint = u.routing ? 0x8a7a5a : 0xffffff;
        sp.visible = true;
      } else {
        const col = u.team === "blue" ? THEME.blue : THEME.red;
        const dark = u.team === "blue" ? THEME.blueDark : THEME.redDark;
        this.tokens.circle(u.x, u.y, T.radius).fill(u.routing ? 0x7a6a4a : col).stroke({ width: 2, color: dark });
        const t = new Text({ text: T.glyph, style: { fill: 0xffffff, fontFamily: "Georgia", fontSize: 12, fontWeight: "bold" } });
        t.anchor.set(0.5); t.x = u.x; t.y = u.y; this.glyphs.addChild(t);
      }

      if (this.selected.has(u.id)) this.fg.circle(u.x, u.y, T.radius + 4).stroke({ width: 2, color: THEME.gold });
      const f = u.hp / u.maxHp;
      this.fg.rect(u.x - 12, u.y - T.radius - 12, 24, 4).fill(0x000000);
      this.fg.rect(u.x - 11, u.y - T.radius - 11, 22 * f, 2).fill(f > 0.5 ? 0x8bc34a : f > 0.25 ? 0xe0a63c : 0xd9534f);
    }
    for (const [id, sp] of this.unitSprites) if (!alive.has(id)) { sp.destroy(); this.unitSprites.delete(id); }

    // partículas
    for (const p of this.particles) {
      const a = 1 - p.life / p.max;
      this.fg.rect(p.x - 1.5, p.y - 1.5, 3, 3).fill({ color: p.color, alpha: a });
    }

    // projéteis
    for (const p of sim.projectiles) this.fg.moveTo(p.x, p.y).lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
    this.fg.stroke({ width: 2, color: 0xe8dcc0 });

    if (this.drag) {
      const d = this.drag;
      this.fg.rect(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0)).stroke({ width: 1, color: THEME.gold });
    }
  }

  private ensureSprite(id: number, team: SpriteTeam, type: keyof typeof UNITS): Sprite | null {
    let sp = this.unitSprites.get(id);
    if (sp) return sp;
    const frames = unitFrames(team, type);
    if (frames) {
      const anim = new AnimatedSprite(frames);
      anim.animationSpeed = 0.12;
      anim.play();
      sp = anim;
    } else {
      const tex = unitTexture(team, type);
      if (!tex) return null;
      sp = new Sprite(tex);
    }
    sp.anchor.set(0.5, 0.6);
    this.unitLayer.addChild(sp);
    this.unitSprites.set(id, sp);
    return sp;
  }
}
