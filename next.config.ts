import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Next.js 16 defaults reactStrictMode=true in dev. r3f <Canvas> calls
  // renderer.forceContextLoss() on unmount, and StrictMode's double-mount
  // leaves the <canvas> stuck in lost-context state (blank viewport +
  // "THREE.WebGLRenderer: Context Lost." in console). Disable to keep
  // WebGL alive; prod builds don't double-mount anyway.
  reactStrictMode: false,
  images: {
    unoptimized: true,
  },
  productionBrowserSourceMaps: false,
  // MuJoCo WASM is loaded from CDN at runtime, not bundled
};

export default nextConfig;
