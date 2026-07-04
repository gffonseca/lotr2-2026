/**
 * MapRenderer — reino ilustrado (Pixi): fundo texturizado, moldura de madeira,
 * estradas inked e condados como medalhões heráldicos por facção.
 * Regras ficam no store; aqui só render + input.
 */
import { Container, Graphics, Text } from "pixi.js";
import type { GameStore } from "@/state/store";
import { troopCount } from "@/domain";
import { FACTION_COLOR, FACTION_DARK, THEME } from "./theme";
import { preloadTextures, tex } from "./textures";

export class MapRenderer {
  readonly view = new Container();
  private gfx = new Graphics();
  private labels = new Container();
  readonly width = 880;
  readonly height = 600;

  constructor(
    private store: GameStore,
    private onNeedBattleChoice: (srcId: number, dstId: number) => void,
    private onHover?: (countyId: number | null, globalX: number, globalY: number) => void,
  ) {
    this.view.addChild(this.gfx);
    this.view.addChild(this.labels);
    this.view.eventMode = "static";
    this.view.hitArea = { contains: () => true } as { contains: (x: number, y: number) => boolean };
    this.view.on("pointertap", (e) => {
      const p = this.view.toLocal(e.global);
      const c = this.store.kingdom.counties.find((co) => Math.hypot(co.x - p.x, co.y - p.y) < 30);
      if (!c) return;
      const prevSel = this.store.selectedCounty;
      const result = this.store.clickCounty(c.id);
      if (result === "battle" && prevSel != null) this.onNeedBattleChoice(prevSel, c.id);
      this.redraw();
    });
    this.view.on("pointermove", (e) => {
      if (!this.onHover) return;
      const p = this.view.toLocal(e.global);
      const c = this.store.kingdom.counties.find((co) => Math.hypot(co.x - p.x, co.y - p.y) < 28);
      this.onHover(c ? c.id : null, e.global.x, e.global.y);
    });
    this.view.on("pointerleave", () => this.onHover?.(null, 0, 0));
    void preloadTextures().then(() => this.redraw());
  }

  redraw(): void {
    const s = this.store;
    const g = this.gfx;
    const W = this.width, H = this.height;
    g.clear();
    this.labels.removeChildren();

    // --- fundo texturizado (campo) ---
    const field = tex("mapfield");
    if (field) g.rect(0, 0, W, H).fill({ texture: field }); else g.rect(0, 0, W, H).fill(0x3a4a24);
    g.rect(0, 0, W, H).fill({ color: 0x24371a, alpha: 0.25 });

    // --- moldura decorativa (madeira + fio de ouro) ---
    const wood = tex("wood");
    g.rect(0, 0, W, 14).fill(wood ? { texture: wood } : { color: 0x2a1a0c });
    g.rect(0, H - 14, W, 14).fill(wood ? { texture: wood } : { color: 0x2a1a0c });
    g.rect(0, 0, 14, H).fill(wood ? { texture: wood } : { color: 0x2a1a0c });
    g.rect(W - 14, 0, 14, H).fill(wood ? { texture: wood } : { color: 0x2a1a0c });
    g.rect(15, 15, W - 30, H - 30).stroke({ width: 2, color: THEME.gold, alpha: 0.75 });

    // --- estradas (inked: escura embaixo, clara em cima) ---
    for (const [u, v] of s.kingdom.edges) {
      const a = s.kingdom.counties[u], b = s.kingdom.counties[v];
      g.moveTo(a.x, a.y).lineTo(b.x, b.y);
    }
    g.stroke({ width: 6, color: 0x2c2313, alpha: 0.6 });
    for (const [u, v] of s.kingdom.edges) {
      const a = s.kingdom.counties[u], b = s.kingdom.counties[v];
      g.moveTo(a.x, a.y).lineTo(b.x, b.y);
    }
    g.stroke({ width: 2.5, color: 0xb59b6a, alpha: 0.7 });

    // --- vizinhos alcançáveis destacados ---
    if (s.selectedCounty != null) {
      for (const n of s.neighbors(s.selectedCounty)) {
        const c = s.kingdom.counties[n];
        g.circle(c.x, c.y, 34).stroke({ width: 2, color: c.owner === "blue" ? THEME.green : THEME.gold, alpha: 0.9 });
      }
    }

    // --- condados: medalhões heráldicos ---
    for (const c of s.kingdom.counties) {
      const seld = s.selectedCounty === c.id;
      const col = FACTION_COLOR[c.owner], dark = FACTION_DARK[c.owner];
      // sombra
      g.circle(c.x + 2, c.y + 3, 27).fill({ color: 0x000000, alpha: 0.35 });
      // aro dourado
      g.circle(c.x, c.y, 27).fill(0x2a1c0e).stroke({ width: seld ? 4 : 3, color: seld ? 0xf0d18a : THEME.gold });
      // brasão (facção) com leve degradê simulado
      g.circle(c.x, c.y, 22).fill(col).stroke({ width: 2, color: dark });
      g.circle(c.x - 5, c.y - 6, 12).fill({ color: 0xffffff, alpha: 0.12 });
      // emblema + tropas
      this.label(c.owner === "neutral" ? "⌂" : "♜", c.x, c.y - 4, 17, 0x120c06, true);
      // faixa de tropas
      g.roundRect(c.x - 16, c.y + 11, 32, 15, 4).fill(0x1c130a).stroke({ width: 1, color: THEME.gold });
      this.label(`⚔ ${troopCount(c.troops)}`, c.x, c.y + 18, 11, 0xf0e2c0, true);
      // nome em cartucho
      const nameW = Math.max(52, c.name.length * 7);
      g.roundRect(c.x - nameW / 2, c.y + 33, nameW, 16, 4).fill({ color: 0x1c130a, alpha: 0.82 });
      this.label(c.name, c.x, c.y + 41, 12, 0xe9d8b0);
      if (c.moved && c.owner === "blue") this.label("✓", c.x + 20, c.y - 20, 13, THEME.gold, true);
    }
  }

  private label(text: string, x: number, y: number, size: number, color: number, bold = false): void {
    const t = new Text({ text, style: { fill: color, fontFamily: "Georgia, serif", fontSize: size, fontWeight: bold ? "bold" : "normal" } });
    t.anchor.set(0.5);
    t.x = x; t.y = y;
    this.labels.addChild(t);
  }
}
