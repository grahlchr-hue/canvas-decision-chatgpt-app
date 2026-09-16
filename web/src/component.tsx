import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

type Criterion = { id: string; label: string; weight: number };
type Option = { id: string; name: string; summary: string; scores: Record<string, number>; total: number; rank: number };
type Canvas = { title: string; context?: string; criteria: Criterion[]; options: Option[]; winnerId: string; weightTotal: number };

const css = `
:root{color-scheme:light dark;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:transparent;color:#17211b}
*{box-sizing:border-box}body{margin:0;padding:0;background:transparent}.shell{max-width:880px;margin:0 auto;padding:20px;background:linear-gradient(145deg,#f7faf4,#eef5f0);border:1px solid #dce8df;border-radius:20px;box-shadow:0 12px 40px rgba(24,51,34,.08)}
.eyebrow{margin:0 0 4px;color:#39734f;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}h1{font-size:26px;line-height:1.15;margin:0}.context{color:#53645a;margin:8px 0 18px;line-height:1.45}.layout{display:grid;grid-template-columns:minmax(220px,.85fr) minmax(300px,1.4fr);gap:16px}.panel{background:rgba(255,255,255,.82);border:1px solid #dce8df;border-radius:15px;padding:16px}.panel h2{font-size:14px;margin:0 0 14px}.criterion{margin:0 0 14px}.criterion-head{display:flex;justify-content:space-between;gap:12px;font-size:13px;font-weight:700}.weight{font-variant-numeric:tabular-nums;color:#39734f}.criterion input{width:100%;accent-color:#2f7d4a}.option{position:relative;border:1px solid #dce8df;border-radius:13px;padding:14px;margin:0 0 10px;background:white;overflow:hidden}.option.winner{border-color:#57a36c;box-shadow:0 0 0 2px rgba(87,163,108,.12)}.option-top{display:flex;align-items:center;gap:10px}.rank{width:26px;height:26px;display:grid;place-items:center;border-radius:50%;background:#e4efe7;color:#28663d;font-size:12px;font-weight:800}.option h3{font-size:15px;margin:0;flex:1}.total{font-size:20px;font-weight:850;font-variant-numeric:tabular-nums}.summary{font-size:12px;color:#607068;margin:6px 0 10px}.bar{height:7px;border-radius:99px;background:#e6ece8;overflow:hidden}.bar span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#2f7d4a,#77b68a);transition:width .25s ease}.actions{display:flex;gap:9px;margin-top:14px}.actions button{border:0;border-radius:10px;padding:10px 13px;font:inherit;font-size:13px;font-weight:750;cursor:pointer}.primary{background:#235f38;color:white}.secondary{background:#e2ece5;color:#245b37}.empty{padding:32px;text-align:center;color:#64736a}
@media(max-width:650px){.shell{border-radius:14px;padding:14px}.layout{grid-template-columns:1fr}h1{font-size:22px}}
@media(prefers-color-scheme:dark){:root{color:#edf5ef}.shell{background:linear-gradient(145deg,#17251d,#122018);border-color:#304338}.panel,.option{background:rgba(27,43,34,.88);border-color:#3a4d41}.context,.summary{color:#aebdb3}.bar{background:#34473b}.secondary{background:#31483a;color:#edf5ef}}
`;

function send(method: string, params: unknown) {
  window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
}

function App() {
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const initialWeights = useRef<Record<string, number>>({});
const applyCanvas = (next: Canvas | undefined) => {
  if (!next?.criteria || !next?.options) return;

  const nextWeights = Object.fromEntries(
    next.criteria.map((criterion) => [
      criterion.id,
      criterion.weight,
    ])
  );

  initialWeights.current = nextWeights;
  setWeights(nextWeights);
  setCanvas(next);
};
  useEffect(() => {
  const onMessage = (event: MessageEvent) => {
    if (event.source !== window.parent) return;

    const message = event.data;

    if (
      !message ||
      message.jsonrpc !== "2.0" ||
      message.method !== "ui/notifications/tool-result"
    ) {
      return;
    }

    applyCanvas(
      message.params?.structuredContent as Canvas | undefined
    );
  };

  window.addEventListener("message", onMessage, { passive: true });
    // ChatGPT-Kompatibilitätsweg:
  applyCanvas(window.openai?.toolOutput as Canvas | undefined);

  return () => {
    window.removeEventListener("message", onMessage);
  };
}, []);

  const ranked = useMemo(() => {
    if (!canvas) return [];
    const totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0) || 1;
    return canvas.options.map((option) => ({
      ...option,
      total: Math.round(canvas.criteria.reduce((sum, criterion) => sum + (option.scores[criterion.id] ?? 0) * (weights[criterion.id] ?? 0), 0) / totalWeight * 10) / 10,
    })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)).map((option, index) => ({ ...option, rank: index + 1 }));
  }, [canvas, weights]);

  useEffect(() => {
    if (!canvas || !ranked.length) return;
    const snapshot = ranked.map((option) => `${option.rank}. ${option.name}: ${option.total}/10`).join("; ");
    send("ui/update-model-context", { content: [{ type: "text", text: `The user adjusted the Decision Canvas weights. Current ranking: ${snapshot}. Current weights: ${JSON.stringify(weights)}.` }] });
    window.openai?.setWidgetState?.({ weights });
  }, [canvas, ranked, weights]);

  if (!canvas) return <div className="shell empty">Preparing your decision canvas…</div>;
  const leader = ranked[0];

  return <main className="shell">
    <style>{css}</style>
    <p className="eyebrow">Decision Canvas</p>
    <h1>{canvas.title}</h1>
    {canvas.context && <p className="context">{canvas.context}</p>}
    <div className="layout">
      <section className="panel" aria-label="Decision priorities">
        <h2>Tune what matters</h2>
        {canvas.criteria.map((criterion) => <label className="criterion" key={criterion.id}>
          <span className="criterion-head"><span>{criterion.label}</span><span className="weight">{weights[criterion.id] ?? 0}/10</span></span>
          <input type="range" min="0" max="10" step="1" value={weights[criterion.id] ?? 0} onChange={(event) => setWeights((current) => ({ ...current, [criterion.id]: Number(event.target.value) }))} />
        </label>)}
        <button className="secondary" type="button" onClick={() => setWeights(initialWeights.current)}>Reset weights</button>
      </section>
      <section className="panel" aria-label="Ranked options">
        <h2>Live ranking</h2>
        {ranked.map((option) => <article className={`option ${option.id === leader?.id ? "winner" : ""}`} key={option.id}>
          <div className="option-top"><span className="rank">{option.rank}</span><h3>{option.name}</h3><span className="total">{option.total}</span></div>
          <p className="summary">{option.summary}</p>
          <div className="bar" aria-label={`${option.total} out of 10`}><span style={{ width: `${option.total * 10}%` }} /></div>
        </article>)}
        <div className="actions"><button className="primary" type="button" onClick={() => send("ui/message", { role: "user", content: [{ type: "text", text: `Explain why ${leader?.name} leads under my adjusted priorities, identify the biggest uncertainty, and suggest one reality-check before I decide.` }] })}>Discuss this ranking</button></div>
      </section>
    </div>
  </main>;
}

declare global {
  interface Window {
    openai?: {
      toolOutput?: unknown;
      widgetState?: unknown;
      setWidgetState?: (state: unknown) => void;
    };
  }
}

createRoot(document.getElementById("root")!).render(<App />);
