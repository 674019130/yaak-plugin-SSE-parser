# SSE Response Parser

A [Yaak](https://yaak.app) plugin that parses Server-Sent Events (SSE) streaming responses from LLM APIs into readable text, with metadata extraction and custom rule support.

## Supported Providers

- **Claude** (Anthropic) - `content_block_delta` / `text_delta`
- **ChatGPT** (OpenAI) - `chat.completion.chunk` / `choices[0].delta.content`
- **Gemini** (Google) - `candidates[0].content.parts[0].text`
- **Custom** - any SSE format via user-defined JSON path rules

## Usage

### Response Filter

Type one of the following in the response filter box:

| Input | Description |
|-------|-------------|
| `auto` | Auto-detect provider format |
| `claude` | Parse Anthropic streaming response |
| `chatgpt` | Parse OpenAI streaming response |
| `gemini` | Parse Google Gemini streaming response |
| `choices[0].delta.content` | Custom JSON path per SSE event |

### Right-Click Actions

Right-click on any HTTP request to access:

| Action | Description |
|--------|-------------|
| **SSE > Parse (Auto Detect)** | Auto-detect provider and parse response |
| **SSE > Parse (Select Provider)** | Choose from built-in providers + custom rules |
| **SSE > Add Custom Rule** | Add a named JSON path rule (persisted) |
| **SSE > Delete Custom Rule** | Remove a saved custom rule |

### Parse Result Dialog

After parsing, a dialog shows:

- **Model** and provider name
- **Token usage** (input / output)
- **Text stats** (chars, words, lines)
- **Search queries** (Claude web search)
- **Event type distribution** (collapsible)
- **Thinking content** (Claude extended thinking, collapsible)
- **Parsed content** with "Copy Content" button

### Custom Rules

Custom rules let you save reusable JSON path expressions with a friendly name. They persist across sessions via Yaak's built-in store.

1. Right-click a request > **SSE > Add Custom Rule**
2. Enter a name (e.g., "My API") and a JSON path (e.g., `data.text`)
3. The rule appears in **SSE > Parse (Select Provider)** dropdown alongside built-in providers

JSON path supports dot notation, bracket indices, and optional `$.` prefix:
- `choices[0].delta.content`
- `$.candidates[0].content.parts[0].text`
- `data.text`

## Installation

Install from the [Yaak Plugin Directory](https://yaak.app/plugins), or for local development:

```bash
git clone https://github.com/674019130/yaak-plugin-SSE-parser.git
cd yaak-plugin-SSE-parser
npm install
npm run dev
```

## License

MIT
