import type { Context, PluginDefinition } from '@yaakapp/api';
import type {
  CallHttpRequestActionArgs,
  FormInput,
} from '@yaakapp/api/lib/bindings/gen_events';
import { readFileSync } from 'node:fs';
import { extractText, extractMeta, parseSSEEvents, detectProvider, PROVIDERS, type CustomRule } from './sse';

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

const STORE_KEY = 'custom-rules';

export const plugin: PluginDefinition = {
  filter: {
    name: 'SSE',
    description:
      'Parse SSE streaming responses (Claude / ChatGPT / Gemini / auto / custom JSON path)',
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
      label: 'SSE › Parse (Auto Detect)',
      icon: 'eye',
      async onSelect(ctx, args) {
        try {
          await parseAndShow(ctx, args, 'auto');
        } catch (err) {
          await ctx.toast.show({ message: `Failed to parse SSE: ${err}`, color: 'danger' });
        }
      },
    },
    {
      label: 'SSE › Parse (Select Provider)',
      icon: 'search',
      async onSelect(ctx: Context, args: CallHttpRequestActionArgs) {
        try {
          const builtinOptions = Object.entries(PROVIDERS).map(([key, p]) => ({
            label: p.name,
            value: key,
          }));
          const customRules = (await ctx.store.get<CustomRule[]>(STORE_KEY)) ?? [];
          const customOptions = customRules.map((r) => ({
            label: `${r.name} (${r.path})`,
            value: r.path,
          }));

          const allOptions = customOptions.length > 0
            ? [...builtinOptions, ...customOptions]
            : builtinOptions;

          const result = await ctx.prompt.form({
            id: 'sse-select-provider',
            title: 'Select Provider',
            confirmText: 'Parse',
            cancelText: 'Cancel',
            inputs: [
              {
                type: 'select',
                name: 'provider',
                label: 'Provider',
                options: allOptions,
                defaultValue: allOptions[0].value,
              },
            ],
          });

          if (result == null) return;
          const provider = (result.provider as string) || allOptions[0].value;
          await parseAndShow(ctx, args, provider);
        } catch (err) {
          await ctx.toast.show({ message: `Failed to parse: ${err}`, color: 'danger' });
        }
      },
    },
    {
      label: 'SSE › Add Custom Rule',
      icon: 'plus',
      async onSelect(ctx: Context, _args: CallHttpRequestActionArgs) {
        try {
          const rules = (await ctx.store.get<CustomRule[]>(STORE_KEY)) ?? [];

          const rulesMd = rules.length > 0
            ? [
                '| # | Name | JSON Path |',
                '|---|------|-----------|',
                ...rules.map((r, i) => `| ${i + 1} | ${r.name} | \`${r.path}\` |`),
              ].join('\n')
            : '_No custom rules yet._';

          const result = await ctx.prompt.form({
            id: 'sse-add-rule',
            title: 'Add Custom Rule',
            confirmText: 'Add',
            cancelText: 'Cancel',
            inputs: [
              { type: 'banner', color: 'info', inputs: [{ type: 'markdown', content: rulesMd }] },
              { type: 'text', name: 'new_name', label: 'Rule Name', placeholder: 'My Rule' },
              { type: 'text', name: 'new_path', label: 'JSON Path', placeholder: 'choices[0].delta.content' },
            ],
          });

          if (result == null) return;

          const newName = (result.new_name as string)?.trim();
          const newPath = (result.new_path as string)?.trim();
          if (!newName || !newPath) {
            await ctx.toast.show({ message: 'Please fill in both name and path', color: 'warning' });
            return;
          }
          if (rules.some((r) => r.name === newName)) {
            await ctx.toast.show({ message: `Rule "${newName}" already exists`, color: 'warning' });
            return;
          }

          await ctx.store.set(STORE_KEY, [...rules, { name: newName, path: newPath }]);
          await ctx.toast.show({ message: `Rule "${newName}" added`, icon: 'check', color: 'success' });
        } catch (err) {
          await ctx.toast.show({ message: `Error: ${err}`, color: 'danger' });
        }
      },
    },
    {
      label: 'SSE › Delete Custom Rule',
      icon: 'trash',
      async onSelect(ctx: Context, _args: CallHttpRequestActionArgs) {
        try {
          const rules = (await ctx.store.get<CustomRule[]>(STORE_KEY)) ?? [];
          if (rules.length === 0) {
            await ctx.toast.show({ message: 'No custom rules to delete', color: 'info' });
            return;
          }

          const options = rules.map((r) => ({ label: `${r.name} (${r.path})`, value: r.name }));
          const result = await ctx.prompt.form({
            id: 'sse-delete-rule',
            title: 'Delete Custom Rule',
            confirmText: 'Delete',
            cancelText: 'Cancel',
            inputs: [
              {
                type: 'select',
                name: 'rule',
                label: 'Select rule to delete',
                options,
                defaultValue: options[0].value,
              },
            ],
          });

          if (result == null) return;

          const deleteName = (result.rule as string) || options[0].value;
          const updated = rules.filter((r) => r.name !== deleteName);
          await ctx.store.set(STORE_KEY, updated);
          await ctx.toast.show({ message: `Rule "${deleteName}" deleted`, icon: 'trash', color: 'success' });
        } catch (err) {
          await ctx.toast.show({ message: `Error: ${err}`, color: 'danger' });
        }
      },
    },
  ],
};
