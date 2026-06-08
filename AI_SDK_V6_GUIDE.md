# AI SDK v6 Breaking Changes Reference

> **Project versions:** `ai@6.0.197`, `@ai-sdk/react@3.0.199`, `@ai-sdk/google@3.0.80`
>
> This file documents every breaking change encountered while migrating this project.
> **Always verify against `node_modules/ai/dist/index.d.ts` when in doubt.**

---

## 1. Server-Side: `streamText` Response

The client's `useChat` hook uses `DefaultChatTransport`, which expects the **UI Message Stream protocol** (SSE with structured chunks). The old `toTextStreamResponse()` returns plain text that the client silently ignores.

```diff
  const result = streamText({ ... });

- return result.toTextStreamResponse();
+ return result.toUIMessageStreamResponse();
```

### Available response methods

| Method                        | Protocol         | Compatible with                  |
| ----------------------------- | ---------------- | -------------------------------- |
| `toTextStreamResponse()`      | Plain text       | `useCompletion`, custom fetch    |
| `toUIMessageStreamResponse()` | SSE / data proto | `useChat` (DefaultChatTransport) |

---

## 2. Server-Side: Message Conversion

The SDK provides `convertToModelMessages()` to properly convert incoming `UIMessage[]` (parts-based) into `ModelMessage[]` (CoreMessages) for `streamText`. **Do not manually map messages.**

```diff
- // ❌ Manual lossy conversion
- const coreMessages = messages.map((m: any) => ({
-   role: m.role,
-   content: m.content || (m.parts ? m.parts.map((p: any) => p.text).join('') : '')
- }));

+ // ✅ SDK built-in converter (handles parts, tool calls, files, etc.)
+ import { convertToModelMessages, type UIMessage } from 'ai';
+ const coreMessages = await convertToModelMessages(messages as UIMessage[]);
```

> **Note:** `convertToModelMessages` is async — don't forget `await`.

---

## 3. Server-Side: Tool Definition

The `tool()` helper now uses `inputSchema` instead of `parameters`.

```diff
  import { tool } from 'ai';
  import { z } from 'zod';

  submit_quote_request: tool({
    description: '...',
-   parameters: z.object({ ... }),
+   inputSchema: z.object({ ... }),
    execute: async (input) => { ... },
  }),
```

---

## 4. Server-Side: Multi-Step Tool Loops

`maxSteps` has been removed. Use `stopWhen` with a `StopCondition` instead.

```diff
  import { streamText, stepCountIs } from 'ai';

  const result = streamText({
    model: google('gemini-2.5-flash'),
    messages: coreMessages,
    tools: { ... },
-   maxSteps: 5,
+   stopWhen: stepCountIs(5),
  });
```

### Available stop conditions

| Function            | Description                             |
| ------------------- | --------------------------------------- |
| `stepCountIs(n)`    | Stop after `n` steps                    |
| `isLoopFinished()`  | Stop when the model stops calling tools |
| `hasToolCall(name)` | Stop when a specific tool is called     |

---

## 5. Server-Side: `onError` Callback

The `onError` callback no longer exists on `streamText`. Remove it.

```diff
  const result = streamText({
    ...
    onFinish: (event) => { console.log(event.finishReason); },
-   onError: (error) => { console.error(error); },
  });
```

---

## 6. Client-Side: `useChat` Options

`api`, `body`, `headers`, `credentials`, and `fetch` have moved from top-level `useChat` options to the **transport** layer.

```diff
  import { useChat } from '@ai-sdk/react';
+ import { DefaultChatTransport } from 'ai';

  const { messages, status, sendMessage } = useChat({
-   api: '/api/chat',
-   body: { data: { userName: '...' } },
+   transport: new DefaultChatTransport({
+     api: '/api/chat',    // defaults to '/api/chat' if omitted
+     body: { data: { userName: '...' } },
+   }),
    onError: (error) => console.error(error),
  });
```

### `ChatInit` (useChat options) — what's available

| Property                | v5             | v6                          |
| ----------------------- | -------------- | --------------------------- |
| `api`                   | ✅ direct prop | ❌ moved to transport       |
| `body`                  | ✅ direct prop | ❌ moved to transport       |
| `headers`               | ✅ direct prop | ❌ moved to transport       |
| `transport`             | ❌             | ✅ `ChatTransport` instance |
| `onError`               | ✅             | ✅                          |
| `onFinish`              | ✅             | ✅ (signature changed)      |
| `onToolCall`            | ✅             | ✅                          |
| `onResponse`            | ✅             | ❌ removed                  |
| `sendAutomaticallyWhen` | ❌             | ✅ new                      |

