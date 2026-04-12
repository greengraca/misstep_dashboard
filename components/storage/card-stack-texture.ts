// components/storage/card-stack-texture.ts
//
// Shared canvas-backed texture whose tiled repetition along the V axis reads
// as the stacked edges of MTG cards (non-foil ≈ 0.305 mm thick). Consumers
// clone the base texture so each mesh can set its own repeat scaled by run
// length without mutating the shared instance.

import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from "three";

/**
 * Physically accurate MTG card density. Non-foil cards are ~0.305 mm thick,
 * so 1 m of stack ≈ 3280 cards. At this density individual lines are
 * sub-pixel at normal camera distances and correctly blur into a uniform
 * banded tone, while zooming in reveals the fine per-card edges.
 */
export const CARDS_PER_METER = 3280;

let cached: CanvasTexture | null = null;

function ensureBaseTexture(): CanvasTexture | null {
  if (cached) return cached;
  if (typeof document === "undefined") return null; // SSR guard

  // One tile = one 0.305 mm card edge. We give it 8 vertical pixels so the
  // brightness varies smoothly instead of alternating hard light/dark. A soft
  // sine wave reads as a faint fine pattern up close and anti-aliases to a
  // gentle gray at a distance instead of shimmering.
  const W = 2;
  const H = 8;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    // Soft sine ripple: brightness between ~218 and ~250.
    const t = (y + 0.5) / H;
    const brightness = 234 + Math.round(Math.sin(t * Math.PI * 2) * 16);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      img.data[i] = brightness;
      img.data[i + 1] = brightness;
      img.data[i + 2] = brightness + 2;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  // Trilinear filtering + mipmaps so the dense stripe pattern anti-aliases
  // into a uniform gray when sub-pixel at normal camera distance, and
  // resolves into fine lines when zoomed in. Without mipmaps the texture
  // shimmers and reads as chunky pixel-aligned bands.
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
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
  // Each tile represents one card edge (the sine wave has one peak per tile).
  const tiles = Math.max(1, stackDepthM * CARDS_PER_METER);
  clone.repeat.set(1, tiles);
  clone.needsUpdate = true;
  return clone;
}
