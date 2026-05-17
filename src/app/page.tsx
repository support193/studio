// Standalone Franka Panda demo — single page at "/".  Pure client-side:
// MuJoCo WASM physics + diff-IK + null-space.  No login, no API, no DB.

'use client';

import { Suspense, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PandaV3Scene } from '@/components/3d-studio/PandaV3Scene';
import { usePandaV3Controls } from '@/hooks/usePandaV3Controls';
import type { PandaV3FrameSnapshot } from '@/hooks/useMujocoPhysicsPandaV3';

export default function PandaDemoPage() {
  return (
    <Suspense fallback={<div className="h-screen w-full bg-[#000]" />}>
      <PandaDemoInner />
    </Suspense>
  );
}

function PandaDemoInner() {
  const sp = useSearchParams();
  const promo = sp.get('promo') === '1';
  const [showHelp, setShowHelp] = useState(true);
  const [sensitivity, setSensitivity] = useState(100);
  const frameDataRef = useRef<PandaV3FrameSnapshot | null>(null);
  const controls = usePandaV3Controls();

  return (
    <div className={`relative w-full ${promo ? 'fixed inset-0 z-[9999] h-screen bg-black' : 'h-[calc(100vh-52px)] bg-[#0A0A0F]'}`}>
      {!promo && (
        <div className="pointer-events-none absolute inset-0 z-0 st-backdrop full">
          <div className="grid" />
        </div>
      )}
      <PandaV3Scene controls={controls} frameDataRef={frameDataRef} promo={promo} />
      {!promo && <>


      {/* Brand badge — top-left */}
      <div className="pointer-events-none absolute left-4 top-4 z-20 flex items-center gap-2">
        <div className="st-glass px-3 py-1.5 text-xs text-white">
          <span className="font-semibold tracking-wide text-[#5856d6]">ZenO</span>
          <span className="ml-1 text-[#8A8A9A]">Robot · Franka Panda</span>
        </div>
      </div>

      {/* Controls help — top-right, toggle */}
      {showHelp ? (
        <div className="st-glass absolute right-4 top-4 z-20 w-72 p-3 text-xs text-white">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#5856d6]">
              Controls
            </div>
            <button
              onClick={() => setShowHelp(false)}
              className="text-[10px] text-[#8A8A9A] hover:text-white"
            >
              hide
            </button>
          </div>
          <div className="space-y-1.5 leading-relaxed">
            <Row keys="W A S D" label="EE position (forward / left / back / right)" />
            <Row keys="Q  /  E" label="Up / Down" />
            <Row keys="Z  /  C" label="Wrist spin" />
            <Row keys="↑  /  ↓" label="Forward / back tilt" />
            <Row keys="←  /  →" label="Left / right tilt" />
            <Row keys="Space" label="Gripper open / closed" />
            <Row keys="R" label="Reset to home" />
            <Row keys="Mouse drag" label="Orbit camera" />
            <Row keys="Mouse wheel" label="Zoom" />
          </div>
          <div className="mt-3 border-t border-[var(--st-border)] pt-2 text-[10px] text-[#555]">
            Franka Panda · MuJoCo physics · diff-IK + null-space
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowHelp(true)}
          className="st-glass absolute right-4 top-4 z-20 px-3 py-1.5 text-xs text-[#8A8A9A] hover:text-white"
        >
          ? Controls
        </button>
      )}

      {/* Sensitivity slider — bottom-left */}
      <div className="st-glass absolute left-4 bottom-4 z-20 w-64 p-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#5856d6]">
            Speed
          </span>
          <span className="font-mono text-[10px] text-[#C0C0CC]">{sensitivity}%</span>
        </div>
        <input
          type="range"
          min={10}
          max={300}
          step={10}
          value={sensitivity}
          onChange={(e) => {
            const v = parseInt(e.target.value);
            setSensitivity(v);
            controls.setSensitivity(v);
          }}
          className="w-full accent-[#5856d6]"
        />
        <div className="mt-1 flex justify-between text-[9px] text-[#555]">
          <span>10%</span>
          <span>100%</span>
          <span>300%</span>
        </div>
      </div>
      </>}
    </div>
  );
}

function Row({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-mono text-[10px] text-[#5856d6]">{keys}</span>
      <span className="text-[10px] text-[#C0C0CC]">{label}</span>
    </div>
  );
}
