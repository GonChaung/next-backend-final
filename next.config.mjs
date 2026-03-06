/** @type {import('next').NextConfig} */

const nextConfig = {
  reactCompiler: true,
  // Rewrite /api/books to /api/book so the exam-required paths work
  async rewrites() {
    return [
      {
        source: "/api/books",
        destination: "/api/book",
      },
      {
        source: "/api/books/:id",
        destination: "/api/book/:id",
      },
    ];
  },
};

export default nextConfig;
