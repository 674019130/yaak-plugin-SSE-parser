"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  plugin: () => plugin
});
module.exports = __toCommonJS(index_exports);
var import_node_fs = require("node:fs");

// src/sse.ts
var PROVIDERS = {
  claude: {
    name: "Claude (Anthropic)",
    extract(data) {
      if (data.type === "content_block_delta" && data.delta?.type === "text_delta") {
        return data.delta.text ?? null;
      }
      return null;
    }
  },
  chatgpt: {
    name: "ChatGPT (OpenAI)",
    extract(data) {
      const content = data.choices?.[0]?.delta?.content;
      return content != null ? content : null;
    }
  },
  gemini: {
    name: "Gemini (Google)",
    extract(data) {
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return text != null ? text : null;
    }
  }
};
function parseSSEEvents(raw) {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalized.split(/\n\n+/);
  const events = [];
  for (const block of blocks) {
    if (!block.trim()) continue;
    let event;
    const dataLines = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data: ")) {
        dataLines.push(line.slice(6));
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5));
      }
    }
    if (dataLines.length === 0) continue;
    const data = dataLines.join("\n");
    if (data === "[DONE]") continue;
    events.push({ event, data });
  }
  return events;
}
function resolvePath(obj, path) {
  const clean = path.startsWith("$.") ? path.slice(2) : path;
  const tokens = clean.match(/[^.\[\]]+|\[\d+\]/g);
  if (!tokens) return void 0;
  let current = obj;
  for (const token of tokens) {
    if (current == null) return void 0;
    if (token.startsWith("[") && token.endsWith("]")) {
      current = current[parseInt(token.slice(1, -1), 10)];
    } else {
      current = current[token];
    }
  }
  return current;
}
function detectProvider(events) {
  for (const evt of events) {
    let parsed;
    try {
      parsed = JSON.parse(evt.data);
    } catch {
      continue;
    }
    if (parsed.type === "content_block_delta") return "claude";
    if (parsed.type === "message_start") return "claude";
    if (parsed.object === "chat.completion.chunk") return "chatgpt";
    if (Array.isArray(parsed.candidates)) return "gemini";
  }
  return null;
}
function extractMeta(events, provider) {
  const meta = {
    model: null,
    inputTokens: null,
    outputTokens: null,
    eventTypes: {},
    thinking: null,
    searchQueries: []
  };
  const thinkingChunks = [];
  for (const evt of events) {
    const evtType = evt.event ?? "(none)";
    meta.eventTypes[evtType] = (meta.eventTypes[evtType] ?? 0) + 1;
    let parsed;
    try {
      parsed = JSON.parse(evt.data);
    } catch {
      continue;
    }
    if (provider === "claude") {
      if (parsed.type === "message_start") {
        meta.model ??= parsed.message?.model ?? null;
        meta.inputTokens ??= parsed.message?.usage?.input_tokens ?? null;
      }
      if (parsed.type === "message_delta") {
        meta.outputTokens ??= parsed.usage?.output_tokens ?? null;
      }
      if (parsed.type === "content_block_delta" && parsed.delta?.type === "thinking_delta") {
        thinkingChunks.push(parsed.delta.thinking ?? "");
      }
      if (parsed.type === "content_block_start" && parsed.content_block?.type === "server_tool_use" && parsed.content_block?.name === "web_search") {
      }
      if (parsed.type === "content_block_delta" && parsed.delta?.type === "input_json_delta") {
      }
      if (parsed.type === "search_start" && parsed.query) {
        meta.searchQueries.push(parsed.query);
      }
    }
    if (provider === "chatgpt") {
      meta.model ??= parsed.model ?? null;
      if (parsed.usage) {
        meta.inputTokens ??= parsed.usage.prompt_tokens ?? null;
        meta.outputTokens ??= parsed.usage.completion_tokens ?? null;
      }
    }
    if (provider === "gemini") {
      meta.model ??= parsed.modelVersion ?? null;
      if (parsed.usageMetadata) {
        meta.inputTokens ??= parsed.usageMetadata.promptTokenCount ?? null;
        meta.outputTokens ??= parsed.usageMetadata.candidatesTokenCount ?? null;
      }
    }
  }
  if (provider === "claude") {
    let inSearchTool = false;
    let jsonBuf = "";
    for (const evt of events) {
      let parsed;
      try {
        parsed = JSON.parse(evt.data);
      } catch {
        continue;
      }
      if (parsed.type === "content_block_start" && parsed.content_block?.type === "server_tool_use" && parsed.content_block?.name === "web_search") {
        inSearchTool = true;
        jsonBuf = "";
      } else if (parsed.type === "content_block_stop" && inSearchTool) {
        try {
          const input = JSON.parse(jsonBuf);
          if (input.query) meta.searchQueries.push(input.query);
        } catch {
        }
        inSearchTool = false;
        jsonBuf = "";
      } else if (inSearchTool && parsed.type === "content_block_delta" && parsed.delta?.type === "input_json_delta") {
        jsonBuf += parsed.delta.partial_json ?? "";
      }
    }
  }
  if (thinkingChunks.length > 0) {
    meta.thinking = thinkingChunks.join("");
  }
  return meta;
}
function extractText(payload, filterExpr) {
  const events = parseSSEEvents(payload);
  if (events.length === 0) {
    return { content: "", error: "No SSE events found in response" };
  }
  let expr = filterExpr.trim();
  if (expr === "auto" || expr === "") {
    const detected = detectProvider(events);
    if (!detected) {
      return {
        content: "",
        error: "Cannot auto-detect provider. Use: Claude, ChatGPT, Gemini, or a custom JSON path like choices[0].delta.content"
      };
    }
    expr = detected;
  }
  const provider = PROVIDERS[expr.toLowerCase()];
  const chunks = [];
  for (const evt of events) {
    let parsed;
    try {
      parsed = JSON.parse(evt.data);
    } catch {
      continue;
    }
    let value;
    if (provider) {
      value = provider.extract(parsed);
    } else {
      value = resolvePath(parsed, expr);
    }
    if (value != null) {
      chunks.push(String(value));
    }
  }
  if (chunks.length === 0) {
    const hint = provider ? `No content extracted using "${expr}" preset` : `No content found at path "${expr}"`;
    return { content: "", error: hint };
  }
  return { content: chunks.join("") };
}

