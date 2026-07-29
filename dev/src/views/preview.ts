import { b64encode } from "../lib/crypto";
import { esc, fmtTime, humanSize, page } from "./layout";

const MAX_PREVIEW = 1024 * 1024; // must match PREVIEW_MAX in admin route

// Content-Types we can render inline as text.
const TEXT_RE = /^(text\/|application\/(json|xml|javascript|x-yaml|x-www-form-urlencoded))/i;

interface PreviewData {
  key: string;
  contentType: string;
  size: number;
  uploaded: Date;
  body: ArrayBuffer | null; // null when over the preview cap
}

export function previewView(data: PreviewData): string {
  const { key, contentType, size, uploaded, body } = data;
  const tooLarge = size > MAX_PREVIEW;
  const isImage = contentType.startsWith("image/");
  const isText = TEXT_RE.test(contentType);

  let content: string;
  if (tooLarge) {
    content = `<div class="error">文件过大 (${humanSize(size)})，超过 ${MAX_PREVIEW / 1024}KB 预览上限，请直接下载。</div>`;
  } else if (isImage && body) {
    content = `<img src="data:${esc(contentType)};base64,${b64encode(new Uint8Array(body))}" style="max-width:100%;border:1px solid #eee;border-radius:6px">`;
  } else if (isText && body) {
    const text = new TextDecoder().decode(body);
    content = `<pre class="box" style="max-height:60vh;overflow:auto;white-space:pre-wrap">${esc(text)}</pre>`;
  } else {
    content = `<div class="muted">不支持预览此类型 (${esc(contentType)})，请下载查看。</div>`;
  }

  return page("预览", `
    <header>
      <h1>对象预览</h1>
      <nav>
        <a class="btn" href="/admin/objects/download?key=${encodeURIComponent(key)}">下载</a>
        <a class="btn subtle" href="/admin">返回控制台</a>
      </nav>
    </header>
    <div class="card">
      <h2 class="mono" style="word-break:break-all">${esc(key)}</h2>
      <p class="muted">类型: ${esc(contentType)} · 大小: ${humanSize(size)} · 上传: ${fmtTime(Math.floor(uploaded.getTime() / 1000))}</p>
      <div style="margin-top:12px">${content}</div>
    </div>
  `);
}
