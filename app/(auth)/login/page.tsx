"use client";
import { Suspense } from "react";
import { PinLockScreen } from "@/components/auth/pin-lock-screen";

export default function LoginPage() {
  return (
    <Suspense>
      <PinLockScreen callbackUrl="/" />
    </Suspense>
  );
}