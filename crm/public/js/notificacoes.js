// Avisos do atendimento com o CRM aberto (som diferente por tipo + aviso na tela) e ativação das notificações push
// (para receber com o app fechado). Três tipos: mensagem nova, IA respondeu, IA transferiu para a equipe.
import { api } from './api.js';
import * as ui from './ui.js';

export const TIPOS = {
  mensagem: { nome: 'Mensagem nova', icone: '💬' },
  ia: { nome: 'IA respondeu (aviso discreto)', icone: '🤖' },
  transferencia: { nome: 'IA passou para a equipe (urgente)', icone: '🚨' }
};

/* --------------------------------- sons ---------------------------------- */
// Sons gerados na hora (sem arquivo): cada tipo tem um "jeito" fácil de reconhecer.
let audio = null;
function contexto() {
  if (!audio) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    audio = new C();
  }
  if (audio.state === 'suspended') audio.resume().catch(() => {});
  return audio;
}
// O navegador só libera som depois de um toque na tela.
['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, () => contexto(), { once: true, passive: true }));

function tom(ctx, inicio, freq, dur, volume, forma = 'sine') {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = forma;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, ctx.currentTime + inicio);
  g.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + inicio + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inicio + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + inicio);
  o.stop(ctx.currentTime + inicio + dur + 0.05);
}

export function tocar(tipo) {
  const ctx = contexto();
  if (tipo === 'transferencia') {
    // Alarme: três pulsos alto/baixo + vibração longa.
    if (ctx) for (let i = 0; i < 3; i++) { tom(ctx, i * 0.42, 1046, 0.18, 0.5, 'square'); tom(ctx, i * 0.42 + 0.2, 784, 0.18, 0.5, 'square'); }
    if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 600]);
  } else if (tipo === 'mensagem') {
    // "Plim-plim": duas notas curtas.
    if (ctx) { tom(ctx, 0, 880, 0.12, 0.35); tom(ctx, 0.15, 1175, 0.16, 0.35); }
    if (navigator.vibrate) navigator.vibrate(120);
  } else if (tipo === 'ia') {
    // Discreto: uma nota grave e baixa, sem vibrar.
    if (ctx) tom(ctx, 0, 523, 0.22, 0.12, 'triangle');
  }
}

const chaveSom = (tipo) => `fm_som_${tipo}`;
export function somLigado(tipo) {
  try { const v = localStorage.getItem(chaveSom(tipo)); return v === null ? true : v === '1'; } catch (err) { return true; }
}
export function ligarSom(tipo, ligado) { try { localStorage.setItem(chaveSom(tipo), ligado ? '1' : '0'); } catch (err) { /* sem armazenamento */ } }

/* ------------------------- avisos com o app aberto ------------------------ */
function avisoNaTela(item) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `toast notif notif-${item.tipo}`;
  el.innerHTML = `<b>${ui.esc(item.titulo)}</b>${item.corpo ? `<span>${ui.esc(item.corpo)}</span>` : ''}`;
  el.addEventListener('click', () => {
    el.remove();
    if (item.conversa_id) location.hash = `#/conversas?c=${item.conversa_id}`;
  });
  root.appendChild(el);
  const tempo = item.tipo === 'transferencia' ? 15000 : item.tipo === 'ia' ? 4000 : 7000;
  setTimeout(() => { el.style.opacity = '0'; }, tempo);
  setTimeout(() => el.remove(), tempo + 500);
}

