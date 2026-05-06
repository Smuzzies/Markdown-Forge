import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import hljs from "highlight.js";

const welcomeMarkdown = `# Markdown Forge

A fast desktop desk for reading and shaping Markdown.

- Open local \`.md\`, \`.markdown\`, or text files
- Edit in the left pane and preview on the right
- Save changes back to disk or save a new file
- Supports GitHub-style tables, task lists, footnotes, code highlighting, and raw HTML

| Shortcut | Action |
| --- | --- |
| Ctrl/Cmd + O | Open file |
| Ctrl/Cmd + S | Save file |

\`\`\`ts
const message = "clean markdown, native shell";
\`\`\`
`;

const markdown = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight(code, language): string {
    if (language && hljs.getLanguage(language)) {
      return `<pre class="hljs"><code>${hljs.highlight(code, { language }).value}</code></pre>`;
    }

    return `<pre class="hljs"><code>${MarkdownIt().utils.escapeHtml(code)}</code></pre>`;
  },
})
  .use(anchor)
  .use(footnote)
  .use(taskLists, { enabled: true, label: true, labelAfter: true });

const previewThemes = {
  forge: {
    label: "Forge Light",
    light: true,
    paper: "#f6f6f1",
    text: "#25262a",
    muted: "#4f5259",
    accent: "#fcbc01",
    code: "#e5e5df",
    link: "#7d5b00",
    panel: "rgba(226, 228, 234, 0.7)",
  },
  graphite: {
    label: "Graphite",
    light: false,
    paper: "#23262b",
    text: "#f3f4f6",
    muted: "#c0c5ce",
    accent: "#fcbc01",
    code: "#121417",
    link: "#ffd24d",
    panel: "rgba(16, 17, 19, 0.7)",
  },
  nord: {
    label: "Nord Fjord",
    light: true,
    paper: "#eceff4",
    text: "#2e3440",
    muted: "#4c566a",
    accent: "#5e81ac",
    code: "#d8dee9",
    link: "#5e81ac",
    panel: "rgba(76, 86, 106, 0.28)",
  },
  gruvbox: {
    label: "Gruvbox",
    light: false,
    paper: "#282828",
    text: "#fbf1c7",
    muted: "#d5c4a1",
    accent: "#fabd2f",
    code: "#1d2021",
    link: "#fe8019",
    panel: "rgba(29, 32, 33, 0.72)",
  },
  dracula: {
    label: "Dracula",
    light: false,
    paper: "#282a36",
    text: "#f8f8f2",
    muted: "#bd93f9",
    accent: "#ff79c6",
    code: "#1f2130",
    link: "#8be9fd",
    panel: "rgba(25, 26, 36, 0.72)",
  },
  solarized: {
    label: "Solarized",
    light: true,
    paper: "#fdf6e3",
    text: "#586e75",
    muted: "#657b83",
    accent: "#b58900",
    code: "#eee8d5",
    link: "#268bd2",
    panel: "rgba(147, 161, 161, 0.28)",
  },
} as const;

type PreviewTheme = keyof typeof previewThemes;

function loadPreference<T extends string | number>(key: string, fallback: T): T {
  const value = localStorage.getItem(key);
  if (value === null) return fallback;
  return (typeof fallback === "number" ? Number(value) : value) as T;
}

function filename(path: string | null) {
  if (!path) return "Untitled.md";
  return path.split(/[\\/]/).pop() ?? path;
}

