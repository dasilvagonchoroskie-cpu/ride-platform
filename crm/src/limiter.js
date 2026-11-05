'use strict';

// Limitador de tentativas em memória (janela fixa). Sem dependências para ser testável.
function createLimiter({ max, windowMs, maxKeys = 10000, now = () => Date.now() }) {
  const entries = new Map();

  function prune() {
    const t = now();
    for (const [key, entry] of entries) {
      if (t - entry.first > windowMs) entries.delete(key);
    }
    // Proteção contra crescimento ilimitado (ex.: ataque com milhares de chaves distintas).
    if (entries.size > maxKeys) {
      const excess = entries.size - maxKeys;
      let i = 0;
      for (const key of entries.keys()) {
        entries.delete(key);
        if (++i >= excess) break;
      }
    }
  }

  return {
    isBlocked(key) {
      const entry = entries.get(key);
      if (!entry) return false;
      if (now() - entry.first > windowMs) {
        entries.delete(key);
        return false;
      }
      return entry.count >= max;
    },
    fail(key) {
      const entry = entries.get(key);
      if (!entry || now() - entry.first > windowMs) {
        if (entries.size >= maxKeys) prune();
        entries.set(key, { count: 1, first: now() });
      } else {
        entry.count += 1;
      }
    },
    clear(key) {
      entries.delete(key);
    },
    size() {
      return entries.size;
    }
  };
}

module.exports = { createLimiter };
