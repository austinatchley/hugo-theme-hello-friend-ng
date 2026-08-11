import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier";

export default defineConfig(
  {
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.test.ts"],
    extends: [tseslint.configs.recommended],
  },
  eslintConfigPrettier,
);