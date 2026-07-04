# Lords of the Realm II — 2026

Remake fiel modernizado do clássico de estratégia medieval da Impressions Games (1996),
para rodar no navegador. **Web · TypeScript · PixiJS · Vite**, com deploy no **Railway**.

Este repositório é a **fundação de engenharia** da Fase 1: consolida os três protótipos
validados (economia do condado, batalha em tempo real, mapa do reino) numa arquitetura
limpa com **regras / estado / render** separados.

---

## Estado atual (o que já funciona)

- ✅ **Domínio puro em TypeScript** (regras determinísticas, sem dependência de engine).
- ✅ **Três pilares jogáveis**: gestão sazonal do condado, batalha tática RTS, campanha no mapa.
- ✅ **Integração mapa → batalha**: atacar um condado abre a batalha tática; o resultado volta ao mapa.
- ✅ **Render com PixiJS** (mapa e batalha) + HUD em DOM.
- ✅ **Economia real por condado** (M4): cada condado produz comida, cresce/definha por fome e gera renda emergente de população × prosperidade; dá para **investir** em fazendas.
- ✅ **Save/Load da campanha** (M3): auto-save em `localStorage`, "Continuar" no menu, determinístico (snapshot do RNG).
- ✅ **Sprites originais na batalha** (M5): unidades desenhadas com os sprites extraídos de `.PL8` (azul/vermelho), com _fallback_ para tokens.
- ✅ **Sprites animados** (M5.1): ciclo de animação (`AnimatedSprite`) por unidade, com espelhamento por direção.
- ✅ **Polish & UX** (M6): tooltips no mapa, toasts de feedback, partículas de combate, **SFX originais** (WAVs) com mute, e layout responsivo.
- ✅ **Testes** de combate, economia e persistência (Vitest) — determinismo garantido por RNG semeado.
- ✅ **Build de produção** (`vite build`) e **servidor Express** para o Railway.

---

## Decisão de engine: PixiJS × Phaser

Escolhemos **PixiJS**. Resumo da comparação:

| Critério | PixiJS | Phaser |
|---|---|---|
| Papel | **Renderizador 2D puro** (WebGL/WebGPU) | Framework de jogo completo |
| Loop / cenas / física | Você controla | Embutidos e opinativos |
| Separação regras↔render | **Natural** — a engine não invade a lógica | Tende a acoplar estado à cena/física |
| Multiplayer determinístico | **Favorecido** (sim isolada do render) | Exige disciplina extra p/ isolar |
| Peso / superfície de API | Menor, focado | Maior |
| UI/HUD | Livre (DOM/Pixi à escolha) | Cenas Phaser ou plugins |

**Por que importa aqui:** o coração do LotR2 é simulação (economia por turno + batalha em tempo
real) que precisa ser **determinística e testável** — e, no futuro, rodar igual em cliente e
servidor para multiplayer/replays. Pixi nos deixa manter esse núcleo em TS puro (pasta `domain/`,
sem `import` de engine) e usar a engine só para desenhar. Phaser traria física/scene-manager que
não usamos e que dificultariam essa fronteira. Se depois quisermos UI de jogo mais rica dentro do
canvas, adotamos **@pixi/ui** sem trocar de engine.

---

## Arquitetura (camadas)

```
┌──────────────────────────────────────────────┐
│  app/            Orquestração + HUD (DOM)      │  ← liga tudo, navegação, telas
├──────────────────────────────────────────────┤
│  render/         PixiJS (mapa, batalha, tema)  │  ← LÊ o estado e desenha; trata input
├──────────────────────────────────────────────┤
│  state/          Store observável              │  ← estado mutável + coordenação (sem regras)
├──────────────────────────────────────────────┤
│  domain/         REGRAS PURAS (sem Pixi/DOM)   │  ← determinístico, serializável, testado
└──────────────────────────────────────────────┘
        server/    Express serve o SPA (Railway)
```

Regra de ouro: **`domain/` nunca importa de `render/`, `state/` ou `pixi.js`.** Toda aleatoriedade
passa por `Rng` (semente reproduzível) — nunca `Math.random()` no domínio.

---

## Estrutura de pastas

```
lotr2-2026/
├─ index.html                 # entry do Vite
├─ package.json · tsconfig.json · vite.config.ts · vitest.config.ts
├─ railway.json · nixpacks.toml · Dockerfile     # deploy
├─ server/
│  └─ index.ts                # Express: serve dist/ em produção
├─ src/
│  ├─ main.ts                 # bootstrap (monta Pixi + App)
│  ├─ domain/                 # ── REGRAS PURAS ──
│  │  ├─ types.ts             # tipos base (UnitType, Troops, County, ...)
│  │  ├─ units.ts             # catálogo UNITS + counters (fonte única de verdade)
│  │  ├─ rng.ts               # RNG determinístico (mulberry32)
│  │  ├─ combat/
│  │  │  ├─ autoResolve.ts    # resolução estratégica (mapa)
│  │  │  └─ tacticalSim.ts    # simulação de batalha em tempo real (headless)
│  │  ├─ economy/
│  │  │  └─ countyTick.ts     # loop econômico sazonal do condado
│  │  ├─ map/
│  │  │  ├─ kingdom.ts        # condados, arestas, adjacência
│  │  │  └─ campaignTurn.ts   # renda, IA rival, vitória
│  │  └─ index.ts             # barrel
│  ├─ state/
│  │  ├─ store.ts             # store observável + handoff mapa→batalha
│  │  └─ persistence.ts       # serialização pura da campanha (save/load)  [M3]
│  ├─ render/
│  │  ├─ pixiApp.ts           # cria a Application do Pixi
│  │  ├─ mapRenderer.ts       # desenha o reino, trata cliques
│  │  ├─ battleRenderer.ts    # desenha a batalha (sprites + fallback), input
│  │  ├─ sprites.ts           # manifesto/carregamento dos sprites .PL8       [M5]
│  │  └─ theme.ts             # paleta
│  └─ app/
│     └─ App.ts               # navegação, telas, HUD, ticker
├─ public/
│  └─ sprites/                # PNGs das unidades extraídos do original       [M5]
└─ tests/
   ├─ combat.test.ts          # counters, terminação, determinismo
   ├─ economy.test.ts         # ciclo sazonal, determinismo
   └─ persistence.test.ts     # round-trip de save, versão, determinismo
```