// src/index.ts
function countWords(text) {
  const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g)?.length ?? 0;
  const latin = text.match(/[a-zA-Z0-9]+/g)?.length ?? 0;
  return cjk + latin;
}
async function parseAndShow(ctx, args, mode) {
  const responses = await ctx.httpResponse.find({
    requestId: args.httpRequest.id,
    limit: 1
  });
  const response = responses?.[0];
  if (!response?.bodyPath) {
    await ctx.toast.show({ message: "No response found for this request", color: "warning" });
    return;
  }
  const body = (0, import_node_fs.readFileSync)(response.bodyPath, "utf-8");
  const events = parseSSEEvents(body);
  const resolvedMode = mode === "auto" ? detectProvider(events) ?? mode : mode;
  const result = extractText(body, mode);
  if (result.error) {
    await ctx.toast.show({ message: result.error, color: "warning" });
    return;
  }
  const meta = extractMeta(events, resolvedMode);
  const providerLabel = PROVIDERS[resolvedMode]?.name ?? resolvedMode;
  const lineCount = result.content.split("\n").length;
  const words = countWords(result.content);
  const chars = result.content.length;
  const dim = "`-`";
  const model = meta.model ? `\`${meta.model}\`` : dim;
  const inTok = meta.inputTokens != null ? `**${meta.inputTokens.toLocaleString()}** in` : dim;
  const outTok = meta.outputTokens != null ? `**${meta.outputTokens.toLocaleString()}** out` : dim;
  const queries = meta.searchQueries.length > 0 ? meta.searchQueries.map((q) => `\`${q}\``).join(" , ") : dim;
  const summaryMd = [
    `| | |`,
    `|---|---|`,
    `| Model | ${model} \xB7 ${providerLabel} |`,
    `| Tokens | ${inTok} / ${outTok} |`,
    `| Text | **${chars.toLocaleString()}** chars \xB7 **${words.toLocaleString()}** words \xB7 **${lineCount.toLocaleString()}** lines |`,
    `| Search | ${queries} |`
  ].join("\n");
  const evtLines = Object.entries(meta.eventTypes).sort((a, b) => b[1] - a[1]).map(([type, count]) => `\`${type}\` \xD7 ${count}`);
  const evtMd = evtLines.join("\n\n");
  const inputs = [
    {
      type: "banner",
      color: "info",
      inputs: [{ type: "markdown", content: summaryMd }]
    },
    {
      type: "accordion",
      label: `Events (${events.length})`,
      inputs: [{ type: "markdown", content: evtMd }]
    }
  ];
  if (meta.thinking) {
    inputs.push({
      type: "accordion",
      label: `Thinking (${meta.thinking.length.toLocaleString()} chars)`,
      inputs: [
        {
          type: "editor",
          name: "thinking",
          hideLabel: true,
          defaultValue: meta.thinking,
          language: "text",
          readOnly: true
        }
      ]
    });
  }
  inputs.push({
    type: "editor",
    name: "content",
    label: "Content",
    defaultValue: result.content,
    language: "markdown",
    readOnly: true
  });
  const confirmed = await ctx.prompt.form({
    id: "sse-parsed-text",
    title: "SSE Parsed Text",
    confirmText: "Copy Content",
    cancelText: "Close",
    inputs
  });
  if (confirmed != null) {
    await ctx.clipboard.copyText(result.content);
    await ctx.toast.show({ message: "Copied to clipboard", icon: "copy", color: "success" });
  }
}
var STORE_KEY = "custom-rules";
var plugin = {
  filter: {
    name: "SSE",
    description: "Parse SSE streaming responses (Claude / ChatGPT / Gemini / auto / custom JSON path)",
    onFilter(_ctx, args) {
      const result = extractText(args.payload, args.filter);
      if (result.error) {
        return { content: result.content, error: result.error };
      }
      return { content: result.content };
    }
  },
  httpRequestActions: [
    {
      label: "SSE \u203A Parse (Auto Detect)",
      icon: "eye",
      async onSelect(ctx, args) {
        try {
          await parseAndShow(ctx, args, "auto");
        } catch (err) {
          await ctx.toast.show({ message: `Failed to parse SSE: ${err}`, color: "danger" });
        }
      }
    },
    {
      label: "SSE \u203A Parse (Select Provider)",
      icon: "search",
      async onSelect(ctx, args) {
        try {
          const builtinOptions = Object.entries(PROVIDERS).map(([key, p]) => ({
            label: p.name,
            value: key
          }));
          const customRules = await ctx.store.get(STORE_KEY) ?? [];
          const customOptions = customRules.map((r) => ({
            label: `${r.name} (${r.path})`,
            value: r.path
          }));
          const allOptions = customOptions.length > 0 ? [...builtinOptions, ...customOptions] : builtinOptions;
          const result = await ctx.prompt.form({
            id: "sse-select-provider",
            title: "Select Provider",
            confirmText: "Parse",
            cancelText: "Cancel",
            inputs: [
              {
                type: "select",
                name: "provider",
                label: "Provider",
                options: allOptions,
                defaultValue: allOptions[0].value
              }
            ]
          });
          if (result == null) return;
          const provider = result.provider || allOptions[0].value;
          await parseAndShow(ctx, args, provider);
        } catch (err) {
          await ctx.toast.show({ message: `Failed to parse: ${err}`, color: "danger" });
        }
      }
    },
    {
      label: "SSE \u203A Add Custom Rule",
      icon: "plus",
      async onSelect(ctx, _args) {
        try {
          const rules = await ctx.store.get(STORE_KEY) ?? [];
          const rulesMd = rules.length > 0 ? [
            "| # | Name | JSON Path |",
            "|---|------|-----------|",
            ...rules.map((r, i) => `| ${i + 1} | ${r.name} | \`${r.path}\` |`)
          ].join("\n") : "_No custom rules yet._";
          const result = await ctx.prompt.form({
            id: "sse-add-rule",
            title: "Add Custom Rule",
            confirmText: "Add",
            cancelText: "Cancel",
            inputs: [
              { type: "banner", color: "info", inputs: [{ type: "markdown", content: rulesMd }] },
              { type: "text", name: "new_name", label: "Rule Name", placeholder: "My Rule" },
              { type: "text", name: "new_path", label: "JSON Path", placeholder: "choices[0].delta.content" }
            ]
          });
          if (result == null) return;
          const newName = result.new_name?.trim();
          const newPath = result.new_path?.trim();
          if (!newName || !newPath) {
            await ctx.toast.show({ message: "Please fill in both name and path", color: "warning" });
            return;
          }
          if (rules.some((r) => r.name === newName)) {
            await ctx.toast.show({ message: `Rule "${newName}" already exists`, color: "warning" });
            return;
          }
          await ctx.store.set(STORE_KEY, [...rules, { name: newName, path: newPath }]);
          await ctx.toast.show({ message: `Rule "${newName}" added`, icon: "check", color: "success" });
        } catch (err) {
          await ctx.toast.show({ message: `Error: ${err}`, color: "danger" });
        }
      }
    },
    {
      label: "SSE \u203A Delete Custom Rule",
      icon: "trash",
      async onSelect(ctx, _args) {
        try {
          const rules = await ctx.store.get(STORE_KEY) ?? [];
          if (rules.length === 0) {
            await ctx.toast.show({ message: "No custom rules to delete", color: "info" });
            return;
          }
          const options = rules.map((r) => ({ label: `${r.name} (${r.path})`, value: r.name }));
          const result = await ctx.prompt.form({
            id: "sse-delete-rule",
            title: "Delete Custom Rule",
            confirmText: "Delete",
            cancelText: "Cancel",
            inputs: [
              {
                type: "select",
                name: "rule",
                label: "Select rule to delete",
                options,
                defaultValue: options[0].value
              }
            ]
          });
          if (result == null) return;
          const deleteName = result.rule || options[0].value;
          const updated = rules.filter((r) => r.name !== deleteName);
          await ctx.store.set(STORE_KEY, updated);
          await ctx.toast.show({ message: `Rule "${deleteName}" deleted`, icon: "trash", color: "success" });
        } catch (err) {
          await ctx.toast.show({ message: `Error: ${err}`, color: "danger" });
        }
      }
    }
  ]
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  plugin
});
