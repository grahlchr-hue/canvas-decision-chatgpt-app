import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

type Criterion = { id: string; label: string; weight: number };
type Option = { id: string; name: string; summary: string; scores: Record<string, number>; total: number; rank: number };
type Canvas = { title: string; context?: string; criteria: Criterion[]; options: Option[]; winnerId: string; weightTotal: number };

const css = `
:root{color-scheme:light dark;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:transparent;color:#17211b}
*{box-sizing:border-box}
body{margin:0;padding:0;background:transparent}
.shell{max-width:880px;margin:0 auto;padding:20px;background:linear-gradient(145deg,#f7faf4,#eef5f0);border:1px solid #dce8df;border-radius:20px;box-shadow:0 12px 40px rgba(24,51,34,.08)}
.eyebrow{margin:0 0 4px;color:#39734f;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
h1{font-size:26px;line-height:1.15;margin:0}
.context{color:#53645a;margin:8px 0 18px;line-height:1.45}
.layout{display:grid;grid-template-columns:minmax(220px,.85fr) minmax(300px,1.4fr);gap:16px}
.panel{background:rgba(255,255,255,.82);border:1px solid #dce8df;border-radius:15px;padding:16px;position:relative}
.panel h2{font-size:14px;margin:0 0 14px}
.criterion{margin:0 0 14px;display:block}
.criterion-head{display:flex;justify-content:space-between;gap:12px;font-size:13px;font-weight:700}
.weight{font-variant-numeric:tabular-nums;color:#39734f}
.criterion input{width:100%;accent-color:#2f7d4a;cursor:pointer}
.option{position:relative;border:1px solid #dce8df;border-radius:13px;padding:14px;margin:0 0 10px;background:white;overflow:hidden}
.option.winner{border-color:#57a36c;box-shadow:0 0 0 2px rgba(87,163,108,.12)}
.option-top{display:flex;align-items:center;gap:10px}
.rank{width:26px;height:26px;display:grid;place-items:center;border-radius:50%;background:#e4efe7;color:#28663d;font-size:12px;font-weight:800}
.option h3{font-size:15px;margin:0;flex:1}
.total{font-size:20px;font-weight:850;font-variant-numeric:tabular-nums}
.summary{font-size:12px;color:#607068;margin:6px 0 10px}
.bar{height:7px;border-radius:99px;background:#e6ece8;overflow:hidden}
.bar span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#2f7d4a,#77b68a);transition:width .25s ease}
.actions{display:flex;gap:9px;margin-top:16px;position:relative;z-index:50}
.actions button{
  border:0;
  border-radius:10px;
  padding:11px 16px;
  font:inherit;
  font-size:13px;
  font-weight:750;
  cursor:pointer !important;
  pointer-events:auto !important;
  position:relative;
  z-index:50;
  transition:all 0.15s ease-in-out;
  user-select:none;
}
.actions button:hover{opacity:0.92;filter:brightness(1.05)}
.actions button:active{transform:scale(0.97)}
.primary{background:#235f38;color:white}
.primary.sent{background:#1b472a;color:#dce8df}
.secondary{background:#e2ece5;color:#245b37}
.empty{padding:32px;text-align:center;color:#64736a}
@media(max-width:650px){.shell{border-radius:14px;padding:14px}.layout{grid-template-columns:1fr}h1{font-size:22px}}
@media(prefers-color-scheme:dark){:root{color:#edf5ef}.shell{background:linear-gradient(145deg,#17251d,#122018);border-color:#304338}.panel,.option{background:rgba(27,43,34,.88);border-color:#3a4d41}.context,.summary{color:#aebdb3}.bar{background:#34473b}.secondary{background:#31483a;color:#edf5ef}}
`;

// Sendet sowohl als vollwertiger JSON-RPC Request (mit id) als auch als Notification an alle Iframe-Ebenen
function send(method: string, params: unknown) {
  const reqId = Date.now().toString();
  const requestPayload = { jsonrpc: "2.0", id: reqId, method, params };
  const notificationPayload = { jsonrpc: "2.0", method, params };

  const targets = [window.parent];
  try {
    if (window.top && window.top !== window.parent) {
      targets.push(window.top);
    }
  } catch {}

  targets.forEach((target) => {
    try {
      target.postMessage(requestPayload, "*");
      target.postMessage(notificationPayload, "*");
    } catch {}
  });
}

function extractCanvas(raw: unknown): Canvas | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = ((raw as Record<string, unknown>).structuredContent ??
    (raw as Record<string, unknown>).result ??
    raw) as Partial<Canvas>;

  if (
    candidate &&
    Array.isArray(candidate.criteria) &&
    Array.isArray(candidate.options) &&
    candidate.criteria.length > 0 &&
    candidate.options.length > 0
  ) {
    return candidate as Canvas;
  }
  return null;
}

