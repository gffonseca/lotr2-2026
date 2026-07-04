/**
 * App — orquestra store (estado) + Pixi (render) + HUD (DOM).
 * Regras ficam no domínio; aqui só coordenação e interface.
 */
import type { Application } from "pixi.js";
import { GameStore } from "@/state/store";
import { MapRenderer } from "@/render/mapRenderer";
import { BattleRenderer } from "@/render/battleRenderer";
import { Sound } from "@/render/sound";
import { STAGE_W } from "@/render/pixiApp";
import {
  UNITS, UNIT_TYPES, troopCount,
  SEASON_NAMES, foodReserve, laborUsed,
  type Screen, type UnitType, type BattleConfig,
} from "@/domain";

const BATTLE_W = 1100, BATTLE_H = 560;
const LABOR: Array<[keyof GameStore["economy"]["labor"], string, string]> = [
  ["farm", "Fazenda", "🌾"], ["cattle", "Gado", "🐄"], ["sheep", "Ovelhas", "🐑"],
  ["wood", "Madeira", "🪵"], ["stone", "Pedra", "⛏️"], ["iron", "Ferro", "⚙️"], ["smith", "Ferraria", "⚔️"],
];

export class App {
  private store = new GameStore();
  private sound = new Sound();
  private map: MapRenderer;
  private battle: BattleRenderer;
  private hud: HTMLElement;

  constructor(private pixi: Application, hud: HTMLElement) {
    this.hud = hud;
    this.sound.preload();
    this.battle = new BattleRenderer(this.sound);
    this.map = new MapRenderer(
      this.store,
      (src, dst) => this.battleChoice(src, dst),
      (id, gx, gy) => this.hover(id, gx, gy),
    );
    this.map.view.x = (STAGE_W - this.map.width) / 2;
    this.map.view.y = 40;
    this.battle.view.x = (STAGE_W - BATTLE_W) / 2;
    this.battle.view.y = 60;

    this.buildHud();
    this.store.subscribe(() => this.refresh());
    this.pixi.ticker.add((t) => this.onFrame(t.deltaMS));
    this.store.loadCampaign(); // retoma save existente, se houver
    this.show("menu");
  }

  // ---------------- navegação ----------------
  private show(screen: Screen): void {
    this.store.screen = screen;
    this.pixi.stage.removeChildren();
    if (screen === "campaign") { this.pixi.stage.addChild(this.map.view); this.map.redraw(); }
    else if (screen === "battle") { this.pixi.stage.addChild(this.battle.view); this.startBattle(); }
    (this.pixi.canvas as HTMLCanvasElement).style.display = screen === "campaign" || screen === "battle" ? "block" : "none";
    this.refresh();
  }

  private startBattle(): void {
    const pb = this.store.pendingBattle;
    const cfg: BattleConfig = pb
      ? { attacker: { ...pb.attacker }, defender: { ...pb.defender }, fortified: pb.fortified, width: BATTLE_W, height: BATTLE_H, seed: (Date.now() >>> 0) }
      : { attacker: { sword: 5, pike: 5, archer: 5, knight: 3, mace: 3 }, defender: { sword: 4, pike: 5, archer: 6, knight: 2, mace: 2 }, fortified: true, width: BATTLE_W, height: BATTLE_H, seed: (Date.now() >>> 0) };
    this.battle.start(cfg, pb
      ? (win, att, def) => this.store.finishBattle(win, att, def)
      : (win) => this.banner(win ? "⚔ Vitória!" : "☠ Derrota", win, () => this.show("battle")));
  }

  private onFrame(dtMs: number): void {
    if (this.store.screen === "battle") {
      this.battle.tick(dtMs);
      const c = this.battle.counts();
      this.setText("bat-blue", String(c.blue));
      this.setText("bat-red", String(c.red));
      this.setText("bat-gate", c.gatePct + "%");
    }
  }

  private battleChoice(srcId: number, dstId: number): void {
    const dst = this.store.county(dstId);
    this.modal(`Atacar ${dst.name}?`, [
      ["Auto-resolver", () => { this.store.autoAttack(srcId, dstId); this.closeModal(); }],
      ["Batalha tática ⚔", () => { this.closeModal(); this.store.beginTacticalBattle(srcId, dstId); this.show("battle"); }],
    ]);
  }

