# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Yaak plugin (`@su-su/yaak-plugin-sse-parser`) that parses Server-Sent Events (SSE) streaming responses from LLM providers (Claude/ChatGPT/Gemini) into readable text with metadata extraction and custom rule management. Built against the `@yaakapp/api` plugin SDK.

## Commands

- **Build:** `npm run build` (runs `yaakcli build`)
- **Dev mode:** `npm run dev` (runs `yaakcli dev` with watch)
- No test or lint scripts configured.

## Architecture

Two source files, single entry point:

- `src/index.ts` — Plugin definition (`PluginDefinition`). Exports a `plugin` object with:
  - `filter` — Response panel filter (named "SSE") that calls `extractText()` with the payload and user-supplied filter expression
  - `httpRequestActions` — Four right-click context menu actions:
    - **SSE > Parse (Auto Detect)** — auto-detect provider, parse and show result dialog
    - **SSE > Parse (Select Provider)** — select form combining built-in providers + custom rules from `ctx.store`
    - **SSE > Add Custom Rule** — form to create a named JSON path rule, persisted via `ctx.store`
    - **SSE > Delete Custom Rule** — select form to remove a saved rule from `ctx.store`
  - `parseAndShow()` — Shared helper that reads response body, parses SSE, extracts metadata, and shows a rich result dialog with copy-to-clipboard

- `src/sse.ts` — Core parsing logic:
  - `CustomRule` — Interface for user-defined parse rules (`{ name, path }`)
  - `parseSSEEvents(raw)` — Splits raw SSE text into `SSEEvent[]` (handles `event:` and `data:` lines, skips `[DONE]`)
  - `PROVIDERS` — Registry of built-in providers (`claude`, `chatgpt`, `gemini`), each with an `extract(data) => string | null` function
  - `detectProvider(events)` — Heuristic auto-detection by inspecting parsed JSON fields
  - `resolvePath(obj, path)` — Simple JSON path resolver (dot notation + bracket indices, optional `$.` prefix)
  - `extractText(payload, filterExpr)` — Main entry: parses events, resolves filter to a provider or custom path, extracts and joins text chunks
  - `extractMeta(events, provider)` — Extracts metadata: model name, token usage, event types, thinking content, search queries

## Key Patterns

- Filter expressions: `claude`, `chatgpt`, `gemini`, `auto`, or a custom JSON path like `choices[0].delta.content`
- Provider detection order: checks for `content_block_delta`/`message_start` (Claude), `chat.completion.chunk` (ChatGPT), `candidates` array (Gemini)
- Custom rules stored via `ctx.store.get/set<CustomRule[]>('custom-rules')`
- Menu items use `SSE ›` prefix for visual grouping in the right-click menu
- All action handlers use try/catch with toast notifications for user feedback
- Select form `defaultValue` may not work in Yaak — use `|| options[0].value` fallback when reading results

## Build Output

`build/index.js` — Compiled CommonJS output consumed by Yaak runtime. Built by `yaakcli build`.
