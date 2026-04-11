// components/storage/Box3D.tsx
/// <reference types="@react-three/fiber" />
"use client";

import { useState } from "react";
import {
  BOX_DIMENSIONS,
  BOX_WALL_THICKNESS,
  CARD_FILL_HEIGHT_RATIO,
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
const CHANNEL_DIVIDER_COLOR = "#d7ccac"; // internal row walls (cardboard)

// Divider and label geometry
const SET_DIVIDER_THICKNESS = 0.002; // 2mm separator card thickness
const SET_DIVIDER_HEIGHT_ABOVE_WALL = 0.015; // separator sticks 1.5cm above box walls

/**
 * Deterministic hash-based hue for a set code. Same code always produces
 * the same hue so color stays stable across rebuilds.
 */
function hueFor(setCode: string): number {
  let hash = 0;
  for (let i = 0; i < setCode.length; i++) {
    hash = (hash * 31 + setCode.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

/** Card fill color for a set — mid-lightness, mid-saturation. */
function setFillColor(setCode: string): string {
  return `hsl(${hueFor(setCode)} 55% 58%)`;
}

/** Darker shade of the same hue used for the set's front divider card. */
function setDividerColor(setCode: string): string {
  return `hsl(${hueFor(setCode)} 60% 32%)`;
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

  // Internal row slot width: (box width - 2 outer walls - (numRows-1) channel dividers) / numRows
  const rowWidth = (W - 2 * T - (numRows - 1) * T) / numRows;
  // Internal row depth: box depth - 2 outer walls
  const rowDepth = D - 2 * T;
  // Card fill physical height (sits on the box floor)
  const fillHeight = H * CARD_FILL_HEIGHT_RATIO;
  // Channel divider height — slightly taller than the card fill to separate rows
  const channelDividerHeight = H * 0.92;
  // Set divider total height — sticks above the box walls so the label is visible
  const setDividerHeight = H + SET_DIVIDER_HEIGHT_ABOVE_WALL;

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
          // 1. Set divider (vertical white card) at the start of this run
          const dividerCenterZ = zCursor + SET_DIVIDER_THICKNESS / 2;
          const dividerCenterY = setDividerHeight / 2;
          // 2. Card fill after the divider
          const runZLength = run.slotCount * zPerSlot;
          const fillCenterZ =
            zCursor + SET_DIVIDER_THICKNESS + Math.max(runZLength, 0) / 2;

          const node = (
            <group key={`r${row.rowIndex}-${runIdx}`}>
              {/* Set separator card — darker shade of the set's color */}
              <mesh position={[rowCenterX, dividerCenterY, dividerCenterZ]}>
                <boxGeometry
                  args={[rowWidth * 0.96, setDividerHeight, SET_DIVIDER_THICKNESS]}
                />
                <meshStandardMaterial color={setDividerColor(run.set)} />
              </mesh>

              {/* Card fill — mid shade of the set's color */}
              {runZLength > 0 && (
                <mesh
                  position={[rowCenterX, T + fillHeight / 2, fillCenterZ]}
                >
                  <boxGeometry
                    args={[rowWidth * 0.92, fillHeight, runZLength]}
                  />
                  <meshStandardMaterial color={setFillColor(run.set)} />
                </mesh>
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
