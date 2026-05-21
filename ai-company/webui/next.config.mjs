/** @type {import('next').NextConfig} */
const nextConfig = {
  // dev 시 다른 IP (직결 케이블/Tailscale) 에서 접근 허용
  allowedDevOrigins: [
    "169.254.190.8",
    "100.92.46.59",
    "100.97.201.38",
    "192.168.8.0/24",
  ],
};

export default nextConfig;
