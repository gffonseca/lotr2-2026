/**
 * Estado central do jogo. Orquestra o domínio (regras puras) e guarda o estado
 * mutável observável. A camada de render assina `subscribe` e re-lê o estado.
 * NÃO contém regras de jogo — só coordenação e o handoff mapa->batalha.
 */
import {
  Rng, createKingdom, adjacency, autoResolve, moveTroops, collectIncome,
  resetMoves, runLordTurn, checkVictory, troopCount, emptyTroops,
  createCountyEconomy, tickCounty, EDGES, tickEconomy, developFarm, strategicIncome, COUNTY_ECON,
  LORDS, PERSONALITIES, AI_FACTIONS, evaluateTruce, evaluateAlliance, truceCost, allianceCost,
  TRUCE_TURNS, ALLIANCE_TURNS, DEMAND_TRUCE_TURNS, demandChance, demandFollowThrough, factionPower,
  type Kingdom, type County, type Troops, type Screen, type CountyEconomy,
  type Personality, type AiFaction, type RelationState, type Demand, type Faction,
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
  campaignWinner: "win" | "lose" | null = null;
  lords: Record<AiFaction, Personality> = { red: "knight", green: "baron" };
  relations: Record<AiFaction, RelationState> = { red: "war", green: "war" };
  truceTurns: Record<AiFaction, number> = { red: 0, green: 0 };
  pendingDemand: Demand | null = null;

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
    this.assignLords();
    this.economy = createCountyEconomy();
    const r = this.lordProfile("red"), gr = this.lordProfile("green");
    this.log([`Você governa Millbrook. Rivais: ${r.name} (${r.epithet}) e ${gr.name} (${gr.epithet}). Domine todo o reino.`], "info");
  }

  private assignLords(): void {
    const a = this.rng.pick(PERSONALITIES);
    let b = this.rng.pick(PERSONALITIES);
    let guard = 0;
    while (b === a && guard++ < 8) b = this.rng.pick(PERSONALITIES);
    this.lords = { red: a, green: b };
    this.relations = { red: "war", green: "war" };
    this.truceTurns = { red: 0, green: 0 };
    this.pendingDemand = null;
  }

  lordProfile(f: AiFaction) { return LORDS[this.lords[f]]; }
  truceCostNow(f: AiFaction): number { return truceCost(factionPower(this.kingdom, f)); }
  allianceCostNow(f: AiFaction): number { return allianceCost(factionPower(this.kingdom, f)); }
  aiFactionsAlive(): AiFaction[] { return AI_FACTIONS.filter((f) => this.kingdom.counties.some((c) => c.owner === f)); }

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
    this.assignLords();
    this.campaignGold = 200; this.campaignYear = 1;
    this.selectedCounty = null; this.campaignLog = []; this.campaignWinner = null;
    const r = this.lordProfile("red"), gr = this.lordProfile("green");
    this.log([`Nova campanha. Rivais: ${r.name} e ${gr.name}.`], "info");
    this.saveCampaign();
    this.emit();
  }

  /** Propõe trégua a um lorde (paga tributo se aceito). */
  proposeTruce(f: AiFaction): { ok: boolean; accept: boolean; reason: string; cost: number } {
    if (this.campaignWinner) return { ok: false, accept: false, reason: "A guerra acabou.", cost: 0 };
    const profile = this.lordProfile(f);
    const rivalPower = factionPower(this.kingdom, f);
    const playerPower = factionPower(this.kingdom, "blue");
    const cost = truceCost(rivalPower);
    if (this.campaignGold < cost) return { ok: false, accept: false, reason: `Tributo custa ${cost}🪙 — ouro insuficiente.`, cost };
    const res = evaluateTruce(profile, { tribute: cost, playerPower, rivalPower });
    if (res.accept) {
      this.campaignGold -= cost;
      this.relations[f] = "truce"; this.truceTurns[f] = TRUCE_TURNS;
      this.log([`🕊️ ${profile.name}: ${res.reason} (${TRUCE_TURNS} turnos, −${cost}🪙)`], "win");
    } else {
      this.log([`✋ ${profile.name}: ${res.reason}`], "lose");
    }
    this.saveCampaign(); this.emit();
    return { ok: true, accept: res.accept, reason: res.reason, cost };
  }

  /** Propõe aliança (mais difícil que trégua; impede ataques mútuos). */
  proposeAlliance(f: AiFaction): { ok: boolean; accept: boolean; reason: string; cost: number } {
    if (this.campaignWinner) return { ok: false, accept: false, reason: "A guerra acabou.", cost: 0 };
    const profile = this.lordProfile(f);
    const rivalPower = factionPower(this.kingdom, f);
    const playerPower = factionPower(this.kingdom, "blue");
    const cost = allianceCost(rivalPower);
    if (this.campaignGold < cost) return { ok: false, accept: false, reason: `A aliança pede ${cost}🪙 — ouro insuficiente.`, cost };
    const res = evaluateAlliance(profile, { tribute: cost, playerPower, rivalPower });
    if (res.accept) {
      this.campaignGold -= cost;
      this.relations[f] = "alliance"; this.truceTurns[f] = ALLIANCE_TURNS;
      this.log([`🤝 ${profile.name}: ${res.reason} (${ALLIANCE_TURNS} turnos, −${cost}🪙)`], "win");
    } else {
      this.log([`✋ ${profile.name}: ${res.reason}`], "lose");
    }
    this.saveCampaign(); this.emit();
    return { ok: true, accept: res.accept, reason: res.reason, cost };
  }

  /** Responde à demanda pendente. pay=true paga o tributo (compra trégua). */
  respondDemand(pay: boolean): void {
    const d = this.pendingDemand;
    if (!d) return;
    const profile = this.lordProfile(d.faction);
    if (pay) {
      if (this.campaignGold >= d.tribute) {
        this.campaignGold -= d.tribute;
        this.relations[d.faction] = "truce"; this.truceTurns[d.faction] = DEMAND_TRUCE_TURNS;
        this.log([`💰 Você cedeu ao tributo de ${profile.name} (−${d.tribute}🪙). Trégua por ${DEMAND_TRUCE_TURNS} turnos.`], "info");
      } else {
        this.log([`Você não tinha ouro para o tributo de ${profile.name}.`], "lose");
      }
    } else {
      // recusar: se a ameaça era real, ele parte para a guerra; se era blefe, você o desmascara
      if (d.willFollowThrough) {
        this.relations[d.faction] = "war";
        this.log([`⚔ Você recusou. ${profile.name} não blefava — a guerra recrudesce!`], "lose");
      } else {
        this.log([`🂠 Você recusou e ${profile.name} recuou. Era blefe.`], "win");
      }
    }
    this.pendingDemand = null;
    this.saveCampaign(); this.emit();
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
    if ((c.owner === "red" || c.owner === "green") && this.relations[c.owner] === "alliance") {
      this.log([`Uma aliança impede o ataque a ${c.name}.`], "info");
      this.emit();
      return "select";
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
    if (this.campaignWinner || this.pendingDemand) return; // resolva a demanda antes de avançar
    tickEconomy(this.kingdom, this.rng);        // economia real de cada condado
    const inc = collectIncome(this.kingdom, "blue");
    this.campaignGold += inc;
    resetMoves(this.kingdom);
    this.log([`— Fim do turno. Renda +${inc} moedas —`], "info");
    // cada lorde da IA joga; friendly = ele mesmo + jogador se houver trégua/aliança (IA vs IA continua)
    for (const f of AI_FACTIONS) {
      if (!this.kingdom.counties.some((c) => c.owner === f)) continue;
      const friendly = new Set<Faction>([f]);
      if (this.relations[f] !== "war") friendly.add("blue");
      for (const ev of runLordTurn(this.kingdom, this.rng, f, this.lordProfile(f), friendly)) this.log([ev.text], ev.kind);
    }
    // decrementa tréguas/alianças
    for (const f of AI_FACTIONS) {
      if (this.truceTurns[f] > 0) {
        this.truceTurns[f]--;
        if (this.truceTurns[f] === 0) {
          const was = this.relations[f]; this.relations[f] = "war";
          this.log([`${was === "alliance" ? "A aliança" : "A trégua"} com ${this.lordProfile(f).name} terminou.`], "info");
        }
      }
    }
    this.maybeGenerateDemand();
    this.campaignYear++; this.selectedCounty = null;
    this.checkVictory(); this.saveCampaign(); this.emit();
  }

  private maybeGenerateDemand(): void {
    if (this.pendingDemand) return;
    for (const f of AI_FACTIONS) {
      if (this.relations[f] !== "war" || !this.kingdom.counties.some((c) => c.owner === f)) continue;
      const profile = this.lordProfile(f);
      if (this.rng.next() < demandChance(profile)) {
        const tribute = Math.round(truceCost(factionPower(this.kingdom, f)) * 0.8);
        const willFollowThrough = this.rng.next() < demandFollowThrough(profile);
        this.pendingDemand = { faction: f, lordName: profile.name, tribute, willFollowThrough };
        this.log([`✉ ${profile.name} exige ${tribute}🪙 de tributo — ou haverá guerra.`], "lose");
        break; // uma demanda por vez
      }
    }
  }

  private checkVictory(): void {
    const v = checkVictory(this.kingdom);
    if (v) { this.campaignWinner = v; this.log([v === "win" ? "👑 O Reino é seu!" : "☠ Seu reino caiu."], v === "win" ? "win" : "lose"); }
  }

  // ---------------- SAVE / LOAD (M3) ----------------
  private snapshot(): CampaignSnapshot {
    return {
      version: 4,
      gold: this.campaignGold,
      year: this.campaignYear,
      counties: this.kingdom.counties,
      selected: this.selectedCounty,
      winner: this.campaignWinner,
      log: this.campaignLog,
      rngState: this.rng.snapshot(),
      lords: this.lords,
      relations: this.relations,
      truceTurns: this.truceTurns,
      pendingDemand: this.pendingDemand,
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
    const valid = (p: string): p is Personality => (PERSONALITIES as string[]).includes(p);
    this.lords = {
      red: valid(snap.lords?.red) ? snap.lords.red as Personality : "knight",
      green: valid(snap.lords?.green) ? snap.lords.green as Personality : "baron",
    };
    const relOf = (v: unknown): RelationState => (v === "truce" || v === "alliance") ? v : "war";
    this.relations = { red: relOf(snap.relations?.red), green: relOf(snap.relations?.green) };
    this.truceTurns = { red: snap.truceTurns?.red ?? 0, green: snap.truceTurns?.green ?? 0 };
    this.pendingDemand = snap.pendingDemand ?? null;
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
