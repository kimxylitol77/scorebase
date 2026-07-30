import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // git worktree 체크아웃 — 저장소 전체 사본이라 같은 오류가 두 번 잡힌다.
    ".worktrees/**",
  ]),
  // mac-mini·lightsail·vultr 워커와 일부 스크립트는 Node CJS 로 실행된다.
  // require() 는 버그가 아니라 그 런타임의 정상 문법이라 이 경로에서만 룰을 끈다.
  {
    files: [
      "mac-mini-worker/**/*.js",
      "lightsail-worker/**/*.js",
      "vultr-worker/**/*.js",
      "scripts/**/*.js",
      "ai-company/**/*.js",
    ],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
