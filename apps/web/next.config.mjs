/** @type {import('next').NextConfig} */
const nextConfig = {
  // `standalone` output is for the self-hosted Docker image (apps/web/Dockerfile).
  // On Vercel it breaks output file tracing (onBuildComplete cannot find
  // next-server.js.nft.json) and Vercel packages functions itself, so skip it there.
  output: process.env.VERCEL ? undefined : "standalone",
};

export default nextConfig;
