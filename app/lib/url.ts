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

  return {
    seed: parseInt(params.get("seed") ?? "") || defaults.seed,
    speed: parseInt(params.get("speed") ?? "") || defaults.speed,
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
