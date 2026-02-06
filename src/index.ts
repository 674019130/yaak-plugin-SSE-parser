import type { Context, PluginDefinition } from '@yaakapp/api';
import type {
  CallHttpRequestActionArgs,
  FormInput,
} from '@yaakapp/api/lib/bindings/gen_events';
import { readFileSync } from 'node:fs';
import { extractText, extractMeta, parseSSEEvents, detectProvider, PROVIDERS } from './sse';

function countWords(text: string): number {
  const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g)?.length ?? 0;
  const latin = text.match(/[a-zA-Z0-9]+/g)?.length ?? 0;
  return cjk + latin;
}

async function parseAndShow(ctx: Context, args: CallHttpRequestActionArgs, mode: string) {
  const responses = await ctx.httpResponse.find({
    requestId: args.httpRequest.id,
    limit: 1,
  });
  const response = responses?.[0];
  if (!response?.bodyPath) {
    await ctx.toast.show({ message: 'No response found for this request', color: 'warning' });
    return;
  }
  const body = readFileSync(response.bodyPath, 'utf-8');
  const events = parseSSEEvents(body);
  const resolvedMode = mode === 'auto' ? (detectProvider(events) ?? mode) : mode;
  const result = extractText(body, mode);
  if (result.error) {
    await ctx.toast.show({ message: result.error, color: 'warning' });
    return;
  }

  const meta = extractMeta(events, resolvedMode);
  const providerLabel = PROVIDERS[resolvedMode]?.name ?? resolvedMode;
  const lineCount = result.content.split('\n').length;
  const words = countWords(result.content);
  const chars = result.content.length;

  // -- Build summary table (always show all rows, use dim placeholder for missing) --
  const dim = '`-`';
  const model = meta.model ? `\`${meta.model}\`` : dim;
  const inTok = meta.inputTokens != null ? `**${meta.inputTokens.toLocaleString()}** in` : dim;
  const outTok = meta.outputTokens != null ? `**${meta.outputTokens.toLocaleString()}** out` : dim;
  const queries = meta.searchQueries.length > 0
    ? meta.searchQueries.map((q) => `\`${q}\``).join(' , ')
    : dim;

  const summaryMd = [
    `| | |`,
    `|---|---|`,
    `| Model | ${model} · ${providerLabel} |`,
    `| Tokens | ${inTok} / ${outTok} |`,
    `| Text | **${chars.toLocaleString()}** chars · **${words.toLocaleString()}** words · **${lineCount.toLocaleString()}** lines |`,
    `| Search | ${queries} |`,
  ].join('\n');

  // -- Event distribution (one per line) --
  const evtLines = Object.entries(meta.eventTypes)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `\`${type}\` × ${count}`);
  const evtMd = evtLines.join('\n\n');

  // -- Build form inputs --
  const inputs: FormInput[] = [
    {
      type: 'banner',
      color: 'info',
      inputs: [{ type: 'markdown', content: summaryMd }],
    },
    {
      type: 'accordion',
      label: `Events (${events.length})`,
      inputs: [{ type: 'markdown', content: evtMd }],
    },
  ];

  if (meta.thinking) {
    inputs.push({
      type: 'accordion',
      label: `Thinking (${meta.thinking.length.toLocaleString()} chars)`,
      inputs: [
        {
          type: 'editor',
          name: 'thinking',
          hideLabel: true,
          defaultValue: meta.thinking,
          language: 'text',
          readOnly: true,
        },
      ],
    });
  }

  inputs.push({
    type: 'editor',
    name: 'content',
    label: 'Content',
    defaultValue: result.content,
    language: 'markdown',
    readOnly: true,
  });

  const confirmed = await ctx.prompt.form({
    id: 'sse-parsed-text',
    title: 'SSE Parsed Text',
    confirmText: 'Copy Content',
    cancelText: 'Close',
    inputs,
  });

  if (confirmed != null) {
    await ctx.clipboard.copyText(result.content);
    await ctx.toast.show({ message: 'Copied to clipboard', icon: 'copy', color: 'success' });
  }
}

export const plugin: PluginDefinition = {
  filter: {
    name: 'SSE',
    description:
      'Parse SSE streaming responses (claude / chatgpt / gemini / auto / custom path)',
    onFilter(_ctx, args) {
      const result = extractText(args.payload, args.filter);
      if (result.error) {
        return { content: result.content, error: result.error };
      }
      return { content: result.content };
    },
  },

  httpRequestActions: [
    {
      label: 'Parse SSE → Show Text (Auto Detect)',
      icon: 'eye',
      async onSelect(ctx, args) {
        try {
          await parseAndShow(ctx, args, 'auto');
        } catch (err) {
          await ctx.toast.show({ message: `Failed to parse SSE: ${err}`, color: 'danger' });
        }
      },
    },
    ...(['claude', 'chatgpt', 'gemini'] as const).map((key) => ({
      label: `Parse SSE → Show Text (${PROVIDERS[key].name})`,
      icon: 'eye' as const,
      async onSelect(ctx: Context, args: CallHttpRequestActionArgs) {
        try {
          await parseAndShow(ctx, args, key);
        } catch (err) {
          await ctx.toast.show({ message: `Failed to parse: ${err}`, color: 'danger' });
        }
      },
    })),
  ],
};
