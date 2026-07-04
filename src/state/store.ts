/**
 * Estado central do jogo. Orquestra o domínio (regras puras) e guarda o estado
 * mutável observável. A camada de render assina `subscribe` e re-lê o estado.
 * NÃO contém regras de jogo — só coordenação e o handoff mapa->batalha.
 */
import {
  Rng, createKingdom, adjacency, autoResolve, moveTroops, collectIncome,
  resetMoves, runRivalTurn, checkVictory, troopCount, emptyTroops,
  createCountyEconomy, tickCounty, EDGES, tickEconomy, developFarm, strategicIncome, COUNTY_ECON,
  LORDS, PERSONALITIES, evaluateTruce, truceCost, TRUCE_TURNS, factionPower,
  type Kingdom, type County, type Troops, type Screen, type CountyEconomy, type Personality,
} from "@/domain";
import { serialize, deserialize, SAVE_KEY, type CampaignSnapshot } from "./persistence";

/** Wrapper seguro de storage (funciona sem localStorage, ex.: testes/SSR). */
const storage = {
  get(key: string): string | null { try { return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null; } catch { return null; } },
  set(key: string, val: string): void { try { if (typeof localStorage !== "undefined") localStorage.setItem(key, val); } catch { /* ignore */ } },
  del(key: string): void { try { if (typeof localStorage !== "undefined") localStorage.removeItem(key); } catch { /* ignore */ } },
};

export interface LogLine { text: string; kind: "info" | "win" | "lose"; }
export interface PendingBattle { srcId: number; dstId: number; attacker: Troops; defender: Troops; fortified: boolean; }
type Listener = () => void;

export class GameStore {
  screen: Screen = "menu";

  // --- campanha ---
  kingdom: Kingdom;
  campaignGold = 200;
  campaignYear = 1;
  selectedCounty: number | null = null;
  campaignLog: LogLine[] = [];
  campaignWinner: "blue" | "red" | null = null;
  rivalPersonality: Personality = "knight";
  truceTurns = 0;

  // --- economia (modo condado) ---
  economy: CountyEconomy;
  economyLog: string[] = [];

  // --- handoff p/ batalha ---
  pendingBattle: PendingBattle | null = null;

  private rng: Rng;
  private listeners = new Set<Listener>();

  constructor(seed: number = Date.now() >>> 0) {
    this.rng = new Rng(seed);
    this.kingdom = createKingdom(this.rng);
    this.rivalPersonality = this.rng.pick(PERSONALITIES);
    this.economy = createCountyEconomy();
    const lord = LORDS[this.rivalPersonality];
    this.log([`Você governa Millbrook. Seu rival é ${lord.name}, ${lord.epithet}. Conquiste todos os condados.`], "info");
  }

  rivalLord() { return LORDS[this.rivalPersonality]; }
  truceCostNow(): number { return truceCost(factionPower(this.kingdom, "red")); }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(): void { for (const l of this.listeners) l(); }

  setScreen(s: Screen): void { this.screen = s; this.emit(); }

  private log(lines: string[], kind: LogLine["kind"]): void {
    this.campaignLog.unshift({ text: lines.join(" "), kind });
    if (this.campaignLog.length > 40) this.campaignLog.pop();
  }

  // ---------------- CAMPANHA ----------------
  newCampaign(): void {
    this.kingdom = createKingdom(this.rng);
    this.rivalPersonality = this.rng.pick(PERSONALITIES);
    this.truceTurns = 0;
    this.campaignGold = 200; this.campaignYear = 1;
    this.selectedCounty = null; this.campaignLog = []; this.campaignWinner = null;
    const lord = LORDS[this.rivalPersonality];
    this.log([`Nova campanha. Rival: ${lord.name}, ${lord.epithet}.`], "info");
    this.saveCampaign();
    this.emit();
  }

