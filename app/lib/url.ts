export interface UrlParams {
  seed: number;
  speed: number;
  autostart: boolean;
  hideControls: boolean;
}

export function parseUrlHash(): UrlParams {
  const defaults: UrlParams = {
    seed: 42,
    speed: 3,
    autostart: false,
    hideControls: false,
  };
  if (typeof window === "undefined") return defaults;

  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);

  const seedRaw = parseInt(params.get("seed") ?? "", 10);
  const speedRaw = parseInt(params.get("speed") ?? "", 10);

  return {
    seed: Number.isFinite(seedRaw) ? seedRaw : defaults.seed,
    speed: Number.isFinite(speedRaw) ? speedRaw : defaults.speed,
    autostart: params.get("autostart") === "1",
    hideControls: params.get("hideControls") === "1",
  };
}

export function writeUrlSeed(seed: number) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  params.set("seed", String(seed));
  window.history.replaceState(null, "", "#" + params.toString());
}
