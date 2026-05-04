// Mission objects 미리보기 — admin form 의 Preview 버튼이 띄우는 모달.
//
// PandaV3Scene 을 missionObjects prop 으로 마운트.  키보드 조작 안 함 — 단순
// 시각적 검증.  중력 ON 이라서 객체 떨어지는 모습 + 충돌 거동 확인 가능.

'use client';

import { useRef } from 'react';
import { X } from 'lucide-react';
import { PandaV3Scene } from '@/components/3d-studio/PandaV3Scene';
import { usePandaV3Controls } from '@/hooks/usePandaV3Controls';
import type { PandaV3FrameSnapshot } from '@/hooks/useMujocoPhysicsPandaV3';
import type { MissionObject } from '@/lib/missions/types';

export default function MissionPreview({
  objects,
  onClose,
}: {
  objects: MissionObject[];
  onClose: () => void;
}) {
  const controls = usePandaV3Controls();
  const frameDataRef = useRef<PandaV3FrameSnapshot | null>(null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative h-[80vh] w-[90vw] max-w-[1200px] overflow-hidden rounded-[12px] border border-[#1f1f1f] bg-[#0A0A0F]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
          <span className="rounded-full bg-[#7C5CFC]/20 px-3 py-1 font-manrope text-[11px] font-medium text-[#a48dff]">
            Preview · {objects.length} object{objects.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex size-[28px] items-center justify-center rounded-full bg-black/50 text-[#737780] hover:bg-black/80 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
        <PandaV3Scene
          controls={controls}
          frameDataRef={frameDataRef}
          missionObjects={objects}
        />
      </div>
    </div>
  );
}
