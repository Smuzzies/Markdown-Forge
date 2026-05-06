import { useMemo, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
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

function filename(path: string | null) {
  if (!path) return "Untitled.md";
  return path.split(/[\\/]/).pop() ?? path;
}

export default function App() {
  const [content, setContent] = useState(welcomeMarkdown);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<"split" | "preview" | "edit">("split");
  const [editorWidth, setEditorWidth] = useState(50);
  const [message, setMessage] = useState<string | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);

  const rendered = useMemo(() => markdown.render(content), [content]);
  const wordCount = useMemo(() => content.trim().split(/\s+/).filter(Boolean).length, [content]);

  async function openFile() {
    try {
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

  async function saveFile() {
    try {
      const target =
        filePath ??
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

  function startResize(event: React.PointerEvent<HTMLButtonElement>) {
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
          <button className="primary" onClick={saveFile}>Save</button>
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
        style={{ "--editor-width": `${editorWidth}%` } as React.CSSProperties}
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
          <article className="preview-panel">
            <div className="paper" dangerouslySetInnerHTML={{ __html: rendered }} />
          </article>
        )}
      </section>
    </main>
  );
}