  // ---------------- HUD (DOM) ----------------
  private buildHud(): void {
    this.hud.innerHTML = `
      <style>
        .bar{pointer-events:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:linear-gradient(#2c2416,#231d14);border:1px solid #3d3320;border-radius:10px;padding:8px 12px;margin:8px}
        .bar h1{font:16px Georgia;margin:0;color:#d9b25a}
        .tab,.btn{font-family:Georgia;cursor:pointer;border-radius:8px;border:1px solid #3d3320;background:linear-gradient(#3a2f1c,#241d12);color:#efe4cf;padding:6px 11px;font-size:13px}
        .tab.active,.btn.primary{background:linear-gradient(#6f5a22,#4a3a14);border-color:#d9b25a;font-weight:700}
        .stat{background:#1c1710;border:1px solid #3d3320;border-radius:8px;padding:3px 9px;text-align:center;min-width:66px}
        .stat .k{font-size:10px;color:#b9a888;text-transform:uppercase} .stat .v{font-size:15px;font-weight:700}
        .grow{flex:1}
        .overlay{pointer-events:auto;position:fixed;inset:56px 8px 8px;overflow:auto}
        .panel{background:#231d14;border:1px solid #3d3320;border-radius:10px;padding:12px;color:#efe4cf;max-width:820px;margin:0 auto}
        .side{position:fixed;top:56px;right:8px;width:300px;pointer-events:auto}
        .card{background:#231d14;border:1px solid #3d3320;border-radius:10px;padding:10px;color:#efe4cf;margin-bottom:8px;font:13px Georgia}
        .row{display:grid;grid-template-columns:80px 1fr 34px;gap:6px;align-items:center;margin:4px 0}
        input[type=range]{width:100%;accent-color:#d9b25a}
        .log{max-height:150px;overflow:auto;font-size:12px}
        .win{color:#7fae54}.lose{color:#c8553a}.info{color:#b9a888}
        .menu{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;max-width:900px;margin:30px auto}
        .mcard{background:linear-gradient(#241d12,#1a150d);border:1px solid #3d3320;border-radius:12px;padding:22px;cursor:pointer;color:#efe4cf}
        .mcard:hover{border-color:#d9b25a}.mcard h2{color:#d9b25a;font:20px Georgia;margin:8px 0 6px}.mcard .ico{font-size:38px}
        .modal{pointer-events:auto;position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:#000a;z-index:30}
        .modal .box{background:#2c2416;border:1px solid #d9b25a;border-radius:12px;padding:22px;text-align:center;color:#efe4cf}
        table{width:100%;border-collapse:collapse}td{padding:2px 4px;border-bottom:1px solid #ffffff10}.n{text-align:right;font-weight:700}
        #tooltip{pointer-events:none;position:fixed;z-index:40;background:#231d14f0;border:1px solid #d9b25a;border-radius:8px;padding:6px 9px;color:#efe4cf;font:12px Georgia;max-width:220px;line-height:1.4}
        #toasts{pointer-events:none;position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:40;display:flex;flex-direction:column;gap:6px;align-items:center}
        .toast{background:#2c2416;border:1px solid #d9b25a;border-radius:8px;padding:8px 14px;color:#efe4cf;font:13px Georgia;animation:tfade 2.4s forwards}
        @keyframes tfade{0%{opacity:0;transform:translateY(8px)}10%{opacity:1;transform:none}80%{opacity:1}100%{opacity:0}}
        @media(max-width:860px){.side{position:static;width:auto;margin:8px}.overlay{inset:56px 4px 4px}.bar h1{font-size:13px}}
      </style>
      <div class="bar" id="nav">
        <h1>⚔️ LORDS OF THE REALM II · 2026</h1><div class="grow"></div>
        <button class="tab" data-s="menu">Menu</button>
        <button class="tab" data-s="county">🌾 Condado</button>
        <button class="tab" data-s="battle">⚔️ Escaramuça</button>
        <button class="tab" data-s="campaign">🗺️ Campanha</button>
        <button class="btn" id="btn-mute" title="Ligar/desligar som">🔊</button>
      </div>

      <div class="overlay" id="ov-menu">
        <div class="menu">
          <div class="mcard" data-go="county"><div class="ico">🌾</div><h2>Condado</h2><p>Economia sazonal: mão de obra, rebanhos, impostos.</p></div>
          <div class="mcard" data-go="battle"><div class="ico">⚔️</div><h2>Escaramuça</h2><p>Batalha em tempo real com counters e cerco.</p></div>
          <div class="mcard" data-go="campaign"><div class="ico">🗺️</div><h2>Campanha</h2><p>Mapa do reino; ataque leva à batalha tática.</p></div>
        </div>
        <div style="text-align:center;margin-top:6px">
          <button class="btn primary" id="menu-continue" style="display:none">▶ Continuar campanha salva</button>
        </div>
      </div>

      <div class="overlay" id="ov-county" style="display:none"></div>

      <div class="bar" id="bar-campaign" style="display:none">
        <div class="stat"><div class="k">Ano</div><div class="v" id="cmp-year">1</div></div>
        <div class="stat"><div class="k">Tesouro</div><div class="v" id="cmp-gold" style="color:#d9b25a">200</div></div>
        <div class="stat"><div class="k">Condados</div><div class="v" id="cmp-cty" style="color:#4f7fd0">2</div></div>
        <div class="grow"></div>
        <span class="info" id="cmp-saved" style="font-size:11px">salvo ✓</span>
        <button class="btn" id="cmp-restart">↺ Reiniciar</button>
        <button class="btn primary" id="cmp-end">Encerrar turno ▸</button>
      </div>
      <div class="side" id="side-campaign" style="display:none">
        <div class="card" id="cmp-panel"></div>
        <div class="card"><b>Crônica</b><div class="log" id="cmp-log"></div></div>
      </div>

      <div class="bar" id="bar-battle" style="display:none">
        <div class="stat"><div class="k">Suas</div><div class="v" id="bat-blue" style="color:#4f7fd0">0</div></div>
        <div class="stat"><div class="k">Inimigo</div><div class="v" id="bat-red" style="color:#c8553a">0</div></div>
        <div class="stat"><div class="k">Portão</div><div class="v" id="bat-gate" style="color:#d9b25a">100%</div></div>
        <div class="grow"></div>
        <span class="info" style="font-size:12px">Clique/arraste seleciona · botão direito move/ataca</span>
        <button class="btn" id="bat-pause">⏸</button>
        <button class="btn primary" id="bat-restart">↺ Escaramuça</button>
      </div>

      <div class="modal" id="modal"><div class="box" id="modal-box"></div></div>
      <div id="tooltip" style="display:none"></div>
      <div id="toasts"></div>
    `;
    this.hud.querySelectorAll(".tab").forEach((b) =>
      (b as HTMLElement).addEventListener("click", () => this.show((b as HTMLElement).dataset.s as Screen)));
    this.hud.querySelectorAll(".mcard").forEach((b) =>
      (b as HTMLElement).addEventListener("click", () => this.show((b as HTMLElement).dataset.go as Screen)));
    this.el("cmp-end").addEventListener("click", () => this.store.campaignEndTurn());
    this.el("cmp-restart").addEventListener("click", () => this.store.newCampaign());
    this.el("menu-continue").addEventListener("click", () => { if (this.store.loadCampaign()) this.show("campaign"); });
    this.el("bat-pause").addEventListener("click", () => { this.battle.paused = !this.battle.paused; this.el("bat-pause").textContent = this.battle.paused ? "▶" : "⏸"; });
    this.el("bat-restart").addEventListener("click", () => { this.store.pendingBattle = null; this.startBattle(); });
    this.el("btn-mute").addEventListener("click", () => { const m = this.sound.toggleMute(); this.el("btn-mute").textContent = m ? "🔇" : "🔊"; });
  }

