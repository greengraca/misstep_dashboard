// components/storage/Shelf3D.tsx
/// <reference types="@react-three/fiber" />
"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import ShelfFrame from "./ShelfFrame";
import Box3D, { type BoxData } from "./Box3D";
import {
  SHELF_BOARD_Y,
  SHELF_FRAME,
  BOX_DIMENSIONS,
  BOX_GAP,
  CAMERA_DEFAULTS,
} from "./physical-config";
import type { ShelfLayout } from "./types";

interface Shelf3DProps {
  layout: ShelfLayout;
  selectedBoxId: string | null;
  onBoxClick: (boxId: string) => void;
  boxData: Map<string, BoxData>;
}

export default function Shelf3D({
  layout,
  selectedBoxId,
  onBoxClick,
  boxData,
}: Shelf3DProps) {
  return (
    <div
      className="w-full rounded-[var(--radius)] bg-[var(--card-bg)] border border-[var(--border)] overflow-hidden h-[420px] sm:h-[600px]"
    >
      <Canvas
        camera={{ position: CAMERA_DEFAULTS.position, fov: CAMERA_DEFAULTS.fov }}
      >
        <color attach="background" args={["#13151a"]} />

        {/* Key light — no shadows (shadow maps blow the WebGL budget at this
            object count). Higher ambient to compensate for flat lighting. */}
        <directionalLight position={[3, 4, 2]} intensity={1.1} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[-2, 2, -2]} intensity={0.25} />

        <ShelfFrame />

        {/* Boxes */}
        {layout.shelfRows.map((row, shelfIdx) => {
          const shelfY = SHELF_BOARD_Y[shelfIdx];
          if (shelfY === undefined) {
            console.warn(
              `Layout has more shelf rows than physical shelves; ignoring row ${shelfIdx}`
            );
            return null;
          }
          let x = 0;
          return row.boxes.map((box, boxIdx) => {
            const boxDim = BOX_DIMENSIONS[box.type];
            // Flush boxes to the front (+Z side, toward the camera). Box
            // origin is its back-left-floor corner, so we push it forward by
            // (shelf_depth − box_depth) so its front face lands at Z = D.
            const zFront = SHELF_FRAME.depth - boxDim.depth;
            const position: [number, number, number] = [x, shelfY, zFront];
            x += boxDim.width + BOX_GAP;
            return (
              <Box3D
                key={box.id || `shelf-${shelfIdx}-box-${boxIdx}`}
                position={position}
                type={box.type}
                boxId={box.id}
                isSelected={selectedBoxId === box.id}
                data={boxData.get(box.id)}
                onClick={onBoxClick}
              />
            );
          });
        })}

        <OrbitControls
          target={CAMERA_DEFAULTS.target}
          enableDamping
          dampingFactor={0.08}
          minDistance={1.5}
          maxDistance={8}
          maxPolarAngle={Math.PI / 2}
        />
      </Canvas>
    </div>
  );
}
