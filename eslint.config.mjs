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
    // Stryker's sandbox copies of the repo and its reports (npm run test:mutation).
    ".stryker-tmp/**",
    "reports/**",
    // Vendor output from the design tool the booking-page handoff was exported
    // from — a reference document, not source we maintain. It ships React 17
    // idioms and a bundled `module` assignment that this config rightly rejects
    // in our own code.
    "design_handoff_booking_page/**",
  ]),
  {
    rules: {
      // A leading underscore is the deliberate "destructured only to drop it"
      // signal — e.g. pulling `fill` off next/image props in a test mock.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // One-off Node scripts, run directly with `node scripts/x.js`. The package
    // is not "type": "module", so require() is the correct call here —
    // rewriting these as ESM imports would stop them running.
    files: ["scripts/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
