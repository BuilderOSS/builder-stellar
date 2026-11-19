// The docs follow the app's lint rules. Its DESIGN.md guardrails (no inline style objects,
// no hex literals) match src/app, src/components and src/lib here too.
import webConfig from '../web/eslint.config.mjs';

const config = [...webConfig, { ignores: ['styled-system/**', '.next/**', 'out/**', 'public/pagefind/**'] }];

export default config;
