import express from "express";
import path from "path";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createDecisionServer, demoDecision, loadWidgetHtml } from "./server.js";
import { scoreDecision } from "./decision.js";

const port = Number(process.env.PORT ?? 8787);
const app = express();
app.use(express.json({ limit: "1mb" }));

// Pfad zum Ordner für statische HTML-Seiten (support, privacy, terms)
const publicDir = path.resolve("public");
app.use(express.static(publicDir, { extensions: ["html"] }));

// Healthcheck für Render
app.get("/health", (_req, res) => res.json({ ok: true, service: "decision-canvas" }));

// 1. Root-URL: Leitet direkt auf deine Widget-Vorschau weiter
app.get("/", (_req, res) => {
    res.redirect("/preview");
});

// 2. Rechtliche Pflichtseiten für ChatGPT / OpenAI
app.get("/support", (_req, res) => res.sendFile(path.join(publicDir, "support.html")));
app.get("/privacy", (_req, res) => res.sendFile(path.join(publicDir, "privacy.html")));
app.get("/terms", (_req, res) => res.sendFile(path.join(publicDir, "terms.html")));

// 3. MCP-Endpunkt
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

// 4. Interaktive Vorschau und Widget
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

app.get("/.well-known/openai-apps-challenge", (_req, res) => {
  const token = process.env.OPENAI_APPS_VERIFICATION_TOKEN;

  if (!token) {
    return res.status(404).send("Verification token not configured");
  }

  res.type("text/plain").send(token);
});

app.listen(port, () => {
    console.log(`Server läuft auf Port ${port}`);
    console.log(`Decision Canvas MCP server: http://localhost:${port}/mcp`);
    console.log(`Local widget preview: http://localhost:${port}/preview`);
});
