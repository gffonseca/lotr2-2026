/**
 * MapRenderer — desenha o reino (Pixi) a partir do store e traduz cliques
 * em ações do store. Não contém regras: só render + input.
 */
import { Container, Graphics, Text } from "pixi.js";
import type { GameStore } from "@/state/store";
import { troopCount } from "@/domain";
import { FACTION_COLOR, FACTION_DARK, THEME } from "./theme";

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
      const c = this.store.kingdom.counties.find((co) => Math.hypot(co.x - p.x, co.y - p.y) < 32);
      if (!c) return;
      const prevSel = this.store.selectedCounty;
      const result = this.store.clickCounty(c.id);
      if (result === "battle" && prevSel != null) this.onNeedBattleChoice(prevSel, c.id);
      this.redraw();
    });
    this.view.on("pointermove", (e) => {
      if (!this.onHover) return;
      const p = this.view.toLocal(e.global);
      const c = this.store.kingdom.counties.find((co) => Math.hypot(co.x - p.x, co.y - p.y) < 30);
      this.onHover(c ? c.id : null, e.global.x, e.global.y);
    });
    this.view.on("pointerleave", () => this.onHover?.(null, 0, 0));
  }

  redraw(): void {
    const s = this.store;
    const g = this.gfx;
    g.clear();
    this.labels.removeChildren();

    g.rect(0, 0, this.width, this.height).fill(0x1c2a12);

    // estradas
    for (const [u, v] of s.kingdom.edges) {
      const a = s.kingdom.counties[u], b = s.kingdom.counties[v];
      g.moveTo(a.x, a.y).lineTo(b.x, b.y);
    }
    g.stroke({ width: 3, color: 0x6b5a3a, alpha: 0.8 });

    // destaque de vizinhos do selecionado
    if (s.selectedCounty != null) {
      for (const n of s.neighbors(s.selectedCounty)) {
        const c = s.kingdom.counties[n];
        g.circle(c.x, c.y, 34).stroke({ width: 2, color: c.owner === "blue" ? THEME.green : THEME.gold });
      }
    }

    // condados
    for (const c of s.kingdom.counties) {
      const seld = s.selectedCounty === c.id;
      g.circle(c.x, c.y, 28).fill(FACTION_COLOR[c.owner]).stroke({ width: seld ? 4 : 2, color: seld ? THEME.gold : FACTION_DARK[c.owner] });
      this.label(c.name, c.x, c.y + 42, 12, THEME.ink);
      this.label(`⚔ ${troopCount(c.troops)}`, c.x, c.y + 12, 12, 0xffffff, true);
      this.label(c.owner === "neutral" ? "⌂" : "🏰", c.x, c.y - 4, 15, 0x0d0b07);
      if (c.moved && c.owner === "blue") this.label("(moveu)", c.x, c.y - 38, 10, THEME.gold);
    }
  }

  private label(text: string, x: number, y: number, size: number, color: number, bold = false): void {
    const t = new Text({ text, style: { fill: color, fontFamily: "Georgia, serif", fontSize: size, fontWeight: bold ? "bold" : "normal" } });
    t.anchor.set(0.5);
    t.x = x; t.y = y;
    this.labels.addChild(t);
  }
}