function App() {
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [isSent, setIsSent] = useState(false);
  const initialWeights = useRef<Record<string, number>>({});
  const lastCanvasPayload = useRef<string | null>(null);

  useEffect(() => {
    function loadCanvas(raw: unknown) {
      const next = extractCanvas(raw);
      if (!next) return;

      const payload = JSON.stringify(next);
      if (lastCanvasPayload.current === payload) return;
      lastCanvasPayload.current = payload;

      const nextWeights = Object.fromEntries(
        next.criteria.map((criterion) => [criterion.id, criterion.weight])
      );
      initialWeights.current = nextWeights;
      setWeights(nextWeights);
      setCanvas(next);
    }

    const readToolOutput = () => {
      loadCanvas(window.openai?.toolOutput);
    };

    const onMessage = (event: MessageEvent) => {
      const message = event.data;
      if (!message) return;

      if (message.jsonrpc === "2.0" && message.method === "ui/notifications/tool-result") {
        loadCanvas(message.params?.structuredContent ?? message.params);
        return;
      }

      loadCanvas(message.structuredContent ?? message);
    };

    window.addEventListener("message", onMessage);
    window.addEventListener("openai:set_globals", readToolOutput);

    readToolOutput();
    send("ui/ready", {});

    const timer = setInterval(() => {
      if (canvas) {
        clearInterval(timer);
        return;
      }
      readToolOutput();
    }, 250);

    const timeout = setTimeout(() => {
      clearInterval(timer);
    }, 6000);

    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("openai:set_globals", readToolOutput);
      clearInterval(timer);
      clearTimeout(timeout);
    };
  }, [canvas]);

  const ranked = useMemo(() => {
    if (!canvas) return [];
    const totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0) || 1;
    return canvas.options
      .map((option) => ({
        ...option,
        total:
          Math.round(
            (canvas.criteria.reduce(
              (sum, criterion) => sum + (option.scores[criterion.id] ?? 0) * (weights[criterion.id] ?? 0),
              0
            ) /
              totalWeight) *
              10
          ) / 10,
      }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
      .map((option, index) => ({ ...option, rank: index + 1 }));
  }, [canvas, weights]);

  useEffect(() => {
    if (!canvas || !ranked.length) return;
    const snapshot = ranked.map((option) => `${option.rank}. ${option.name}: ${option.total}/10`).join("; ");
    send("ui/update-model-context", {
      content: [
        {
          type: "text",
          text: `Aktualisierte Prioritäten im Decision Canvas: ${snapshot}. Aktuelle Gewichte: ${JSON.stringify(weights)}.`,
        },
      ],
    });
    window.openai?.setWidgetState?.({ weights });
  }, [canvas, ranked, weights]);

  if (!canvas) {
    return (
      <>
        <style>{css}</style>
        <div className="shell empty">Preparing your decision canvas…</div>
      </>
    );
  }

  const leader = ranked[0];

  const handleDiscussClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const leaderName = leader?.name ?? "die führende Option";
    const promptMessage =
      `Erkläre mir bitte, warum ${leaderName} mit meinen angepassten Prioritäten führt, identifiziere die größte verbleibende Unsicherheit und schlage einen konkreten Realitäts-Check vor der finalen Entscheidung vor.`;

    // 1. JSON-RPC Request mit id & role an MCP-Host
    send("ui/message", {
      role: "user",
      content: [{ type: "text", text: promptMessage }],
    });

    // 2. Fallbacks für alle Varianten des nativen window.openai SDKs
    try {
      const api = window.openai as Record<string, unknown> | undefined;
      if (typeof api?.sendUserMessage === "function") {
        (api.sendUserMessage as (arg: unknown) => void)({ text: promptMessage });
      }
      if (typeof api?.sendMessage === "function") {
        (api.sendMessage as (arg: unknown) => void)({ text: promptMessage });
        (api.sendMessage as (arg: unknown) => void)(promptMessage);
      }
    } catch {}

    setIsSent(true);
    setTimeout(() => {
      setIsSent(false);
    }, 3000);
  };

  return (
    <main className="shell">
      <style>{css}</style>
      <p className="eyebrow">Decision Canvas</p>
      <h1>{canvas.title}</h1>
      {canvas.context && <p className="context">{canvas.context}</p>}
      <div className="layout">
        <section className="panel" aria-label="Decision priorities">
          <h2>Tune what matters</h2>
          {canvas.criteria.map((criterion) => (
            <label className="criterion" key={criterion.id}>
              <span className="criterion-head">
                <span>{criterion.label}</span>
                <span className="weight">{weights[criterion.id] ?? 0}/10</span>
              </span>
              <input
                type="range"
                min="0"
                max="10"
                step="1"
                value={weights[criterion.id] ?? 0}
                onChange={(event) =>
                  setWeights((current) => ({ ...current, [criterion.id]: Number(event.target.value) }))
                }
              />
            </label>
          ))}
          <div className="actions">
            <button className="secondary" type="button" onClick={() => setWeights({ ...initialWeights.current })}>
              Reset weights
            </button>
          </div>
        </section>
        <section className="panel" aria-label="Ranked options">
          <h2>Live ranking</h2>
          {ranked.map((option) => (
            <article className={"option " + (option.id === leader?.id ? "winner" : "")} key={option.id}>
              <div className="option-top">
                <span className="rank">{option.rank}</span>
                <h3>{option.name}</h3>
                <span className="total">{option.total}</span>
              </div>
              <p className="summary">{option.summary}</p>
              <div className="bar" aria-label={`${option.total} out of 10`}>
                <span style={{ width: `${option.total * 10}%` }} />
              </div>
            </article>
          ))}
          <div className="actions">
            <button
              className={"primary " + (isSent ? "sent" : "")}
              type="button"
              onClick={handleDiscussClick}
            >
              {isSent ? "✓ Gesendet..." : "Discuss this ranking"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

declare global {
  interface Window {
    openai?: {
      toolOutput?: unknown;
      widgetState?: unknown;
      setWidgetState?: (state: unknown) => void;
      sendMessage?: (message: unknown) => void;
      sendUserMessage?: (message: unknown) => void;
    };
  }
}

createRoot(document.getElementById("root")!).render(<App />);
