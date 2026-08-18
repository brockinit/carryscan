import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/** @type {import('eslint').Linter.Config[]} */
const config = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  ...coreWebVitals,
  ...typescript,
  {
    // eslint-plugin-react-hooks v6 (React 19 / React Compiler era) newly enables
    // these rules. They flag intentional, pre-existing patterns here — hydrating
    // state from localStorage on mount (unavailable during SSR/render) and a
    // callback ref kept in sync. Keep them off so a dependency bump does not
    // force an unrelated refactor of working UI logic.
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
    },
  },
];

export default config;