  private hover(id: number | null, gx: number, gy: number): void {
    const tt = this.el("tooltip");
    if (id == null || this.store.screen !== "campaign") { tt.style.display = "none"; return; }
    const c = this.store.county(id);
    tt.innerHTML = `<b>${c.name}</b> <span class="info">(${c.owner})</span><br>⌂ ${c.pop} · ⚔ ${troopCount(c.troops)} · ${c.prosperity}%🌾<br>renda ${c.income}🪙`;
    tt.style.display = "block";
    tt.style.left = Math.min(gx + 14, window.innerWidth - 232) + "px";
    tt.style.top = (gy + 14) + "px";
  }

  private toast(msg: string): void {
    const box = this.el("toasts");
    const d = document.createElement("div");
    d.className = "toast"; d.textContent = msg;
    box.appendChild(d);
    setTimeout(() => d.remove(), 2400);
  }

  private refresh(): void {
    const s = this.store.screen;
    this.hud.querySelectorAll(".tab").forEach((b) => (b as HTMLElement).classList.toggle("active", (b as HTMLElement).dataset.s === s));
    this.toggle("ov-menu", s === "menu");
    this.toggle("ov-county", s === "county");
    this.toggle("bar-campaign", s === "campaign");
    this.toggle("side-campaign", s === "campaign");
    this.toggle("bar-battle", s === "battle");
    if (s === "menu") this.toggle("menu-continue", this.store.hasSave());
    if (s === "campaign") this.refreshCampaign();
    if (s === "county") this.refreshCounty();
  }

