// components/storage/Box3D.tsx
/// <reference types="@react-three/fiber" />
"use client";

import { useMemo, useState } from "react";
import {
  BOX_DIMENSIONS,
  BOX_WALL_THICKNESS,
  CARD_FILL_HEIGHT_RATIO,
  ROW_CAPACITY_SLOTS,
} from "./physical-config";
import { BOX_ROWS, type BoxType } from "@/lib/storage";
import { cloneCardStackTexture } from "./card-stack-texture";

/** A run of consecutive slots in the same row that share a set code. */
export interface BoxSetRun {
  set: string;
  setName: string;
  slotCount: number;
  /** Precomputed fill hex (from StorageContent). Optional for backwards compat. */
  fillColor?: string;
  /** Precomputed divider hex (from StorageContent). Optional. */
  dividerColor?: string;
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
const CHANNEL_DIVIDER_COLOR = "#d7ccac"; // internal row walls (cardboard)

// Divider geometry
const SET_DIVIDER_THICKNESS = 0.0006; // 0.6 mm separator card thickness

/** Fallback colors if the set-run didn't come with pre-assigned colors. */
const DEFAULT_FILL_COLOR = "#c8d0dc";
const DEFAULT_DIVIDER_COLOR = "#8b93a3";

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

  // Internal row slot width: (box width - 2 outer walls - (numRows-1) channel dividers) / numRows
  const rowWidth = (W - 2 * T - (numRows - 1) * T) / numRows;
  // Internal row depth: box depth - 2 outer walls
  const rowDepth = D - 2 * T;
  // Card fill physical height (sits on the box floor)
  const fillHeight = H * CARD_FILL_HEIGHT_RATIO;
  // Channel divider height — slightly taller than the card fill to separate rows
  const channelDividerHeight = H * 0.92;
  // Set divider height — capped at the box height (10 cm), no overhang
  const setDividerHeight = H;

  // X position of each internal row's left edge (just inside the outer wall)
  const rowLeftX = (rowIndex: number): number =>
    T + rowIndex * (rowWidth + T);

  // X position of each internal channel divider's center
  const channelDividerX = (dividerIndex: number): number =>
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
      <mesh position={[W / 2, T / 2, D / 2]}>
        <boxGeometry args={[W, T, D]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>

      {/* Left wall */}
      <mesh position={[T / 2, H / 2, D / 2]}>
        <boxGeometry args={[T, H, D]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
      {/* Right wall */}
      <mesh position={[W - T / 2, H / 2, D / 2]}>
        <boxGeometry args={[T, H, D]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
      {/* Front wall */}
      <mesh position={[W / 2, H / 2, T / 2]}>
        <boxGeometry args={[W - 2 * T, H, T]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
      {/* Back wall */}
      <mesh position={[W / 2, H / 2, D - T / 2]}>
        <boxGeometry args={[W - 2 * T, H, T]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>

      {/* Internal channel dividers — numRows - 1 of them, running front-to-back */}
      {Array.from({ length: numRows - 1 }).map((_, i) => (
        <mesh
          key={`channel-${i}`}
          position={[channelDividerX(i), channelDividerHeight / 2 + T, D / 2]}
        >
          <boxGeometry args={[T, channelDividerHeight, rowDepth]} />
          <meshStandardMaterial color={CHANNEL_DIVIDER_COLOR} />
        </mesh>
      ))}

      {/* Per-row card fills + set dividers */}
      {data?.rows.map((row) => {
        if (row.rowIndex >= numRows) return null;
        const leftX = rowLeftX(row.rowIndex);
        const rowCenterX = leftX + rowWidth / 2;

        // Reserve Z space for the set dividers so total (dividers + card fill)
        // never exceeds rowDepth.
        const runCount = row.setRuns.length;
        const dividerTotalZ = runCount * SET_DIVIDER_THICKNESS;
        const cardZAvailable = Math.max(rowDepth - dividerTotalZ, 0);
        const zPerSlot = cardZAvailable / ROW_CAPACITY_SLOTS;

        let zCursor = T; // starts inside the front wall

        return row.setRuns.map((run, runIdx) => {
          const dividerCenterZ = zCursor + SET_DIVIDER_THICKNESS / 2;
          const dividerCenterY = setDividerHeight / 2;
          const runZLength = run.slotCount * zPerSlot;
          const fillCenterZ =
            zCursor + SET_DIVIDER_THICKNESS + Math.max(runZLength, 0) / 2;

          const fillColor = run.fillColor ?? DEFAULT_FILL_COLOR;
          const dividerColor = run.dividerColor ?? DEFAULT_DIVIDER_COLOR;
          const node = (
            <group key={`r${row.rowIndex}-${runIdx}`}>
              {/* Set separator card */}
              <mesh position={[rowCenterX, dividerCenterY, dividerCenterZ]}>
                <boxGeometry
                  args={[rowWidth * 0.96, setDividerHeight, SET_DIVIDER_THICKNESS]}
                />
                <meshStandardMaterial color={dividerColor} />
              </mesh>

              {/* Card fill with card-stack texture */}
              {runZLength > 0 && (
                <CardFillMesh
                  position={[rowCenterX, T + fillHeight / 2, fillCenterZ]}
                  size={[rowWidth * 0.92, fillHeight, runZLength]}
                  color={fillColor}
                />
              )}
            </group>
          );
          zCursor += SET_DIVIDER_THICKNESS + runZLength;
          return node;
        });
      })}
    </group>
  );
}

interface CardFillMeshProps {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
}

/**
 * A single card-stack block. Pulls a cloned card-stack texture keyed to its
 * own Z (depth) length so every run gets the right stripe density for its
 * physical size — short runs show fewer card edges, long runs show more.
 */
function CardFillMesh({ position, size, color }: CardFillMeshProps) {
  const [, , zLength] = size;
  const texture = useMemo(() => cloneCardStackTexture(zLength), [zLength]);

  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} map={texture ?? undefined} />
    </mesh>
  );
}
