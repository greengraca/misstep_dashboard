// components/storage/Box3D.tsx
/// <reference types="@react-three/fiber" />
"use client";

import { useState } from "react";
import { Html } from "@react-three/drei";
import {
  BOX_DIMENSIONS,
  BOX_WALL_THICKNESS,
  CARD_FILL_HEIGHT_RATIO,
  DIVIDER_HEIGHT_RATIO,
  ROW_CAPACITY_SLOTS,
} from "./physical-config";
import { BOX_ROWS, type BoxType } from "@/lib/storage";

/** A run of consecutive slots in the same row that share a set code. */
export interface BoxSetRun {
  set: string;
  setName: string;
  slotCount: number;
}

/** Slot data for a single internal row of a box. */
export interface BoxRowData {
  rowIndex: number;
  setRuns: BoxSetRun[];
}

/** Slot data for a whole box, keyed by rowIndex. */
export interface BoxData {
  rows: BoxRowData[];
}

interface Box3DProps {
  position: [number, number, number];
  type: BoxType;
  boxId: string;
  isSelected: boolean;
  data?: BoxData;
  onClick: (boxId: string) => void;
}

const BOX_COLOR = "#eae0c4";
const BOX_HOVER_COLOR = "#f6ecd0";
const BOX_SELECTED_COLOR = "#d4a24b";
const DIVIDER_COLOR = "#d7ccac";

/**
 * Deterministic color for a set code. Hashes the code into an HSL hue so
 * every set gets a stable, distinct color band inside its row.
 */
function setColor(setCode: string): string {
  let hash = 0;
  for (let i = 0; i < setCode.length; i++) {
    hash = (hash * 31 + setCode.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 45% 55%)`;
}

export default function Box3D({
  position,
  type,
  boxId,
  isSelected,
  data,
  onClick,
}: Box3DProps) {
  const [hovered, setHovered] = useState(false);
  const dim = BOX_DIMENSIONS[type];
  const numRows = BOX_ROWS[type];
  const W = dim.width;
  const H = dim.height;
  const D = dim.depth;
  const T = BOX_WALL_THICKNESS;

  const wallColor = isSelected
    ? BOX_SELECTED_COLOR
    : hovered
      ? BOX_HOVER_COLOR
      : BOX_COLOR;

  // Internal row slot width: (box width - 2 outer walls - (numRows-1) dividers) / numRows
  const rowWidth = (W - 2 * T - (numRows - 1) * T) / numRows;
  // Internal row depth: box depth - 2 outer walls
  const rowDepth = D - 2 * T;
  // Card fill physical height (sits on the box floor)
  const fillHeight = H * CARD_FILL_HEIGHT_RATIO;
  // Divider physical height (walls are slightly taller than dividers so the
  // dividers look like internal cardboard flaps)
  const dividerHeight = H * DIVIDER_HEIGHT_RATIO;

  // X position of each internal row's left edge (including the outer wall offset)
  const rowLeftX = (rowIndex: number): number =>
    T + rowIndex * (rowWidth + T);

  // X position of each internal divider's center
  const dividerX = (dividerIndex: number): number =>
    T + (dividerIndex + 1) * rowWidth + dividerIndex * T + T / 2;

  const handlePointerEnter = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = "pointer";
  };
  const handlePointerLeave = () => {
    setHovered(false);
    document.body.style.cursor = "";
  };
  const handleClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    onClick(boxId);
  };

  return (
    <group
      position={position}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
    >
      {/* Floor of the box */}
      <mesh position={[W / 2, T / 2, D / 2]} receiveShadow>
        <boxGeometry args={[W, T, D]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>

      {/* Left wall */}
      <mesh position={[T / 2, H / 2, D / 2]} castShadow>
        <boxGeometry args={[T, H, D]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
      {/* Right wall */}
      <mesh position={[W - T / 2, H / 2, D / 2]} castShadow>
        <boxGeometry args={[T, H, D]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
      {/* Front wall */}
      <mesh position={[W / 2, H / 2, T / 2]} castShadow>
        <boxGeometry args={[W - 2 * T, H, T]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
      {/* Back wall */}
      <mesh position={[W / 2, H / 2, D - T / 2]} castShadow>
        <boxGeometry args={[W - 2 * T, H, T]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>

      {/* Internal dividers — numRows - 1 of them, running front-to-back */}
      {Array.from({ length: numRows - 1 }).map((_, i) => (
        <mesh
          key={`divider-${i}`}
          position={[dividerX(i), dividerHeight / 2 + T, D / 2]}
        >
          <boxGeometry args={[T, dividerHeight, rowDepth]} />
          <meshStandardMaterial color={DIVIDER_COLOR} />
        </mesh>
      ))}

      {/* Card fills + set separators per row */}
      {data?.rows.map((row) => {
        if (row.rowIndex >= numRows) return null;
        const leftX = rowLeftX(row.rowIndex);
        // Walk the set runs and place each as a block along Z inside the row.
        // Z starts at the front wall inset (T) and grows toward the back.
        let zCursor = T;
        // Usable Z depth per slot (at full row capacity).
        const zPerSlot = rowDepth / ROW_CAPACITY_SLOTS;

        return row.setRuns.map((run, runIdx) => {
          const runZLength = run.slotCount * zPerSlot;
          const fillCenterZ = zCursor + runZLength / 2;
          const fillCenterX = leftX + rowWidth / 2;
          const fillCenterY = T + fillHeight / 2;
          const node = (
            <group key={`r${row.rowIndex}-${runIdx}`}>
              <mesh position={[fillCenterX, fillCenterY, fillCenterZ]}>
                <boxGeometry
                  args={[rowWidth * 0.92, fillHeight, Math.max(runZLength, 0.001)]}
                />
                <meshStandardMaterial color={setColor(run.set)} />
              </mesh>
              {/* Set label above the middle of the run, only for runs
                  meaningful enough to bother labeling. */}
              {run.slotCount >= 3 && (
                <Html
                  position={[
                    fillCenterX,
                    T + fillHeight + 0.005,
                    fillCenterZ,
                  ]}
                  center
                  distanceFactor={2.5}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  <div
                    style={{
                      background: "rgba(255,255,255,0.95)",
                      color: "#222",
                      fontSize: 9,
                      lineHeight: 1.1,
                      padding: "1px 3px",
                      borderRadius: 2,
                      whiteSpace: "nowrap",
                      fontFamily: "system-ui, sans-serif",
                      fontWeight: 600,
                      border: "1px solid rgba(0,0,0,0.15)",
                    }}
                  >
                    {run.set.toUpperCase()}
                  </div>
                </Html>
              )}
            </group>
          );
          zCursor += runZLength;
          return node;
        });
      })}
    </group>
  );
}
