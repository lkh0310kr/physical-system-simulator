import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "apps/*/src/**/*.test.ts",
      "apps/*/server/**/*.test.ts",
    ],
    passWithNoTests: true,
    // 시뮬레이션을 여러 번 도는 테스트(스윕·탐색·로봇)가 느린 CI 러너에서 5초를 넘기지 않게
    testTimeout: 30_000,
  },
});
