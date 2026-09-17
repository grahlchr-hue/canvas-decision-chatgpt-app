import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createDecisionServer, demoDecision, loadWidgetHtml } from "./server.js";
import { scoreDecision } from "./decision.js";
const port = Number(process.env.PORT ?? 8787);
const app = express();
app.use(express.json({ limit: "1mb" }));
app.get("/health", (_req, res) => res.json({ ok: true, service: "decision-canvas" }));
app.all("/mcp", async (req, res) => {
    const server = createDecisionServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
        void transport.close();
        void server.close();
    });
    try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    }
    catch (error) {
        console.error(error);
        if (!res.headersSent)
            res.status(500).json({ error: "MCP request failed" });
    }
});
app.get("/preview", (_req, res) => {
    const demo = scoreDecision(demoDecision);
    res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body>
    <iframe id="widget" src="/widget" style="width:100%;height:760px;border:0"></iframe>
    <script>
      const frame = document.getElementById('widget');
      frame.addEventListener('load', () => frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:${JSON.stringify(demo)}}}, '*'));
      window.addEventListener('message', (event) => {
        if (event.data?.method === 'ui/update-model-context') console.log('Model context:', event.data.params);
        if (event.data?.method === 'ui/message') alert('Follow-up message: ' + event.data.params?.content?.[0]?.text);
      });
    </script></body></html>`);
});
app.get("/widget", (_req, res) => res.type("html").send(loadWidgetHtml()));
app.listen(port, () => {
    console.log(`Decision Canvas MCP server: http://localhost:${port}/mcp`);
    console.log(`Local widget preview: http://localhost:${port}/preview`);
});
