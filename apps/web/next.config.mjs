/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@sfera/shared"],
  output: "standalone",
};

export default nextConfig;