### Transport body with reactive values

`body` accepts `Resolvable<object>` — either a static object or a function:

```typescript
// Static (captures value at transport creation time)
body: {
  data: {
    userName: user?.fullName;
  }
}

// Dynamic (re-evaluated on each request)
body: () => ({ data: { userName: user?.fullName } });
```

---

## 7. Client-Side: `sendMessage` Format

`sendMessage` no longer accepts `{ role, content }`. Use `{ text }` instead.

```diff
- sendMessage({ role: 'user', content: inputValue });
+ sendMessage({ text: inputValue });
```

### Full `sendMessage` signature

```typescript
sendMessage(
  message?:
    | { text: string; files?: FileList | FileUIPart[]; metadata?: unknown }
    | { files: FileList | FileUIPart[]; metadata?: unknown }
    | CreateUIMessage<UIMessage>,
  options?: ChatRequestOptions
): Promise<void>
```

---

## 8. Client-Side: Message Structure (UIMessage)

Messages are now **parts-based**. The `content` property is gone; use `m.parts` instead.

### Reading text content

```diff
- <p>{m.content}</p>
+ <p>
+   {m.parts
+     .filter((p) => p.type === 'text')
+     .map((p) => p.text)
+     .join('')}
+ </p>
```

### Available part types

| Part Type          | Key Properties                             |
| ------------------ | ------------------------------------------ |
| `text`             | `text: string`                             |
| `reasoning`        | `text: string`                             |
| `tool-${toolName}` | `toolCallId`, `input`, `output`, `state`   |
| `dynamic-tool`     | `toolName`, `toolCallId`, `input`, `state` |
| `source-url`       | `url: string`                              |
| `file`             | `mediaType`, `url` or `data`               |
| `step-start`       | step boundary marker                       |

---

## 9. Client-Side: Tool Invocation Rendering

Tool parts no longer use a generic `tool-invocation` type with a nested `toolInvocation` object. Instead, each tool gets its own part type `tool-${toolName}` with properties directly on the part.

```diff
- // ❌ Old: generic type with nested object
- {m.toolInvocations && m.toolInvocations.length > 0 && (
-   <pre>{JSON.stringify(m.toolInvocations[0].args, null, 2)}</pre>
- )}

+ // ✅ New: typed parts with direct properties
+ {m.parts.some((p) => p.type?.startsWith('tool-') || p.type === 'dynamic-tool') && (
+   <pre>
+     {JSON.stringify(
+       (m.parts.find((p) => p.type?.startsWith('tool-')) as any)?.input,
+       null, 2
+     )}
+   </pre>
+ )}
```

### Tool part states

| State                | Meaning                                  |
| -------------------- | ---------------------------------------- |
| `input-streaming`    | Tool arguments are still streaming in    |
| `input-available`    | All arguments received, not yet executed |
| `approval-requested` | Waiting for user approval                |
| `approval-responded` | User responded to approval               |
| `output-available`   | Tool executed successfully               |
| `output-error`       | Tool execution failed                    |

---

## 10. Client-Side: Status Values

The `status` field remains the same:

| Status      | Meaning                             |
| ----------- | ----------------------------------- |
| `submitted` | Request sent, awaiting stream start |
| `streaming` | Actively receiving chunks           |
| `ready`     | Complete, ready for next message    |
| `error`     | An error occurred                   |

```typescript
const isLoading = status === 'streaming' || status === 'submitted';
```

---

## Quick Migration Checklist

- [ ] `toTextStreamResponse()` → `toUIMessageStreamResponse()`
- [ ] Manual message mapping → `await convertToModelMessages(messages)`
- [ ] `parameters:` → `inputSchema:` in `tool()`
- [ ] `maxSteps: N` → `stopWhen: stepCountIs(N)`
- [ ] Remove `onError` from `streamText()`
- [ ] `useChat({ api, body })` → `useChat({ transport: new DefaultChatTransport({ api, body }) })`
- [ ] `sendMessage({ role, content })` → `sendMessage({ text })`
- [ ] `m.content` → `m.parts.filter(p => p.type === 'text').map(p => p.text).join('')`
- [ ] `m.toolInvocations[0].args` → `part.input` on `tool-*` typed parts
- [ ] `onResponse` callback → removed (no replacement)