---

## Tipos base (resumo)

```ts
type UnitType = "sword" | "pike" | "archer" | "knight" | "mace";
type Faction  = "blue" | "red" | "neutral";
type Troops   = Record<UnitType, number>;

interface UnitStats { hp; dmg; range; speed; cooldown; radius; armor; str; cost; /* +flags */ }
interface County    { id; name; x; y; owner: Faction; troops: Troops; pop; income; moved; }
interface BattleResult { winner: "attacker" | "defender"; attacker: Troops; defender: Troops; }
class    Rng        { next(); range(a,b); int(a,b); pick(arr); snapshot()/restore(); }
class    BattleSim  { step(dt); orderUnits(ids,x,y,kind); survivors(team); over; winner; }
```

---

## Como rodar

```bash
npm install
npm run dev        # Vite em http://localhost:5173
npm test           # Vitest (domínio)
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + bundle de produção -> dist/
npm start          # serve dist/ via Express (usa $PORT)
```

### Deploy no Railway

O repositório já traz `railway.json` + `nixpacks.toml` (e um `Dockerfile` alternativo).

1. `railway init` (ou conecte o repo do GitHub no dashboard).
2. Railway roda `npm ci && npm run build` e depois `npm start`.
3. O Express serve `dist/` na porta `$PORT`. Healthcheck em `/`.

> Não versionar `dist/` nem `node_modules/` (ver `.gitignore`).

---

## Plano técnico — Fase 1 (Fundação jogável de 1 condado → 1 reino)

**Objetivo:** transformar os protótipos numa base sólida, testada e deployável — sem ainda buscar
o escopo completo do jogo. Esta base (este repo) já cobre M0–M2.

| Marco | Entregável | Critério de pronto |
|---|---|---|
| **M0 — Scaffold** ✅ | Vite+TS+Pixi, camadas, CI local, deploy Railway | `build` verde, app abre no navegador |
| **M1 — Domínio testado** ✅ | Regras puras + RNG + Vitest | `npm test` verde, determinismo provado |
| **M2 — 3 telas integradas** ✅ | Condado, Batalha, Campanha + handoff | jogar um loop completo mapa→batalha→mapa |
| **M3 — Persistência** ✅ | Save/Load (localStorage → depois API) | recarregar mantém a campanha |
| **M4 — Economia no mapa** ✅ | Cada condado produz comida, cresce por prosperidade e rende (não mais `pop×1.1`); investir em fazendas | produção/consumo por condado |
| **M5 — Assets reais** ✅ | Sprites `.PL8` extraídos no lugar dos tokens | unidades renderizadas com arte original |
| **M5.1 — Animação** ✅ | Ciclo de animação por unidade + flip por direção | unidades se movem/animam na batalha |
| **M6 — Polish & UX** ✅ | Tooltips, toasts, partículas, SFX (mute), responsivo | jogável com feedback claro |

> **Nota M5.1:** hoje animamos um ciclo de 6 frames (mesma direção) espelhado por lado. O próximo
> refino é **animação 8-direcional** (norte/leste/sul/oeste × andar/atacar) e ajuste de paleta/sombra —
> o extrator (`../lotr2_extract`) já produz todos os frames de cada `.PL8`.

**Critérios transversais da Fase 1:** cobertura de testes no `domain/` ≥ 80%; nenhuma regra fora de
`domain/`; build de produção < 3s; determinismo (mesmo seed ⇒ mesmo resultado) mantido.

---

## Roadmap de engenharia (além da Fase 1)

- ✅ **Fase 2 — Combate completo (primeira leva):** catapultas (arco + área), aríete, sapadores que abrem **brechas** na muralha, **óleo fervente** do defensor, **formações** (linha/coluna/cunha) e **pathfinding** até o vão. Animação de sprites **8-direcional** (mapeamento ajustável em `render/sprites.ts`).
- **Fase 3 — IA e diplomacia:** IA estratégica (avaliação de fronteiras, blefe), personalidades (Cavaleiro/Condessa/Bispo/Barão), mensagens/gifts.
- **Fase 4 — Multiplayer assíncrono:** mover a simulação determinística para autoridade no servidor (Laravel/Node), turnos por partida, contas e saves na nuvem, replays a partir do log de comandos + seed.
- **Fase 5 — Conteúdo & meta:** editor de mapas, campanhas históricas, balanceamento data-driven, telemetria.

---

## Notas de design

- **Fonte única de verdade de balanceamento:** `src/domain/units.ts`. Ajustar números lá reflete em
  batalha *e* mapa.
- **Determinismo primeiro:** é o que habilita multiplayer justo e replays. Toda regra recebe `Rng`.
- **Render descartável:** a camada `render/` pode ser reescrita (ou trocada) sem tocar nas regras.

Baseado em *Lords of the Realm II* (Impressions Games / Sierra, 1996 — abandonware em domínio livre).
Projeto de fã, sem fins comerciais.
