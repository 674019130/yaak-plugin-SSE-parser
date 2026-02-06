# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the TypeScript source.
- `src/index.ts` is the plugin entry point (`plugin` export) and wires UI actions to parsing.
- `src/sse.ts` contains SSE parsing, provider detection, and JSON path resolution.
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

## Testing Guidelines
- No automated tests are currently set up.
- When adding tests, keep them close to parsing behavior (e.g., fixtures of SSE payloads) and document how to run them in `package.json`.

## Commit & Pull Request Guidelines
- This repo does not include Git history in the workspace, so no commit convention can be inferred.
- If you introduce a convention, document it here (e.g., `feat: ...`, `fix: ...`).
- PRs should include a brief description, the reason for the change, and any UI behavior changes (toast messages, prompts, action labels).

## Architecture Notes
- `extractText()` in `src/sse.ts` is the primary API for parsing SSE payloads.
- UI actions in `src/index.ts` read response bodies from disk and copy parsed output to clipboard.

## Agent-Specific Instructions
- See `CLAUDE.md` for additional maintainer notes and architecture details.
