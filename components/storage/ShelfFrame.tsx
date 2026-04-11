// components/storage/ShelfFrame.tsx
/// <reference types="@react-three/fiber" />
"use client";

import {
  SHELF_FRAME,
  SHELF_BOARD_Y,
  SHELF_BOARD_THICKNESS,
  FRAME_RAIL_THICKNESS,
} from "./physical-config";

const FRAME_COLOR = "#2a2a2e";
const BOARD_COLOR = "#f2ecdc";

export default function ShelfFrame() {
  const W = SHELF_FRAME.width;
  const H = SHELF_FRAME.height;
  const D = SHELF_FRAME.depth;
  const R = FRAME_RAIL_THICKNESS;

  return (
    <group>
      {/* Four vertical corner rails */}
      {[
        [0 + R / 2, H / 2, 0 + R / 2],
        [W - R / 2, H / 2, 0 + R / 2],
        [0 + R / 2, H / 2, D - R / 2],
        [W - R / 2, H / 2, D - R / 2],
      ].map(([x, y, z], i) => (
        <mesh key={`rail-${i}`} position={[x, y, z]}>
          <boxGeometry args={[R, H, R]} />
          <meshStandardMaterial color={FRAME_COLOR} />
        </mesh>
      ))}

      {/* Top rail across the front */}
      <mesh position={[W / 2, H - R / 2, 0 + R / 2]}>
        <boxGeometry args={[W, R, R]} />
        <meshStandardMaterial color={FRAME_COLOR} />
      </mesh>

      {/* Bottom rail across the front (at floor level) */}
      <mesh position={[W / 2, 0 + R / 2, 0 + R / 2]}>
        <boxGeometry args={[W, R, R]} />
        <meshStandardMaterial color={FRAME_COLOR} />
      </mesh>

      {/* Shelf boards at configured Y positions */}
      {SHELF_BOARD_Y.map((y, i) => (
        <mesh
          key={`board-${i}`}
          position={[W / 2, y - SHELF_BOARD_THICKNESS / 2, D / 2]}
        >
          <boxGeometry args={[W - R * 2, SHELF_BOARD_THICKNESS, D - R * 2]} />
          <meshStandardMaterial color={BOARD_COLOR} />
        </mesh>
      ))}

      {/* Horizontal support crossbar under each shelf board (front edge only, for visual weight) */}
      {SHELF_BOARD_Y.map((y, i) => (
        <mesh
          key={`crossbar-${i}`}
          position={[W / 2, y - SHELF_BOARD_THICKNESS - R / 2, 0 + R / 2]}
        >
          <boxGeometry args={[W, R, R]} />
          <meshStandardMaterial color={FRAME_COLOR} />
        </mesh>
      ))}
    </group>
  );
}
