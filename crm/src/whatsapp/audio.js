'use strict';
// Mensagem de voz gravada no CRM (19/11/2026, pedido do dono: "o microfonezinho", como no WhatsApp).
// O navegador grava em WebM/Opus (Chrome/Android), OGG/Opus (Firefox) ou MP4/AAC (iPhone). O WhatsApp só toca como
// "mensagem de voz" o OGG/Opus mono; por isso o servidor converte com o ffmpeg antes de enviar.
// Segurança: só aceita o que COMEÇA como um desses formatos (primeiros bytes), o ffmpeg só lê da entrada padrão
// (-protocol_whitelist pipe: não abre arquivo nem endereço citado dentro do áudio), com tempo e tamanho máximos.
const { spawn } = require('child_process');

const MAX_ENTRADA = 900 * 1024;      // ~2 minutos de áudio do navegador
const MAX_SAIDA = 3 * 1024 * 1024;
const MAX_SEGUNDOS = 130;

/** Formato do arquivo gravado pelo navegador, pelos primeiros bytes (ou null). */
function formatoDoAudio(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm';
  if (buf.slice(0, 4).toString('latin1') === 'OggS') return 'ogg';
  if (buf.slice(4, 8).toString('latin1') === 'ftyp') return 'mp4';
  return null;
}

/** Converte para OGG/Opus mono 48 kHz (formato de mensagem de voz do WhatsApp). Devolve Buffer. */
function converterParaOgg(entrada, { timeoutMs = 25000, bin = process.env.FFMPEG_BIN || 'ffmpeg' } = {}) {
  return new Promise((ok, falha) => {
    if (!formatoDoAudio(entrada)) { falha(new Error('formato de áudio não aceito')); return; }
    let p;
    try {
      p = spawn(bin, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-protocol_whitelist', 'pipe', '-i', 'pipe:0',
        '-vn', '-ac', '1', '-ar', '48000', '-t', String(MAX_SEGUNDOS), '-c:a', 'libopus', '-b:a', '32k', '-application', 'voip', '-f', 'ogg', 'pipe:1'],
      { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) { falha(err); return; }
    const partes = [];
    let tamanho = 0;
    let erro = '';
    let acabou = false;
    const fim = (fn, v) => { if (acabou) return; acabou = true; clearTimeout(relogio); fn(v); };
    const relogio = setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) { /* já saiu */ } fim(falha, new Error('tempo esgotado ao converter o áudio')); }, timeoutMs);
    p.stdout.on('data', (d) => {
      tamanho += d.length;
      if (tamanho > MAX_SAIDA) { try { p.kill('SIGKILL'); } catch (e) { /* já saiu */ } fim(falha, new Error('áudio convertido grande demais')); return; }
      partes.push(d);
    });
    p.stderr.on('data', (d) => { if (erro.length < 500) erro += d.toString(); });
    p.on('error', (err) => fim(falha, err.code === 'ENOENT' ? new Error('ffmpeg não está instalado no servidor') : err));
    p.on('close', (codigo) => {
      const saida = Buffer.concat(partes);
      if (codigo === 0 && saida.slice(0, 4).toString('latin1') === 'OggS') fim(ok, saida);
      else fim(falha, new Error((erro || `ffmpeg terminou com código ${codigo}`).trim().slice(0, 200)));
    });
    p.stdin.on('error', () => { /* ffmpeg fechou a entrada antes: o erro aparece no close */ });
    p.stdin.end(entrada);
  });
}

module.exports = { formatoDoAudio, converterParaOgg, MAX_ENTRADA, MAX_SEGUNDOS };
