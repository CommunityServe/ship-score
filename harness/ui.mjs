// What the leaderboard (site/build.mjs) and the comparison sheet (compare.mjs) share: the dark style and formatting.
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
export const mmss = (m) => {
    const s = Math.round(m * 60);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
export const ktok = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}k`);

export const CSS = `:root{--bg:#121211;--card:#1a1a19;--line:#2e2e2b;--text:#f0efec;--text2:#c3c2b7;--muted:#8d8c85;--accent:#3987e5;--bad:#e5484d}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 -apple-system,"SF Pro Text","Helvetica Neue",Arial,sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:36px 24px 80px}a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
h1{font-size:34px;margin:0 0 6px}h2{font-size:22px;margin:40px 0 8px}h3{font-size:17px;margin:22px 0 8px}.sub,.muted{color:var(--text2)}.muted{color:var(--muted)}
code{font:13px ui-monospace,Menlo,monospace;background:var(--card);padding:1px 5px;border-radius:5px}
table{width:100%;border-collapse:collapse;background:var(--card);border-radius:12px;overflow:hidden;font-size:14px;margin:8px 0}
th,td{padding:9px 12px;border-bottom:1px solid var(--line);text-align:right;vertical-align:middle}th{color:var(--muted);font-weight:500}
th:nth-child(-n+2),td:nth-child(-n+2){text-align:left}tr:last-child td{border-bottom:0}td img{width:96px;border-radius:6px;display:block}
.score{font-weight:700;font-size:16px}.fail{color:var(--bad);font-weight:700}.empty{background:var(--card);border-radius:12px;padding:18px;color:var(--text2)}
.frames{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.frames figure{margin:0}.frames img{width:100%;border-radius:8px;display:block}
.frames figcaption{color:var(--muted);font-size:12px;margin-top:3px}.ok{color:#3ecf8e}.no{color:var(--bad)}nav{margin-bottom:24px}`;

// `head` carries the style: a <link> on the site, an inline <style> in the self-contained comparison.
export const page = (title, body, head) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
${head}</head><body><div class="wrap">${body}</div></body></html>`;
