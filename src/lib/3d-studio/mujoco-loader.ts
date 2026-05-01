// src/lib/3d-studio/mujoco-loader.ts
// MuJoCo WASM 3.3.8 module structure:
// - MjModel, MjData (classes)
// - mj_step, mj_forward, mj_name2id, mj_resetData (functions)
// - mjtObj, mjtGeom, etc. (enums)
// - FS (Emscripten filesystem)
// Everything is directly on the module object. There is NO mjAPI sub-object.

/* eslint-disable @typescript-eslint/no-explicit-any */

let cached: any = null;
let loading: Promise<any> | null = null;

function injectScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).loadMujoco) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = '/wasm/mujoco_wasm.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load mujoco_wasm.js'));
    document.head.appendChild(script);
  });
}

export async function loadMujocoWASM(): Promise<any> {
  if (cached) return cached;
  if (loading) return loading;

  loading = (async () => {
    try {
      await injectScript();
      const loadMujoco = (window as any).loadMujoco;
      if (!loadMujoco) throw new Error('loadMujoco not found on window');

      cached = await loadMujoco();
      return cached;
    } catch (err) {
      loading = null; // Allow retry on next call
      throw err;
    }
  })();

  return loading;
}
