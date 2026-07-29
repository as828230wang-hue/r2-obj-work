export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}

export function fmtTime(epochSeconds: number | null): string {
  if (!epochSeconds) return "—";
  return new Date(epochSeconds * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

const CSS = `
*{box-sizing:border-box}
body{margin:0;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f5f7;color:#1d1f23}
.wrap{max-width:1100px;margin:0 auto;padding:24px 16px 64px}
header{display:flex;align-items:center;justify-content:space-between;padding:16px 0;margin-bottom:8px}
header h1{font-size:18px;margin:0}
nav a{color:#1d1f23;text-decoration:none;margin-left:16px}
.card{background:#fff;border:1px solid #e1e3e6;border-radius:10px;padding:18px 20px;margin-bottom:18px}
.card h2{margin:0 0 14px;font-size:15px}
.form label{display:block;margin-bottom:12px;font-weight:600}
.form input,.form select{display:block;width:100%;margin-top:6px;padding:8px 10px;border:1px solid #c8ccd1;border-radius:6px;font-size:14px}
.row{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end}
button,a.btn{background:#1d6fb8;color:#fff;border:0;border-radius:6px;padding:8px 14px;font-size:14px;cursor:pointer;text-decoration:none;display:inline-block}
button.danger,a.btn.danger{background:#c0392b}
button.subtle{background:#6b7280}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:9px 8px;border-bottom:1px solid #eee;font-size:13px;vertical-align:top}
th{color:#6b7280;font-weight:600}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
.muted{color:#6b7280}
.tag{display:inline-block;background:#eef1f4;border-radius:4px;padding:1px 6px;font-size:11px;margin:1px}
.tag.on{background:#dcfce7;color:#15803d}
.tag.off{background:#fee2e2;color:#b91c1c}
.error{background:#fee2e2;color:#b91c1c;border-radius:6px;padding:8px 10px;margin-bottom:12px}
.ok{background:#dcfce7;color:#15803d;border-radius:6px;padding:8px 10px;margin-bottom:12px}
.box{background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:12px;font-family:ui-monospace,monospace;word-break:break-all}
`;

export function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · R2 对象存储</title>
<style>${CSS}</style>
</head><body><div class="wrap">${body}</div></body></html>`;
}
