import { exec, appHome, layout, run } from "herdr";

// A theme's wallpapers: backgrounds/omarchy/<theme>/, in name order. None: [].
export async function wallpapers(name) {
  const dir = `backgrounds/omarchy/${name}`;
  const r = await exec("ls", ["-1", `${appHome()}/${dir}`]).catch(() => null);
  if (r?.code !== 0) return [];
  return r.stdout.split("\n").filter((f) => /\.(webp|jpe?g|png)$/i.test(f)).map((f) => `${dir}/${f}`);
}

export function setWallpaper(image) {
  const l = layout();
  if (!l) return;
  run("layout.set", { layout: { ...l, background: { ...l.background, image } } });
}
