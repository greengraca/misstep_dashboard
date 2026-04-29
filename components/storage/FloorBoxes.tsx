// components/storage/FloorBoxes.tsx
/// <reference types="@react-three/fiber" />
"use client";

import Box3D, { type BoxData } from "./Box3D";
import {
  BOX_DIMENSIONS,
  BOX_GAP,
  SHELF_FRAME,
} from "./physical-config";
import type { ShelfLayout } from "./types";

interface FloorBoxesProps {
  floorZones: NonNullable<ShelfLayout["floorZones"]>;
  selectedBoxId: string | null;
  onBoxClick: (boxId: string) => void;
  boxData: Map<string, BoxData>;
}

/**
 * Renders the off-shelf "floor zones" as rows of boxes sitting on the ground
 * (y = 0) in front of the shelf. Each zone auto-grows: we count how many
 * synthetic floor-box IDs (`<zoneId>:<n>`) appear in `boxData` and lay that
 * many boxes side by side.
 *
 * Floor boxes use the same Box3D component as shelf boxes — the user can
 * click them and see their contents in the same panel.
 *
 * Z layout: the first zone sits closest to the camera, additional zones stack
 * further back. (For the current single-zone setup, only one row appears.)
 */
export default function FloorBoxes({
  floorZones,
  selectedBoxId,
  onBoxClick,
  boxData,
}: FloorBoxesProps) {
  if (floorZones.length === 0) return null;

  // Camera-facing front edge of the shelf is at z = SHELF_FRAME.depth (0.6).
  // Place the FIRST zone's box-fronts just past that, with a small gap.
  const FLOOR_FRONT_GAP = 0.10;

  return (
    <group>
      {floorZones.map((zone, zoneIdx) => {
        const dim = BOX_DIMENSIONS[zone.capacity];
        // Count how many physical boxes this zone spawned. The auto-grow walker
        // assigns sequential IDs `<zone.id>:0`, `<zone.id>:1`, ... — count them.
        const prefix = `${zone.id}:`;
        let count = 0;
        for (const key of boxData.keys()) {
          if (key.startsWith(prefix)) count++;
        }
        // Render at least one box even if empty so the zone is visible.
        const boxesToShow = Math.max(1, count);

        // Center the row of floor boxes under the shelf width.
        const totalWidth =
          boxesToShow * dim.width + Math.max(0, boxesToShow - 1) * BOX_GAP;
        const xStart = (SHELF_FRAME.width - totalWidth) / 2;

        // Stack zones in -Z direction (away from the shelf toward the camera).
        const zFront =
          SHELF_FRAME.depth + FLOOR_FRONT_GAP + zoneIdx * (dim.depth + 0.10);

        return (
          <group key={zone.id}>
            {Array.from({ length: boxesToShow }).map((_, i) => {
              const boxId = `${zone.id}:${i}`;
              const x = xStart + i * (dim.width + BOX_GAP);
              const position: [number, number, number] = [x, 0, zFront];
              return (
                <Box3D
                  key={boxId}
                  position={position}
                  type={zone.capacity}
                  boxId={boxId}
                  isSelected={selectedBoxId === boxId}
                  data={boxData.get(boxId)}
                  onClick={onBoxClick}
                />
              );
            })}
          </group>
        );
      })}
    </group>
  );
}
