export class ApiError extends Error {
  constructor(message, status, code, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields || null;
  }
}

async function request(path, options = {}) {
  const opts = { method: options.method || 'GET', credentials: 'same-origin', headers: {} };
  if (options.body !== undefined) {
    opts.body = JSON.stringify(options.body);
    opts.headers['Content-Type'] = 'application/json';
  }

  let res;
  try {
    res = await fetch(`/api${path}`, opts);
  } catch (err) {
    throw new ApiError('Falha de conexão com o servidor.', 0, 'network');
  }

  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const err = (data && data.error) || {};
    throw new ApiError(err.message || 'Não foi possível concluir a operação.', res.status, err.code || 'error', err.fields);
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: body || {} }),
  put: (path, body) => request(path, { method: 'PUT', body: body || {} }),
  patch: (path, body) => request(path, { method: 'PATCH', body: body || {} }),
  del: (path) => request(path, { method: 'DELETE' }),

  async download(path, fallbackName = 'exportacao.csv') {
    const res = await fetch(`/api${path}`, { credentials: 'same-origin' });
    if (!res.ok) {
      let message = 'Não foi possível gerar o arquivo.';
      try {
        const data = await res.json();
        if (data && data.error) message = data.error.message;
      } catch (err) { /* sem corpo json */ }
      throw new ApiError(message, res.status, 'export');
    }
    const blob = await res.blob();
    const disposition = res.headers.get('content-disposition') || '';
    const match = /filename="([^"]+)"/.exec(disposition);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = match ? match[1] : fallbackName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
};
