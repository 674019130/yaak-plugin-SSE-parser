// ============================================================
// SSE Event Types
// ============================================================

export interface CustomRule {
  name: string;
  path: string;
}

export interface SSEEvent {
  event?: string;
  data: string;
}

export interface Provider {
  name: string;
  extract: (data: any) => string | null;
}

// ============================================================
// Built-in Providers
// ============================================================

export const PROVIDERS: Record<string, Provider> = {
  claude: {
    name: 'Claude (Anthropic)',
    extract(data: any): string | null {
      if (
        data.type === 'content_block_delta' &&
        data.delta?.type === 'text_delta'
      ) {
        return data.delta.text ?? null;
      }
      return null;
    },
  },

  chatgpt: {
    name: 'ChatGPT (OpenAI)',
    extract(data: any): string | null {
      const content = data.choices?.[0]?.delta?.content;
      return content != null ? content : null;
    },
  },

  gemini: {
    name: 'Gemini (Google)',
    extract(data: any): string | null {
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return text != null ? text : null;
    },
  },
};

// ============================================================
// SSE Parser
// ============================================================

export function parseSSEEvents(raw: string): SSEEvent[] {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n\n+/);
  const events: SSEEvent[] = [];

  for (const block of blocks) {
    if (!block.trim()) continue;

    let event: string | undefined;
    const dataLines: string[] = [];

    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim();
      } else if (line.startsWith('data: ')) {
        dataLines.push(line.slice(6));
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5));
      }
      // skip id:, retry:, comments (:)
    }

    if (dataLines.length === 0) continue;

    const data = dataLines.join('\n');
    if (data === '[DONE]') continue;

    events.push({ event, data });
  }

  return events;
}

// ============================================================
// JSON Path Resolver (simple dot + bracket notation)
//
// Supports:
//   choices[0].delta.content
//   $.choices[0].delta.content
//   candidates[0].content.parts[0].text
//   delta.text
// ============================================================

export function resolvePath(obj: any, path: string): any {
  const clean = path.startsWith('$.') ? path.slice(2) : path;
  const tokens = clean.match(/[^.\[\]]+|\[\d+\]/g);
  if (!tokens) return undefined;

  let current = obj;
  for (const token of tokens) {
    if (current == null) return undefined;
    if (token.startsWith('[') && token.endsWith(']')) {
      current = current[parseInt(token.slice(1, -1), 10)];
    } else {
      current = current[token];
    }
  }
  return current;
}

// ============================================================
// Auto Detect Provider
// ============================================================

export function detectProvider(events: SSEEvent[]): string | null {
  for (const evt of events) {
    let parsed: any;
    try {
      parsed = JSON.parse(evt.data);
    } catch {
      continue;
    }

    if (parsed.type === 'content_block_delta') return 'claude';
    if (parsed.type === 'message_start') return 'claude';
    if (parsed.object === 'chat.completion.chunk') return 'chatgpt';
    if (Array.isArray(parsed.candidates)) return 'gemini';
  }
  return null;
}

// ============================================================
// Metadata Extraction
// ============================================================

export interface SSEMeta {
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  eventTypes: Record<string, number>;
  thinking: string | null;
  searchQueries: string[];
}

