# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the TypeScript source.
- `src/index.ts` is the plugin entry point (`plugin` export) and wires UI actions to parsing.
- `src/sse.ts` contains SSE parsing, provider detection, metadata extraction, and JSON path resolution.
- `build/` is generated output from `yaakcli build` (compiled CommonJS).
- `package.json` defines the Yaak plugin package and scripts.

## Build, Test, and Development Commands
- `npm run dev` starts `yaakcli dev` with watch for local plugin development.
- `npm run build` runs `yaakcli build` to produce `build/index.js` for Yaak runtime.
- No test or lint scripts are configured.

## Coding Style & Naming Conventions
- TypeScript with ES module imports and semicolons.
- 2-space indentation as used in `src/index.ts` and `src/sse.ts`.
- Use `camelCase` for variables/functions, `PascalCase` for types and interfaces.
- Provider keys are lowercase strings (`claude`, `chatgpt`, `gemini`).
- User-facing text uses proper capitalization (Claude, ChatGPT, Gemini).
- Menu labels use `SSE ›` prefix for visual grouping.

## Testing Guidelines
- No automated tests are currently set up.
- When adding tests, keep them close to parsing behavior (e.g., fixtures of SSE payloads) and document how to run them in `package.json`.

## Commit & Pull Request Guidelines
- Commit messages follow conventional commits: `feat:`, `fix:`, `docs:`, etc.
- PRs should include a brief description, the reason for the change, and any UI behavior changes (toast messages, prompts, action labels).

## Architecture Notes
- `extractText()` in `src/sse.ts` is the primary API for parsing SSE payloads.
- `extractMeta()` in `src/sse.ts` extracts model, tokens, thinking, and search queries.
- UI actions in `src/index.ts` read response bodies from disk and display results in a form dialog.
- Custom rules are persisted via `ctx.store` (Yaak's built-in key-value store) under key `custom-rules`.
- Yaak's `FormInputSelectOption` uses `{ label, value }` (NOT `{ name, value }`).
- Select form `defaultValue` may not work — always fallback with `|| options[0].value`.

## Agent-Specific Instructions
- See `CLAUDE.md` for additional maintainer notes and architecture details.
