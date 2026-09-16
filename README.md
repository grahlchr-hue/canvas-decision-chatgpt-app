# Decision Canvas — ChatGPT MCP App

Decision Canvas turns a messy choice into a weighted comparison that remains easy to discuss in ChatGPT. The MCP server exposes a data-first scoring tool and a separate render tool; the inline widget lets the user adjust priorities and sends the updated ranking back into the conversation.

## What is included

- TypeScript MCP server using Streamable HTTP at `http://localhost:8787/mcp`
- `build_decision_analysis` tool for validating and scoring 2–5 options
- `show_decision_canvas` render tool linked to an MCP Apps UI resource
- Responsive React widget with live weight sliders and a follow-up action
- Local preview harness at `http://localhost:8787/preview`
- Unit tests for the scoring engine

## Run locally

Requirements: Node.js 18 or newer.

```bash
npm install
npm run build
npm test
npm start
```

Open `http://localhost:8787/health` to check the server and `http://localhost:8787/preview` to inspect the widget.

Inspect the MCP tools directly:

```bash
npx @modelcontextprotocol/inspector@latest
```

Point the inspector at `http://localhost:8787/mcp` using Streamable HTTP.

## Connect to ChatGPT

ChatGPT must be able to reach the MCP endpoint. For local development, use OpenAI's Secure MCP Tunnel when available in your workspace, or an HTTPS development tunnel. Then:

1. Enable Developer mode in ChatGPT under **Settings → Security and login**.
2. Open **ChatGPT Plugins**, select **+**, and create a connection.
3. Enter the public/tunneled URL including `/mcp`.
4. Review the two discovered tools and start a new chat with the connection enabled.

Try: “Help me choose between renting downtown, renting farther out, and buying. Consider monthly cost, commute, flexibility, and long-term upside. Show me the decision canvas.”

## Architecture

The scoring tool is independent from the UI, so ChatGPT can reason over the structured result in any MCP client. Only the render tool owns the widget template. The widget uses the portable MCP Apps `postMessage` bridge for tool results, model context updates, and follow-up messages.

For production, add authenticated persistent storage if you want users to save canvases across conversations. Keep server-side data authoritative and treat widget state as presentation state.

## Official references

- [Build an MCP server](https://developers.openai.com/plugins/build/mcp-server)
- [Add UI to your MCP server](https://developers.openai.com/plugins/build/chatgpt-ui)
- [Connect and test your plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt)