export function extractMeta(events: SSEEvent[], provider: string | null): SSEMeta {
  const meta: SSEMeta = {
    model: null,
    inputTokens: null,
    outputTokens: null,
    eventTypes: {},
    thinking: null,
    searchQueries: [],
  };

  const thinkingChunks: string[] = [];

  for (const evt of events) {
    // Count event types
    const evtType = evt.event ?? '(none)';
    meta.eventTypes[evtType] = (meta.eventTypes[evtType] ?? 0) + 1;

    let parsed: any;
    try {
      parsed = JSON.parse(evt.data);
    } catch {
      continue;
    }

    if (provider === 'claude') {
      if (parsed.type === 'message_start') {
        meta.model ??= parsed.message?.model ?? null;
        meta.inputTokens ??= parsed.message?.usage?.input_tokens ?? null;
      }
      if (parsed.type === 'message_delta') {
        meta.outputTokens ??= parsed.usage?.output_tokens ?? null;
      }
      // Thinking
      if (
        parsed.type === 'content_block_delta' &&
        parsed.delta?.type === 'thinking_delta'
      ) {
        thinkingChunks.push(parsed.delta.thinking ?? '');
      }
      // Search queries
      if (
        parsed.type === 'content_block_start' &&
        parsed.content_block?.type === 'server_tool_use' &&
        parsed.content_block?.name === 'web_search'
      ) {
        // query comes in input delta later
      }
      if (
        parsed.type === 'content_block_delta' &&
        parsed.delta?.type === 'input_json_delta'
      ) {
        // Accumulate — handled below
      }
      // Direct search event (some API versions)
      if (parsed.type === 'search_start' && parsed.query) {
        meta.searchQueries.push(parsed.query);
      }
    }

    if (provider === 'chatgpt') {
      meta.model ??= parsed.model ?? null;
      if (parsed.usage) {
        meta.inputTokens ??= parsed.usage.prompt_tokens ?? null;
        meta.outputTokens ??= parsed.usage.completion_tokens ?? null;
      }
    }

    if (provider === 'gemini') {
      meta.model ??= parsed.modelVersion ?? null;
      if (parsed.usageMetadata) {
        meta.inputTokens ??= parsed.usageMetadata.promptTokenCount ?? null;
        meta.outputTokens ??= parsed.usageMetadata.candidatesTokenCount ?? null;
      }
    }
  }

  // Also try extracting search queries from server_tool_use input blocks
  if (provider === 'claude') {
    let inSearchTool = false;
    let jsonBuf = '';
    for (const evt of events) {
      let parsed: any;
      try { parsed = JSON.parse(evt.data); } catch { continue; }

      if (
        parsed.type === 'content_block_start' &&
        parsed.content_block?.type === 'server_tool_use' &&
        parsed.content_block?.name === 'web_search'
      ) {
        inSearchTool = true;
        jsonBuf = '';
      } else if (parsed.type === 'content_block_stop' && inSearchTool) {
        try {
          const input = JSON.parse(jsonBuf);
          if (input.query) meta.searchQueries.push(input.query);
        } catch { /* ignore */ }
        inSearchTool = false;
        jsonBuf = '';
      } else if (
        inSearchTool &&
        parsed.type === 'content_block_delta' &&
        parsed.delta?.type === 'input_json_delta'
      ) {
        jsonBuf += parsed.delta.partial_json ?? '';
      }
    }
  }

  if (thinkingChunks.length > 0) {
    meta.thinking = thinkingChunks.join('');
  }

  return meta;
}

// ============================================================
// Main Extraction
// ============================================================

export function extractText(
  payload: string,
  filterExpr: string,
): { content: string; error?: string } {
  const events = parseSSEEvents(payload);

  if (events.length === 0) {
    return { content: '', error: 'No SSE events found in response' };
  }

  // Resolve filter expression
  let expr = filterExpr.trim();

  // "auto" -> detect provider
  if (expr === 'auto' || expr === '') {
    const detected = detectProvider(events);
    if (!detected) {
      return {
        content: '',
        error:
          'Cannot auto-detect provider. Use: Claude, ChatGPT, Gemini, or a custom JSON path like choices[0].delta.content',
      };
    }
    expr = detected;
  }

  // Check built-in providers
  const provider = PROVIDERS[expr.toLowerCase()];

  const chunks: string[] = [];

  for (const evt of events) {
    let parsed: any;
    try {
      parsed = JSON.parse(evt.data);
    } catch {
      continue;
    }

    let value: any;
    if (provider) {
      value = provider.extract(parsed);
    } else {
      // Custom path
      value = resolvePath(parsed, expr);
    }

    if (value != null) {
      chunks.push(String(value));
    }
  }

  if (chunks.length === 0) {
    const hint = provider
      ? `No content extracted using "${expr}" preset`
      : `No content found at path "${expr}"`;
    return { content: '', error: hint };
  }

  return { content: chunks.join('') };
}
