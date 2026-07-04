/** Ponto de entrada — monta o Pixi e inicia o App. */
import { createPixiApp } from "@/render/pixiApp";
import { App } from "@/app/App";

async function bootstrap(): Promise<void> {
  const mount = document.getElementById("app");
  const hud = document.getElementById("hud");
  if (!mount || !hud) throw new Error("Elementos #app/#hud ausentes no index.html");
  const pixi = await createPixiApp(mount);
  new App(pixi, hud);
}

bootstrap().catch((err) => {
  console.error(err);
  const hud = document.getElementById("hud");
  if (hud) hud.innerHTML = `<pre style="color:#c8553a;padding:16px">Falha ao iniciar: ${String(err)}</pre>`;
});