export default function App() {
  const [content, setContent] = useState(welcomeMarkdown);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<"split" | "preview" | "edit">(() => loadPreference("mode", "split"));
  const [editorWidth, setEditorWidth] = useState<number>(() => loadPreference<number>("editorWidth", 50));
  const [previewTheme, setPreviewTheme] = useState<PreviewTheme>(() => loadPreference("previewTheme", "forge") as PreviewTheme);
  const [previewScale, setPreviewScale] = useState<number>(() => loadPreference<number>("previewScale", 100));
  const [message, setMessage] = useState<string | null>(null);
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const paperRef = useRef<HTMLDivElement | null>(null);

  const rendered = useMemo(() => markdown.render(content), [content]);
  const wordCount = useMemo(() => content.trim().split(/\s+/).filter(Boolean).length, [content]);
  const theme = previewThemes[previewTheme] ?? previewThemes.forge;
  const printPaper = theme.light ? "#ffffff" : theme.paper;
  const previewStyle = {
    "--preview-paper": theme.paper,
    "--preview-text": theme.text,
    "--preview-muted": theme.muted,
    "--preview-accent": theme.accent,
    "--preview-code": theme.code,
    "--preview-link": theme.link,
    "--preview-panel": theme.panel,
    "--preview-scale": previewScale / 100,
  } as CSSProperties;

  useEffect(() => localStorage.setItem("mode", mode), [mode]);
  useEffect(() => localStorage.setItem("editorWidth", String(editorWidth)), [editorWidth]);
  useEffect(() => localStorage.setItem("previewTheme", previewTheme), [previewTheme]);
  useEffect(() => localStorage.setItem("previewScale", String(previewScale)), [previewScale]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) return;

      if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        void openFile();
      } else if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveFile(event.shiftKey);
      } else if (event.key === "=" || event.key === "+") {
        event.preventDefault();
        adjustPreviewScale(10);
      } else if (event.key === "-") {
        event.preventDefault();
        adjustPreviewScale(-10);
      } else if (["1", "2", "3"].includes(event.key)) {
        event.preventDefault();
        setMode(event.key === "1" ? "split" : event.key === "2" ? "edit" : "preview");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  async function openFile() {
    try {
      if (dirty && !window.confirm("Discard unsaved changes and open another file?")) return;

      const selected = await open({
        multiple: false,
        filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdown", "txt"] }],
      });

      if (typeof selected !== "string") return;

      const nextContent = await readTextFile(selected);
      setContent(nextContent);
      setFilePath(selected);
      setDirty(false);
      setMessage(`Opened ${filename(selected)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open file");
    }
  }

  async function saveFile(forceSaveAs = false) {
    try {
      const target =
        !forceSaveAs && filePath ? filePath :
        (await save({
          defaultPath: "Untitled.md",
          filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
        }));

      if (!target) return;

      await writeTextFile(target, content);
      setFilePath(target);
      setDirty(false);
      setMessage(`Saved ${filename(target)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save file");
    }
  }

  async function exportHtml() {
    try {
      const target = await save({
        defaultPath: `${filename(filePath).replace(/\.[^.]+$/, "") || "Untitled"}.html`,
        filters: [{ name: "HTML", extensions: ["html"] }],
      });

      if (!target) return;

      await writeTextFile(target, buildHtmlDocument());
      setMessage(`Exported ${filename(target)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not export HTML");
    }
  }

  async function exportPdf() {
    const paper = paperRef.current;
    if (!paper) return;

    try {
      const target = await save({
        defaultPath: `${filename(filePath).replace(/\.[^.]+$/, "") || "Untitled"}.pdf`,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });

      if (!target) return;

      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 28;
      const imageWidth = pageWidth - margin * 2;
      const printPages = createPdfPages();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      for (const [index, page] of printPages.entries()) {
        const canvas = await html2canvas(page, {
          backgroundColor: printPaper,
          scale: 1.6,
          useCORS: true,
        });
        const imageHeight = (canvas.height * imageWidth) / canvas.width;
        const imageData = canvas.toDataURL("image/jpeg", 0.75);

        if (index > 0) pdf.addPage();
        pdf.addImage(imageData, "JPEG", margin, margin, imageWidth, imageHeight);
      }

      for (const page of printPages) document.body.removeChild(page);

      await writeFile(target, new Uint8Array(pdf.output("arraybuffer")));
      setMessage(`Exported ${filename(target)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not export PDF");
    }
  }

  function createPdfPages() {
    const source = document.createElement("main");
    source.innerHTML = rendered;

    const pages: HTMLDivElement[] = [];
    let page = createPdfPage();
    document.body.appendChild(page);
    pages.push(page);

    for (const child of Array.from(source.children)) {
      const next = child.cloneNode(true);
      page.querySelector(".paper")?.appendChild(next);

      if (page.scrollHeight > 1123 && page.querySelector(".paper")?.children.length && page.querySelector(".paper")!.children.length > 1) {
        page.querySelector(".paper")?.removeChild(next);
        page = createPdfPage();
        document.body.appendChild(page);
        page.querySelector(".paper")?.appendChild(next);
        pages.push(page);
      }
    }

    return pages;
  }

  function createPdfPage() {
    const page = document.createElement("div");
    page.style.position = "fixed";
    page.style.left = "-10000px";
    page.style.top = "0";
    page.style.width = "794px";
    page.style.minHeight = "1123px";
    page.style.background = printPaper;
    page.innerHTML = `<style>${exportStyles({ includeShell: false })}</style><main class="paper"></main>`;
    return page;
  }

  function buildHtmlDocument() {
    const title = filename(filePath).replace(/\.[^.]+$/, "") || "Markdown Forge Export";
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${markdown.utils.escapeHtml(title)}</title>
  <style>${exportStyles()}</style>
</head>
<body>
  <main class="paper">${rendered}</main>
</body>
</html>`;
  }

  function printPreview() {
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    document.body.appendChild(frame);

    const frameDocument = frame.contentWindow?.document;
    if (!frameDocument) return;

    frameDocument.open();
    frameDocument.write(buildHtmlDocument());
    frameDocument.close();

    setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => {
        if (frame.parentNode) document.body.removeChild(frame);
      }, 1000);
    }, 250);
  }

  function exportStyles(options: { includeShell?: boolean } = {}) {
    const includeShell = options.includeShell ?? true;
    return `* { box-sizing: border-box; }
${includeShell ? `body { margin: 0; padding: 32px; background: ${theme.light ? "#ffffff" : theme.panel}; color: ${theme.text}; font-family: Georgia, "Times New Roman", serif; }` : "body { margin: 0; background: transparent; }"}
.paper { width: 100%; max-width: ${includeShell ? "860px" : "794px"}; min-height: ${includeShell ? "auto" : "1123px"}; margin: 0 auto; padding: 48px; background: ${printPaper}; color: ${theme.text}; line-height: 1.72; font-family: Georgia, "Times New Roman", serif; ${includeShell ? "box-shadow: 0 22px 55px rgba(0,0,0,.14);" : "box-shadow: none;"} }
h1, h2, h3 { color: ${theme.text}; white-space: normal; overflow-wrap: anywhere; }
h1 { font-size: calc(2.65rem * ${previewScale / 100}); line-height: 1.05; }
h2 { font-size: calc(1.9rem * ${previewScale / 100}); margin-top: 2.2rem; }
h3 { font-size: calc(1.35rem * ${previewScale / 100}); }
p, li, td, th { color: ${theme.text}; font-size: calc(1.05rem * ${previewScale / 100}); }
a { color: ${theme.link}; }
blockquote { margin-inline: 0; padding: .4rem 0 .4rem 1.25rem; border-left: 4px solid ${theme.accent}; color: ${theme.muted}; }
table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; }
th, td { border-bottom: 1px solid rgba(127,127,127,.35); padding: .65rem; text-align: left; }
code { border-radius: .22rem; background: ${theme.code}; color: ${theme.text}; padding: .12rem .35rem; }
pre { border-radius: .35rem; padding: 1.1rem; overflow: auto; background: ${theme.code}; }
pre code { background: transparent; color: inherit; padding: 0; }
img { max-width: 100%; }
h1, h2, h3, p, ul, ol, table, blockquote, pre { break-inside: avoid; page-break-inside: avoid; }
@page { margin: 0.45in; }`;
  }

  function adjustPreviewScale(delta: number) {
    setPreviewScale((current) => Math.min(120, Math.max(50, current + delta)));
  }

  function startResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const workspace = workspaceRef.current;
    if (!workspace) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = workspace.getBoundingClientRect();

    function resize(moveEvent: PointerEvent) {
      const nextWidth = ((moveEvent.clientX - bounds.left) / bounds.width) * 100;
      setEditorWidth(Math.min(78, Math.max(22, nextWidth)));
    }

    function stopResize() {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stopResize);
    }

    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stopResize);
  }

  return (
    <main className="app-shell">
      <header className="toolbar">
        <div className="brand">
          <img className="app-logo" src="/mdforge_logo.png" alt="Markdown Forge logo" />
          <div>
            <p className="eyebrow">Markdown Forge</p>
            <h1>{filename(filePath)}</h1>
          </div>
        </div>

        <div className="actions">
          <button onClick={openFile}>Open</button>
          <div className="save-menu">
            <button className="primary" onClick={() => void saveFile()}>Save</button>
            <button className="primary save-toggle" onClick={() => setSaveMenuOpen((open) => !open)} aria-label="More save options">▾</button>
            {saveMenuOpen && (
              <div className="menu-popover">
                <button onClick={() => { setSaveMenuOpen(false); void saveFile(); }}>Save Markdown</button>
                <button onClick={() => { setSaveMenuOpen(false); void saveFile(true); }}>Save Markdown As...</button>
                <button onClick={() => { setSaveMenuOpen(false); void exportHtml(); }}>Export HTML</button>
                <button onClick={() => { setSaveMenuOpen(false); void exportPdf(); }}>Export PDF</button>
              </div>
            )}
          </div>
          <button onClick={printPreview}>Print</button>
        </div>

        <div className="preview-controls">
          <select value={previewTheme} onChange={(event) => setPreviewTheme(event.target.value as PreviewTheme)} aria-label="Preview theme">
            {Object.entries(previewThemes).map(([key, value]) => (
              <option key={key} value={key}>{value.label}</option>
            ))}
          </select>
          <button onClick={() => adjustPreviewScale(-10)} aria-label="Decrease preview size">A-</button>
          <span>{previewScale}%</span>
          <button onClick={() => adjustPreviewScale(10)} aria-label="Increase preview size">A+</button>
        </div>

        <div className="mode-switch" aria-label="View mode">
          {(["split", "preview", "edit"] as const).map((option) => (
            <button
              className={mode === option ? "active" : ""}
              key={option}
              onClick={() => setMode(option)}
            >
              {option}
            </button>
          ))}
        </div>

        <p className="status">{message ?? (dirty ? "Unsaved changes" : filePath ? "Saved" : "Scratch document")} · {wordCount} words · {content.length} chars</p>
      </header>

      <section
        className={`workspace ${mode}`}
        ref={workspaceRef}
        style={{ "--editor-width": `${editorWidth}%` } as CSSProperties}
      >
        {mode !== "preview" && (
          <label className="editor-panel">
            <span>Source</span>
            <textarea
              spellCheck="false"
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
                setDirty(true);
              }}
            />
          </label>
        )}

        {mode === "split" && (
          <button className="resizer" onPointerDown={startResize} aria-label="Resize editor and preview panes">
            <span />
          </button>
        )}

        {mode !== "edit" && (
          <article className="preview-panel" style={previewStyle}>
            <div ref={paperRef} className="paper" dangerouslySetInnerHTML={{ __html: rendered }} />
          </article>
        )}
      </section>
    </main>
  );
}