  private refreshCampaign(): void {
    this.setText("cmp-year", String(this.store.campaignYear));
    this.setText("cmp-gold", String(this.store.campaignGold));
    this.setText("cmp-cty", String(this.store.ownedCount()));
    this.el("cmp-log").innerHTML = this.store.campaignLog.map((l) => `<div class="${l.kind}">${l.text}</div>`).join("");
    // painel do condado selecionado
    const sel = this.store.selectedCounty;
    const panel = this.el("cmp-panel");
    if (sel == null) { panel.innerHTML = `<div class="info">Clique num condado seu, depois num vizinho para mover/atacar.</div>`; }
    else {
      const c = this.store.county(sel);
      let html = `<b>${c.name}</b> <span class="info">(${c.owner})</span>
        <table>
          <tr><td>População</td><td class="n">${c.pop}</td></tr>
          <tr><td>Prosperidade</td><td class="n">${c.prosperity}%</td></tr>
          <tr><td>Fazendas · Comida</td><td class="n">${c.farms} · ${Math.round(c.grain)}</td></tr>
          <tr><td>Renda/turno</td><td class="n">${c.income}🪙</td></tr>
          <tr><td>Tropas</td><td class="n">${troopCount(c.troops)}</td></tr>
        </table>
        <div class="info" style="margin:4px 0">${UNIT_TYPES.filter((k) => c.troops[k] > 0).map((k) => `${UNITS[k].glyph}${c.troops[k]}`).join("  ")}</div>`;
      if (c.owner === "blue") {
        html += `<div class="row" style="grid-template-columns:1fr auto;margin-bottom:6px"><span>🌾 Desenvolver fazenda <span class="info">${this.store.farmCost}🪙</span></span><button class="btn" data-farm="1">+1</button></div>`;
        html += `<b>Recrutar</b>` + UNIT_TYPES.map((k) =>
          `<div class="row" style="grid-template-columns:1fr auto"><span>${UNITS[k].glyph} ${UNITS[k].name} <span class="info">${UNITS[k].cost}🪙</span></span><button class="btn" data-rec="${k}">+1</button></div>`).join("");
      }
      panel.innerHTML = html;
      panel.querySelectorAll("button[data-rec]").forEach((b) =>
        (b as HTMLElement).addEventListener("click", () => { if (!this.store.recruit(sel, (b as HTMLElement).dataset.rec as UnitType)) this.toast("Ouro insuficiente"); }));
      panel.querySelectorAll("button[data-farm]").forEach((b) =>
        (b as HTMLElement).addEventListener("click", () => { if (!this.store.investFarm(sel)) this.toast("Ouro insuficiente"); }));
    }
    this.map.redraw();
    if (this.store.campaignWinner) this.banner(this.store.campaignWinner === "blue" ? "👑 O Reino é seu!" : "☠ Seu reino caiu", this.store.campaignWinner === "blue", () => this.store.newCampaign());
  }

