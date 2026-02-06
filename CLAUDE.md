# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Yaak plugin (`@susu/yaak-plugin-sse-parser`) that parses Server-Sent Events (SSE) streaming responses from LLM providers (Claude/ChatGPT/Gemini) into readable text. Built against the `@yaakapp/api` plugin SDK.

## Commands

- **Build:** `npm run build` (runs `yaakcli build`)
- **Dev mode:** `npm run dev` (runs `yaakcli dev` with watch)
- No test or lint scripts configured.

## Architecture

Two source files, single entry point:

- `src/index.ts` — Plugin definition (`PluginDefinition`). Exports a `plugin` object with:
  - `filter` — Response panel filter (named "SSE") that calls `extractText()` with the payload and user-supplied filter expression
  - `httpRequestActions` — Right-click context menu actions that read response body from disk via `readFileSync(response.bodyPath)`, extract text, and copy to clipboard via `ctx.clipboard.copyText()`

- `src/sse.ts` — Core parsing logic:
  - `parseSSEEvents(raw)` — Splits raw SSE text into `SSEEvent[]` (handles `event:` and `data:` lines, skips `[DONE]`)
  - `PROVIDERS` — Registry of built-in providers (`claude`, `chatgpt`, `gemini`), each with an `extract(data) => string | null` function
  - `detectProvider(events)` — Heuristic auto-detection by inspecting parsed JSON fields
  - `resolvePath(obj, path)` — Simple JSON path resolver (dot notation + bracket indices, optional `$.` prefix)
  - `extractText(payload, filterExpr)` — Main entry: parses events, resolves filter to a provider or custom path, extracts and joins text chunks

## Key Patterns

- Filter expressions: `claude`, `chatgpt`, `gemini`, `auto`, or a custom JSON path like `choices[0].delta.content`
- Provider detection order: checks for `content_block_delta`/`message_start` (Claude), `chat.completion.chunk` (ChatGPT), `candidates` array (Gemini)
- Actions use `(ctx as any).httpResponse.find()` — the type cast works around incomplete SDK typings
- All action handlers return structured `{ content, error? }` and show toast notifications for user feedback

## Build Output

`build/index.js` — Compiled CommonJS output consumed by Yaak runtime. Built by `yaakcli build`.
