// Condition / mission 의 자연어 표현 — UI 어디서나 import 해서 사람-친화 sentence 생성.
//
// BEHAVIOR-1K BDDL 술어 스타일에서 영감.  코드의 schema 그대로 노출하지 않고
// "When obj_1 enters the green region" 같이 읽힘.

import type { Condition, Region } from './types';

/** Region 한 줄 표현 — "sphere r=5cm @ (0.4, 0, 0.05)" 같은 식. */
export function describeRegion(r: Region): string {
  if (r.kind === 'sphere') {
    const [cx, cy, cz] = r.center;
    return `sphere r=${(r.radius * 100).toFixed(1)}cm @ (${cx.toFixed(2)}, ${cy.toFixed(2)}, ${cz.toFixed(2)})`;
  }
  return `box (${r.min.map((n) => n.toFixed(2)).join(', ')}) → (${r.max.map((n) => n.toFixed(2)).join(', ')})`;
}

/**
 * 한 줄 자연어 — sidebar / inspector 에 표시 용.  영어 + 한국어 혼용 (지금
 * 우리 admin UX 톤과 일치).
 */
export function describeCondition(c: Condition): string {
  switch (c.type) {
    case 'position': {
      const where = c.region.kind === 'sphere'
        ? `반경 ${(c.region.radius * 100).toFixed(0)}cm 의 구역`
        : `박스 영역`;
      return `${c.target || '객체'} 가 ${where} 에 들어가면`;
    }
    case 'orientation': {
      const [rx, ry, rz] = c.eulerTarget.map((r) => Math.round((r * 180) / Math.PI));
      return `${c.target || '객체'} 가 (${rx}°, ${ry}°, ${rz}°) 자세로 (±${c.toleranceDeg}°)`;
    }
    case 'atRest':
      return `${c.target || '객체'} 가 정지 (속도 < ${c.velThreshold} m/s)`;
    case 'held':
      return `그리퍼가 ${c.target || '객체'} 를 잡으면 (${(c.nearDist * 100).toFixed(0)}cm 이내)`;
    case 'stackedOn':
      return `${c.upper || '?'} 가 ${c.lower || '?'} 위에 쌓이면`;
    case 'distance':
      return `${c.a || '?'} 와 ${c.b || '?'} 의 거리가 ${c.op} ${(c.dist * 100).toFixed(0)}cm`;
  }
}

/** 더 짧은 한 단어 라벨 (badge 용). */
export function shortLabel(c: Condition): string {
  switch (c.type) {
    case 'position':    return '위치';
    case 'orientation': return '자세';
    case 'atRest':      return '정지';
    case 'held':        return '잡힘';
    case 'stackedOn':   return '쌓임';
    case 'distance':    return '거리';
  }
}

/** 색상 역할 — Unreal TriggerBox 컨벤션. */
export function conditionColor(role: 'success' | 'fail'): string {
  return role === 'success' ? '#22c55e' : '#ef4444';
}