  // ---------------- ECONOMIA (DOM) ----------------
  private refreshCounty(): void {
    const e = this.store.economy;
    const ov = this.el("ov-county");
    ov.innerHTML = `<div class="panel">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <div class="stat"><div class="k">Estação</div><div class="v">${SEASON_NAMES[e.season]}</div></div>
        <div class="stat"><div class="k">Ano</div><div class="v">${e.year}</div></div>
        <div class="stat"><div class="k">Tesouro</div><div class="v" style="color:#d9b25a">${e.gold}</div></div>
        <div class="stat"><div class="k">Pop.</div><div class="v">${e.pop}</div></div>
        <div class="stat"><div class="k">Felicidade</div><div class="v">${e.happy}</div></div>
        <div class="grow"></div>
        <button class="btn primary" id="eco-end">Encerrar estação ▸</button>
        <button class="btn" id="eco-reset">↺</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px">
        <div><b>Mão de obra</b> <span class="info">(${laborUsed(e)}/${e.pop})</span><div id="eco-jobs"></div></div>
        <div><b>Armazém</b><table id="eco-stores"></table>
          <div class="info" style="margin-top:6px">Reserva de comida: ${foodReserve(e).toFixed(1)}×</div></div>
      </div>
      <div class="card" style="margin-top:10px"><b>Crônica</b><div class="log" id="eco-log"></div></div>
    </div>`;
    const jobs = this.el("eco-jobs");
    for (const [k, label, em] of LABOR) {
      const row = document.createElement("div"); row.className = "row";
      row.innerHTML = `<label>${em} ${label}</label><input type="range" min="0" max="${e.pop}" value="${e.labor[k]}"><span class="n">${e.labor[k]}</span>`;
      const input = row.querySelector("input") as HTMLInputElement;
      const out = row.querySelector("span") as HTMLElement;
      input.addEventListener("input", () => {
        let v = +input.value;
        const others = laborUsed(e) - e.labor[k];
        if (others + v > e.pop) v = e.pop - others;
        e.labor[k] = v; input.value = String(v); out.textContent = String(v);
      });
      jobs.appendChild(row);
    }
    const stores: Array<[keyof typeof e.store, string]> = [["grain", "🌾 Grãos"], ["cattle", "🐄 Gado"], ["sheep", "🐑 Ovelhas"], ["wood", "🪵 Madeira"], ["stone", "🧱 Pedra"], ["iron", "⚙️ Ferro"], ["weapons", "⚔️ Armas"]];
    this.el("eco-stores").innerHTML = stores.map(([k, l]) => `<tr><td>${l}</td><td class="n">${e.store[k]}</td></tr>`).join("");
    this.el("eco-log").innerHTML = this.store.economyLog.map((t) => `<div class="info">${t}</div>`).join("");
    this.el("eco-end").addEventListener("click", () => this.store.economyEndTurn());
    this.el("eco-reset").addEventListener("click", () => this.store.newEconomy());
  }

  // ---------------- utilidades DOM ----------------
  private el(id: string): HTMLElement { return document.getElementById(id) as HTMLElement; }
  private setText(id: string, v: string): void { const e = document.getElementById(id); if (e) e.textContent = v; }
  private toggle(id: string, on: boolean): void { const e = document.getElementById(id); if (e) e.style.display = on ? "" : "none"; }
  private modal(title: string, actions: Array<[string, () => void]>): void {
    const box = this.el("modal-box");
    box.innerHTML = `<h3>${title}</h3>`;
    for (const [label, fn] of actions) {
      const b = document.createElement("button"); b.className = "btn primary"; b.style.margin = "6px"; b.textContent = label;
      b.addEventListener("click", fn); box.appendChild(b);
    }
    this.el("modal").style.display = "flex";
  }
  private closeModal(): void { this.el("modal").style.display = "none"; }
  private banner(title: string, win: boolean, cb: () => void): void {
    this.modal(`${win ? "🏆 " : ""}${title}`, [["Continuar", () => { this.closeModal(); cb(); }]]);
  }
}
