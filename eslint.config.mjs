import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  // scripts/insta são utilitários de linha de comando em CommonJS puro, rodados à mão contra o
  // Chrome do operador (não entram no bundle do Next e não seguem as regras de módulo do app).
  globalIgnores([".next/**", "coverage/**", "playwright-report/**", "scripts/**", ".chrome-profile/**"]),
]);
