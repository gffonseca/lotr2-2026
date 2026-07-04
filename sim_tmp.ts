import { createKingdom, Rng, tickEconomy, collectIncome, resetMoves, runRivalTurn, checkVictory, autoResolve, moveTroops, troopCount, emptyTroops, adjacency, UNITS } from "./src/domain/index";
void moveTroops;
function campaign(seed:number){
  const rng=new Rng(seed); const k=createKingdom(rng);
  let gold=200, turn=0, winner:string|null=null;
  while(turn<400 && !winner){
    turn++;
    tickEconomy(k,rng);
    gold += collectIncome(k,"blue");
    resetMoves(k);
    for(const c of k.counties.filter(c=>c.owner==="blue")){
      while(gold>=45){const key=(["pike","sword","archer","knight"] as const)[rng.int(0,3)]; if(gold>=UNITS[key].cost){c.troops[key]++;gold-=UNITS[key].cost;}else break;}
    }
    for(const c of k.counties.filter(c=>c.owner==="blue")){
      if(c.moved)continue;
      const t=adjacency(k.edges,c.id).map(n=>k.counties[n]).filter(n=>n.owner!=="blue").sort((a,b)=>troopCount(a.troops)-troopCount(b.troops))[0];
      if(t && troopCount(c.troops)>troopCount(t.troops)*1.05 && troopCount(c.troops)>2){
        const r=autoResolve(c.troops,t.troops,{defenderFortified:t.owner!=="neutral"});
        if(r.winner==="attacker"){t.owner="blue";t.troops=r.attacker;c.troops=emptyTroops();c.moved=true;} else {c.troops=r.attacker;t.troops=r.defender;c.moved=true;}
      }
    }
    runRivalTurn(k,rng);
    winner=checkVictory(k);
  }
  const nan=k.counties.some(c=>!Number.isFinite(c.pop)||!Number.isFinite(c.income));
  const blue=k.counties.filter(c=>c.owner==="blue").length, red=k.counties.filter(c=>c.owner==="red").length;
  const totalPop=Math.round(k.counties.reduce((s,c)=>s+c.pop,0));
  return {turn,winner:winner||`indef(azul ${blue}/verm ${red})`,gold,nan,totalPop};
}
for(let i=0;i<6;i++){const r=campaign(i+1); console.log(`#${i+1}: ${r.winner} em ${r.turn} turnos · ouro ${r.gold} · popTotal ${r.totalPop} · NaN=${r.nan}`);}
