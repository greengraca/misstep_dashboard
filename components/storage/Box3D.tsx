// components/storage/Box3D.tsx
/// <reference types="@react-three/fiber" />
"use client";

import { useState } from "react";
import { BOX_DIMENSIONS } from "./physical-config";
import type { BoxType } from "@/lib/storage";

interface Box3DProps {
  position: [number, number, number];
  type: BoxType;
  boxId: string;
  isSelected: boolean;
  onClick: (boxId: string) => void;
}

const BOX_COLOR = "#e9ddbe";
const BOX_HOVER_COLOR = "#f5eacb";
const BOX_SELECTED_COLOR = "#8c5a18";

export default function Box3D({ position, type, boxId, isSelected, onClick }: Box3DProps) {
  const [hovered, setHovered] = useState(false);
  const dim = BOX_DIMENSIONS[type];

  const color = isSelected
    ? BOX_SELECTED_COLOR
    : hovered
      ? BOX_HOVER_COLOR
      : BOX_COLOR;

  // Position is the bottom-left-front corner; mesh is centered, so offset by half-dims.
  const meshPosition: [number, number, number] = [
    position[0] + dim.width / 2,
    position[1] + dim.height / 2,
    position[2] + dim.depth / 2,
  ];

  return (
    <mesh
      position={meshPosition}
      onPointerEnter={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerLeave={() => {
        setHovered(false);
        document.body.style.cursor = "";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(boxId);
      }}
    >
      <boxGeometry args={[dim.width, dim.height, dim.depth]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}
