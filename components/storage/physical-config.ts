// components/storage/physical-config.ts
//
// Physical dimensions of the user's shelf and card boxes, in METERS.
// Tomorrow's real measurements edit these constants and nothing else.

import type { BoxType } from "@/lib/storage";

/** Total shelf frame dimensions (width × height × depth), in meters. */
export const SHELF_FRAME = {
  width: 1.795,
  height: 1.80,
  depth: 0.60,
} as const;

/**
 * Y coordinate (height above floor) of each shelf board, in meters.
 * The array order maps to the `layout.shelfRows` array: index 0 is the top
 * shelf, index 1 is the middle, index 2 is the bottom.
 */
export const SHELF_BOARD_Y: readonly number[] = [1.47, 1.02, 0.53];

/** Thickness of each shelf board, in meters. */
export const SHELF_BOARD_THICKNESS = 0.02;

/** Thickness of the 4 vertical corner posts (square cross-section). */
export const FRAME_RAIL_THICKNESS = 0.0375;

/**
 * Vertical height of the horizontal crossbars that run between posts at the
 * top of the unit and under each shelf level. The shelf board's top surface
 * aligns with the top of the crossbar at that level.
 */
export const HORIZONTAL_RAIL_HEIGHT = 0.072;

/**
 * Box dimensions per type, in meters. Order: width (across shelf, X axis),
 * height (vertical, Y axis), depth (front-to-back, Z axis).
 */
export const BOX_DIMENSIONS: Record<BoxType, { width: number; height: number; depth: number }> = {
  "1k": { width: 0.08, height: 0.10, depth: 0.40 },
  "2k": { width: 0.17, height: 0.10, depth: 0.40 },
  "4k": { width: 0.32, height: 0.10, depth: 0.40 },
};

/** Small gap between adjacent boxes in the same shelf row, in meters. */
export const BOX_GAP = 0.002;

/** Thickness of box cardboard walls and internal dividers, in meters. */
export const BOX_WALL_THICKNESS = 0.003;

/** How tall the card fill inside a row is, as a fraction of box height. */
export const CARD_FILL_HEIGHT_RATIO = 0.82;

/** How tall the internal dividers are, as a fraction of box height. */
export const DIVIDER_HEIGHT_RATIO = 0.92;

/** Max slots per internal box row. Mirrors lib/storage.ts ROW_CAPACITY_SLOTS. */
export const ROW_CAPACITY_SLOTS = 125;

/**
 * Scene camera defaults. The camera is positioned at a front-3/4 angle so
 * the user can see the box fronts without the shelf frame occluding them.
 */
export const CAMERA_DEFAULTS = {
  position: [0.8975, 2.6, 2.8] as [number, number, number], // centered in front, tilted down
  fov: 50,
  target: [0.8975, 0.9, 0.3] as [number, number, number],
};