  /** Propõe trégua ao rival (paga tributo se aceito). */
  proposeTruce(): { ok: boolean; accept: boolean; reason: string; cost: number } {
    if (this.campaignWinner) return { ok: false, accept: false, reason: "A guerra acabou.", cost: 0 };
    const profile = LORDS[this.rivalPersonality];
    const rivalPower = factionPower(this.kingdom, "red");
    const playerPower = factionPower(this.kingdom, "blue");
    const cost = truceCost(rivalPower);
    if (this.campaignGold < cost) return { ok: false, accept: false, reason: `Tributo custa ${cost}🪙 — ouro insuficiente.`, cost };
    const res = evaluateTruce(profile, { tribute: cost, playerPower, rivalPower });
    if (res.accept) {
      this.campaignGold -= cost;
      this.truceTurns = TRUCE_TURNS;
      this.log([`🕊️ ${profile.name}: ${res.reason} (${TRUCE_TURNS} turnos, −${cost}🪙)`], "win");
    } else {
      this.log([`✋ ${profile.name}: ${res.reason}`], "lose");
    }
    this.saveCampaign(); this.emit();
    return { ok: true, accept: res.accept, reason: res.reason, cost };
  }

  neighbors(id: number): number[] { return adjacency(this.kingdom.edges, id); }
  county(id: number): County { return this.kingdom.counties[id]; }

  /** Clique num condado. Devolve o que aconteceu para a UI reagir. */
  clickCounty(id: number): "select" | "moved" | "battle" | "invalid" {
    const c = this.county(id);
    if (this.selectedCounty == null) {
      this.selectedCounty = c.owner === "blue" ? id : null;
      this.emit();
      return "select";
    }
    const src = this.county(this.selectedCounty);
    if (id === src.id) { this.emit(); return "select"; }
    if (!this.neighbors(src.id).includes(id)) {
      this.selectedCounty = c.owner === "blue" ? id : null;
      this.emit();
      return "select";
    }
    // adjacente
    if (c.owner === "blue") {
      if (moveTroops(src, c)) { this.log([`Reforços para ${c.name}.`], "info"); this.selectedCounty = c.id; this.saveCampaign(); }
      this.emit();
      return "moved";
    }
    return "battle"; // a UI decide: auto ou tática
  }

  recruit(countyId: number, unit: keyof Troops): boolean {
    const c = this.county(countyId);
    const cost = { sword: 40, pike: 45, archer: 50, knight: 110, mace: 60 }[unit];
    if (c.owner !== "blue" || this.campaignGold < cost) return false;
    this.campaignGold -= cost; c.troops[unit]++; this.saveCampaign(); this.emit();
    return true;
  }

  autoAttack(srcId: number, dstId: number): void {
    const src = this.county(srcId), dst = this.county(dstId);
    const res = autoResolve(src.troops, dst.troops, { defenderFortified: dst.owner !== "neutral" });
    if (res.winner === "attacker") {
      dst.owner = "blue"; dst.troops = res.attacker; src.troops = emptyTroops(); src.moved = true;
      this.log([`⚔ ${dst.name} tomado!`], "win"); this.selectedCounty = dst.id;
    } else {
      src.troops = res.attacker; dst.troops = res.defender; src.moved = true;
      this.log([`☠ Ataque a ${dst.name} repelido.`], "lose");
    }
    this.checkVictory(); this.saveCampaign(); this.emit();
  }

  beginTacticalBattle(srcId: number, dstId: number): void {
    const src = this.county(srcId), dst = this.county(dstId);
    this.pendingBattle = { srcId, dstId, attacker: src.troops, defender: dst.troops, fortified: dst.owner !== "neutral" };
    this.setScreen("battle");
  }

  /** Chamado pela BattleScreen ao terminar a batalha tática. */
  finishBattle(win: boolean, attacker: Troops, defender: Troops): void {
    if (!this.pendingBattle) return;
    const src = this.county(this.pendingBattle.srcId), dst = this.county(this.pendingBattle.dstId);
    if (win) {
      dst.owner = "blue"; dst.troops = attacker; src.troops = emptyTroops(); src.moved = true;
      this.log([`⚔ ${dst.name} tomado em batalha tática!`], "win"); this.selectedCounty = dst.id;
    } else {
      src.troops = attacker; dst.troops = defender; src.moved = true;
      this.log([`☠ Repelido em ${dst.name} (batalha tática).`], "lose");
    }
    this.pendingBattle = null;
    this.checkVictory();
    this.saveCampaign();
    this.setScreen("campaign");
  }

