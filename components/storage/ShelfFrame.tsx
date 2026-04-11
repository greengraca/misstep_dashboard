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

  // Internal box area runs from X=0..W and Z=0..D. Corner posts sit OUTSIDE
  // that rectangle at X=-R/2 / X=W+R/2, Z=-R/2 / Z=D+R/2 so they never clip
  // into the boxes.
  const cx = W / 2; // center of the outer frame in X
  const cz = D / 2; // center of the outer frame in Z
  const outerX = W + R; // outer frame width (including posts)
  const outerZ = D + R;

  const postCorners: [number, number, number][] = [
    [-R / 2, H / 2, -R / 2],
    [W + R / 2, H / 2, -R / 2],
    [-R / 2, H / 2, D + R / 2],
    [W + R / 2, H / 2, D + R / 2],
  ];

  return (
    <group>
      {/* 4 vertical corner posts sitting outside the internal footprint */}
      {postCorners.map(([x, y, z], i) => (
        <mesh key={`post-${i}`} position={[x, y, z]}>
          <boxGeometry args={[R, H, R]} />
          <meshStandardMaterial color={FRAME_COLOR} />
        </mesh>
      ))}

      {/* Top rectangle: 4 horizontal crossbars at Y = H - R/2 connecting the
          tops of the posts. Matches the flat surface visible on top of the
          real shelf unit in the reference photos. */}
      <mesh position={[cx, H - R / 2, -R / 2]}>
        <boxGeometry args={[outerX, R, R]} />
        <meshStandardMaterial color={FRAME_COLOR} />
      </mesh>
      <mesh position={[cx, H - R / 2, D + R / 2]}>
        <boxGeometry args={[outerX, R, R]} />
        <meshStandardMaterial color={FRAME_COLOR} />
      </mesh>
      <mesh position={[-R / 2, H - R / 2, cz]}>
        <boxGeometry args={[R, R, outerZ]} />
        <meshStandardMaterial color={FRAME_COLOR} />
      </mesh>
      <mesh position={[W + R / 2, H - R / 2, cz]}>
        <boxGeometry args={[R, R, outerZ]} />
        <meshStandardMaterial color={FRAME_COLOR} />
      </mesh>

      {/* Base rectangle at Y = R/2 (floor level) connecting the bottoms of
          the posts. Frames the empty region below the lowest shelf. */}
      <mesh position={[cx, R / 2, -R / 2]}>
        <boxGeometry args={[outerX, R, R]} />
        <meshStandardMaterial color={FRAME_COLOR} />
      </mesh>
      <mesh position={[cx, R / 2, D + R / 2]}>
        <boxGeometry args={[outerX, R, R]} />
        <meshStandardMaterial color={FRAME_COLOR} />
      </mesh>

      {/* Shelf boards fill the full internal footprint (X 0..W, Z 0..D). The
          top surface of each board is exactly at SHELF_BOARD_Y[i], so boxes
          sit flush on top of them. */}
      {SHELF_BOARD_Y.map((y, i) => (
        <mesh
          key={`board-${i}`}
          position={[cx, y - SHELF_BOARD_THICKNESS / 2, cz]}
        >
          <boxGeometry args={[W, SHELF_BOARD_THICKNESS, D]} />
          <meshStandardMaterial color={BOARD_COLOR} />
        </mesh>
      ))}

      {/* Front + back crossbars UNDER each shelf board. These support the
          board from below, as seen in the reference photo where a horizontal
          metal strip runs along the front of each shelf level right under the
          MDF surface. */}
      {SHELF_BOARD_Y.flatMap((y, i) => {
        const crossY = y - SHELF_BOARD_THICKNESS - R / 2;
        return [
          <mesh key={`crossbar-f-${i}`} position={[cx, crossY, -R / 2]}>
            <boxGeometry args={[outerX, R, R]} />
            <meshStandardMaterial color={FRAME_COLOR} />
          </mesh>,
          <mesh key={`crossbar-b-${i}`} position={[cx, crossY, D + R / 2]}>
            <boxGeometry args={[outerX, R, R]} />
            <meshStandardMaterial color={FRAME_COLOR} />
          </mesh>,
        ];
      })}
    </group>
  );
}
