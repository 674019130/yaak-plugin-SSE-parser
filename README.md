# SSE Response Parser

Parse SSE streaming responses from LLM APIs into readable text.

## Supported Providers

- **Claude** (Anthropic)
- **ChatGPT** (OpenAI)
- **Gemini** (Google)
- **Custom** - any SSE format via JSON path expression

## Usage

### Response Filter

Type one of the following in the response filter box:

| Input | Description |
|-------|-------------|
| `claude` | Parse Anthropic streaming response |
| `chatgpt` | Parse OpenAI streaming response |
| `gemini` | Parse Google Gemini streaming response |
| `auto` | Auto-detect provider format |
| `choices[0].delta.content` | Custom JSON path per SSE event |

### Right-click Actions

Right-click on any request to access:

- **Parse SSE → Copy Text (Auto Detect)**
- **Parse SSE → Copy Text (Claude)**
- **Parse SSE → Copy Text (ChatGPT)**
- **Parse SSE → Copy Text (Gemini)**

## Custom Path

For unsupported providers, use a dot-notation path to extract content from each SSE `data:` JSON object. Supports array indices like `results[0].text` and optional `$.` prefix.
