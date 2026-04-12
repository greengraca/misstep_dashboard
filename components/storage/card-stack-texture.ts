// components/storage/card-stack-texture.ts
//
// Shared canvas-backed texture whose tiled repetition along the V axis reads
// as the stacked edges of MTG cards (non-foil ≈ 0.305 mm thick). Consumers
// clone the base texture so each mesh can set its own repeat scaled by run
// length without mutating the shared instance.

import {
  CanvasTexture,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from "three";

/** Target visual density: how many "card edges" per meter of stack depth. */
export const CARDS_PER_METER = 200;

let cached: CanvasTexture | null = null;

function ensureBaseTexture(): CanvasTexture | null {
  if (cached) return cached;
  if (typeof document === "undefined") return null; // SSR guard

  const W = 2;
  const H = 4;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // One tile = 4 horizontal rows representing 2 card edges with subtle
  // variation. Multiplied against the mesh's pastel base color it reads as
  // faint banding, not full dark stripes.
  const palette: [number, number, number][] = [
    [255, 255, 255], // card face (base pastel)
    [214, 214, 220], // subtle shade
    [170, 170, 180], // card edge line (darker)
    [214, 214, 220], // subtle shade
  ];
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const [r, g, b] = palette[y];
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.colorSpace = SRGBColorSpace;
  cached = tex;
  return tex;
}

/**
 * Clone the shared card-stack texture and set its V-axis repeat to match a
 * given stack depth in meters. Each clone is lightweight — they share the
 * underlying canvas/image, only the Texture parameters (repeat, wrap, etc.)
 * are per-instance.
 *
 * @param stackDepthM The depth of the card stack in meters (e.g. 0.40 for a
 *   full 40 cm row). Returns null during SSR.
 */
export function cloneCardStackTexture(stackDepthM: number): Texture | null {
  const base = ensureBaseTexture();
  if (!base) return null;
  const clone = base.clone();
  // 2 card edges per texture tile → divide by 2 for tile count.
  const tiles = Math.max(1, (stackDepthM * CARDS_PER_METER) / 2);
  clone.repeat.set(1, tiles);
  clone.needsUpdate = true;
  return clone;
}
