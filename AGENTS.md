<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

<!-- ai-sdk-start -->

## AI SDK v6 (Vercel AI SDK)

This project uses `ai@6.x` and `@ai-sdk/react@3.x` which have **major breaking changes** from v4/v5. Your training data is almost certainly outdated.

**Before writing any `useChat`, `streamText`, `tool()`, or message-handling code, read `AI_SDK_V6_GUIDE.md` first.** Key gotchas:

- `toTextStreamResponse()` → `toUIMessageStreamResponse()`
- `useChat({ api, body })` → `useChat({ transport: new DefaultChatTransport({ api, body }) })`
- `sendMessage({ role, content })` → `sendMessage({ text })`
- `parameters:` → `inputSchema:` in tool definitions
- `maxSteps` → `stopWhen: stepCountIs(N)`
- Messages use `parts[]` not `content`

<!-- ai-sdk-end -->
