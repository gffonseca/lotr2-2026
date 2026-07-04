/** Bootstrap da Application do Pixi (v8). */
import { Application } from "pixi.js";
import { THEME } from "./theme";

export const STAGE_W = 1180;
export const STAGE_H = 660;

export async function createPixiApp(mount: HTMLElement): Promise<Application> {
  const app = new Application();
  await app.init({
    width: STAGE_W,
    height: STAGE_H,
    background: THEME.bg,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(2, globalThis.devicePixelRatio || 1),
  });
  const canvas = app.canvas as HTMLCanvasElement;
  canvas.style.maxWidth = "100%";
  canvas.style.height = "auto";
  canvas.style.display = "block";
  canvas.style.margin = "0 auto";
  canvas.oncontextmenu = (e) => e.preventDefault();
  mount.appendChild(canvas);
  return app;
}