let ultimo = null;
let timer = null;
export function iniciarAvisos() {
  if (timer) return;
  const buscar = async () => {
    try {
      const r = await api.get(`/notificacoes${ultimo === null ? '' : `?desde=${ultimo}`}`);
      const novos = ultimo === null ? [] : r.itens; // ao abrir o app, não repete avisos antigos
      ultimo = r.ultimo;
      // Vários de uma vez: um som por tipo (o mais importante primeiro) e no máximo 3 avisos na tela.
      // Ao voltar para o CRM, avisos com mais de 1 minuto já tocaram como notificação do celular: aparecem sem som.
      const recentes = novos.filter((i) => !i.criado_em || Date.now() - new Date(i.criado_em).getTime() < 60000);
      const tipos = new Set(recentes.map((i) => i.tipo));
      for (const t of ['transferencia', 'mensagem', 'ia']) if (tipos.has(t) && somLigado(t)) { tocar(t); break; }
      novos.slice(-3).forEach(avisoNaTela);
    } catch (err) { /* sem sessão ou sem rede: tenta de novo depois */ }
  };
  buscar();
  timer = setInterval(() => { if (!document.hidden) buscar(); }, 8000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) buscar(); });
}
export function pararAvisos() { if (timer) clearInterval(timer); timer = null; ultimo = null; }

/* ------------------------------- push ------------------------------------ */
export const suportaPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const PACOTE_APP = 'br.com.fortalezamove.crm_fortaleza_move';
const ler = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const gravar = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* armazenamento indisponível */ } };
// O app novo (TWA) abre o CRM pelo Chrome e avisa a origem na 1ª página; guardamos para os avisos da tela.
try { if (document.referrer.startsWith(`android-app://${PACOTE_APP}`)) gravar('fm_twa', '1'); } catch (e) { /* */ }

/** Onde o CRM está rodando: 'app' (app novo, pelo Chrome), 'app_antigo' (app antigo com navegador embutido), 'navegador'. */
export function ambiente() {
  if (/; wv\)/.test(navigator.userAgent) || (/Android/.test(navigator.userAgent) && /Version\/[\d.]+ Chrome/.test(navigator.userAgent) && !suportaPush())) return 'app_antigo';
  if (ler('fm_twa') === '1') return 'app';
  return 'navegador';
}

function chaveParaBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function inscricaoAtual() {
  if (!suportaPush()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function ativarPush(tipos) {
  if (!suportaPush()) throw new Error('Este navegador não recebe notificações. Abra o CRM no Chrome.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Permissão de notificação negada. Libere nas configurações do navegador (Notificações) e tente de novo.');
  const { chave_publica: chave } = await api.get('/push/config');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chave) });
  const r = await api.post('/push/inscrever', { subscription: sub.toJSON(), tipos });
  gravar('fm_push_ativo', '1');
  return r;
}

/**
 * Ao abrir o CRM: mantém a inscrição deste aparelho em dia (o serviço de push pode trocar ou vencer a inscrição,
 * e outra pessoa pode ter entrado no mesmo aparelho). Não pede permissão: só age se ela já foi dada.
 */
function mesmaChave(sub, chave) {
  try {
    const k = sub.options && sub.options.applicationServerKey;
    if (!k) return true;
    const a = new Uint8Array(k);
    const b = chaveParaBytes(chave);
    return a.length === b.length && a.every((x, i) => x === b[i]);
  } catch (e) { return true; }
}

export async function sincronizarPush() {
  if (!suportaPush() || Notification.permission !== 'granted' || ler('fm_push_ativo') !== '1') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    const { chave_publica: chave } = await api.get('/push/config');
    // Inscrição feita com outra chave do servidor (chave trocada): não funciona mais, refaz.
    if (sub && !mesmaChave(sub, chave)) { const antiga = sub.endpoint; await sub.unsubscribe().catch(() => {}); sub = null; await api.post('/push/cancelar', { endpoint: antiga }).catch(() => {}); }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chave) });
    await api.post('/push/inscrever', { subscription: sub.toJSON(), renovar: true });
  } catch (err) { /* sem rede ou sem sessão: tenta na próxima abertura */ }
}

export async function desativarPush() {
  const sub = await inscricaoAtual();
  gravar('fm_push_ativo', null);
  if (!sub) return;
  await api.post('/push/cancelar', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
