// MissionObject[] → MuJoCo XML body 스니펫 생성 + base scene.xml 에 주입.
//
// MuJoCo Z-up 기준.  size 의미는 type 별로 다름:
//   - box:      [hx, hy, hz]  half-extents
//   - sphere:   [r, ?, ?]     size[0] 만 사용
//   - cylinder: [r, h, ?]     size[0]=radius, size[1]=half-height
//
// 각 object 는 freejoint 로 자유 운동 (중력에 떨어지고 그리퍼와 충돌).
// Mass / color 는 mission spec 그대로.  body name = `m_<id>` (충돌 회피 prefix).

import type { MissionObject, ObjectType } from './types';

/** "0.7C5CFC" hex → "0.49 0.36 0.99 1" rgba string. */
function hexToRgba(hex: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return '0.5 0.5 0.5 1';
  const v = m[1];
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} 1`;
}

/** MuJoCo geom size string for an object type. */
function geomSize(type: ObjectType, s: [number, number, number]): string {
  switch (type) {
    case 'box':      return `${s[0]} ${s[1]} ${s[2]}`;
    case 'sphere':   return `${s[0]}`;
    case 'cylinder': return `${s[0]} ${s[1]}`;
  }
}

/** MuJoCo body name for a mission object — `m_` prefix avoids collision
 *  with built-in panda body names. */
export function missionBodyName(id: string): string {
  return `m_${id}`;
}

/** Build a `<body>` XML snippet for a single mission object. */
function bodyXmlForObject(o: MissionObject): string {
  const [px, py, pz] = o.initialPos;
  const [qw, qx, qy, qz] = o.initialQuat;
  const rgba = hexToRgba(o.color);
  const size = geomSize(o.type, o.size);
  const name = missionBodyName(o.id);
  return [
    `    <body name="${name}" pos="${px} ${py} ${pz}" quat="${qw} ${qx} ${qy} ${qz}">`,
    `      <freejoint/>`,
    `      <geom type="${o.type}" size="${size}" rgba="${rgba}" mass="${o.mass}"`,
    `            friction="1 0.05 0.001" condim="4"/>`,
    `    </body>`,
  ].join('\n');
}

/**
 * Inject mission object bodies into a base MuJoCo scene XML.
 *
 * 단순 substring 주입 — `</worldbody>` 직전에 새 body XML 추가.  완전한
 * XML parser 가 필요해지면 fast-xml-parser 같은 거 도입.  지금은 우리 base
 * scene.xml 만 다루므로 충분.
 *
 * 반환: 새 XML 문자열.  base 가 변형되지 않음.
 */
export function buildMissionSceneXml(
  baseSceneXml: string,
  objects: MissionObject[],
): string {
  if (objects.length === 0) return baseSceneXml;

  const bodyBlocks = objects.map(bodyXmlForObject).join('\n');
  const closeTag = '</worldbody>';
  const idx = baseSceneXml.lastIndexOf(closeTag);
  if (idx < 0) {
    // worldbody 없으면 그냥 mujoco close 직전에 새 worldbody 추가.
    const mjClose = baseSceneXml.lastIndexOf('</mujoco>');
    if (mjClose < 0) return baseSceneXml;
    return (
      baseSceneXml.slice(0, mjClose) +
      `\n  <worldbody>\n${bodyBlocks}\n  </worldbody>\n` +
      baseSceneXml.slice(mjClose)
    );
  }
  return (
    baseSceneXml.slice(0, idx) +
    bodyBlocks + '\n  ' +
    baseSceneXml.slice(idx)
  );
}
