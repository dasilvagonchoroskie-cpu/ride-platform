function Router() {
  const layers = [];
  const add = (method) => (path, ...handlers) => {
    if (typeof path === 'function') { handlers.unshift(path); path = null; }
    const keys = [];
    const re = path === null ? null : new RegExp('^' + path.replace(/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    layers.push({ method, re, keys, handlers });
  };
  const r = { use: add(null), get: add('GET'), post: add('POST'), patch: add('PATCH'), delete: add('DELETE') };
  r.dispatch = (req, res) => {
    const chain = [];
    for (const l of layers) {
      if (l.method && l.method !== req.method) continue;
      let params = {};
      if (l.re) { const m = l.re.exec(req.path); if (!m) continue; l.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); }
      for (const h of l.handlers) chain.push({ h, params });
    }
    let i = 0;
    const next = () => { if (res.done || i >= chain.length) return; const c = chain[i++]; req.params = c.params; c.h(req, res, next); };
    next();
  };
  return r;
}
const express = () => { throw new Error('not used'); };
express.Router = Router;
express.json = () => (q, s, n) => n();
module.exports = express;
