/** @type {import('next').NextConfig} */
const nextConfig = {
  // allows a production build alongside a running dev server (NEXT_DIST_DIR=.next-build npm run build)
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