  investFarm(id: number): boolean {
    const c = this.county(id);
    if (c.owner !== "blue") return false;
    const r = developFarm(c, this.campaignGold);
    if (!r.ok) return false;
    this.campaignGold -= r.cost;
    c.income = strategicIncome(c);
    this.log([`🌾 Fazenda desenvolvida em ${c.name} (−${r.cost}🪙).`], "info");
    this.saveCampaign(); this.emit();
    return true;
  }
  get farmCost(): number { return COUNTY_ECON.farmCost; }

  campaignEndTurn(): void {
    if (this.campaignWinner) return;
    tickEconomy(this.kingdom, this.rng);        // economia real de cada condado
    const inc = collectIncome(this.kingdom, "blue");
    this.campaignGold += inc;
    resetMoves(this.kingdom);
    this.log([`— Fim do turno. Renda +${inc} moedas —`], "info");
    const truceActive = this.truceTurns > 0;
    for (const ev of runRivalTurn(this.kingdom, this.rng, LORDS[this.rivalPersonality], truceActive)) this.log([ev.text], ev.kind);
    if (this.truceTurns > 0) { this.truceTurns--; if (this.truceTurns === 0) this.log(["A trégua expirou."], "info"); }
    this.campaignYear++; this.selectedCounty = null;
    this.checkVictory(); this.saveCampaign(); this.emit();
  }

  private checkVictory(): void {
    const v = checkVictory(this.kingdom);
    if (v) { this.campaignWinner = v; this.log([v === "blue" ? "👑 O Reino é seu!" : "☠ Seu reino caiu."], v === "blue" ? "win" : "lose"); }
  }

  // ---------------- SAVE / LOAD (M3) ----------------
  private snapshot(): CampaignSnapshot {
    return {
      version: 3,
      gold: this.campaignGold,
      year: this.campaignYear,
      counties: this.kingdom.counties,
      selected: this.selectedCounty,
      winner: this.campaignWinner,
      log: this.campaignLog,
      rngState: this.rng.snapshot(),
      rivalPersonality: this.rivalPersonality,
      truceTurns: this.truceTurns,
    };
  }

  /** Auto-save silencioso da campanha. */
  saveCampaign(): void {
    storage.set(SAVE_KEY, serialize(this.snapshot()));
  }

  hasSave(): boolean { return storage.get(SAVE_KEY) != null; }
  deleteSave(): void { storage.del(SAVE_KEY); }

  /** Carrega a campanha salva. Retorna true se carregou. */
  loadCampaign(): boolean {
    const raw = storage.get(SAVE_KEY);
    if (!raw) return false;
    const snap = deserialize(raw);
    if (!snap) return false;
    this.kingdom = { counties: snap.counties, edges: EDGES };
    this.campaignGold = snap.gold;
    this.campaignYear = snap.year;
    this.selectedCounty = snap.selected;
    this.campaignWinner = snap.winner;
    this.campaignLog = snap.log;
    this.rng.restore(snap.rngState);
    this.rivalPersonality = (PERSONALITIES as string[]).includes(snap.rivalPersonality) ? (snap.rivalPersonality as Personality) : "knight";
    this.truceTurns = snap.truceTurns;
    this.log(["Campanha carregada."], "info");
    this.emit();
    return true;
  }

  ownedCount(): number { return this.kingdom.counties.filter((c) => c.owner === "blue").length; }
  static troopSummary(t: Troops): number { return troopCount(t); }

  // ---------------- ECONOMIA ----------------
  newEconomy(): void { this.economy = createCountyEconomy(); this.economyLog = []; this.emit(); }
  economyEndTurn(): void {
    const r = tickCounty(this.economy, this.rng);
    this.economyLog.unshift(r.events.join(" · "));
    if (this.economyLog.length > 40) this.economyLog.pop();
    this.emit();
  }
}
