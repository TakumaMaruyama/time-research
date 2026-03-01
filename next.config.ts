import type { NextConfig } from "next";

const replitDomain = process.env.REPLIT_DOMAINS ?? "";
const allowedOrigins = replitDomain
  ? replitDomain.split(",").map((d) => d.trim())
  : [];

const nextConfig: NextConfig = {
  allowedDevOrigins: allowedOrigins,
};

export default nextConfig;
