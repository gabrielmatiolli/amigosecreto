import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { query } from './db';
import type { Participante } from './jogo';

const COOKIE_SESSAO = 'as_sessao';
const COOKIE_ADMIN = 'as_admin';
const DURACAO = 60 * 60 * 24 * 90; // 90 dias

function segredo() {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET não configurado.');
  return 'segredo-apenas-para-desenvolvimento';
}

function assinar(valor: string) {
  return createHmac('sha256', segredo()).update(valor).digest('base64url');
}

function iguais(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const opcoes = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: DURACAO,
};

// ---------- PIN ----------

export function hashPin(pin: string) {
  const sal = randomBytes(16).toString('hex');
  return `${sal}:${scryptSync(pin, sal, 32).toString('hex')}`;
}

export function conferirPin(pin: string, hash: string) {
  const [sal, h] = hash.split(':');
  if (!sal || !h) return false;
  return iguais(scryptSync(pin, sal, 32).toString('hex'), h);
}

// ---------- Contato ----------

export function normalizarContato(bruto: string): { contato: string; tipo: 'email' | 'telefone' } | null {
  const v = bruto.trim();
  if (v.includes('@')) {
    const email = v.toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 200 ? { contato: email, tipo: 'email' } : null;
  }
  let d = v.replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length < 10 || d.length > 11) return null;
  return { contato: d, tipo: 'telefone' };
}

export function formatarContato(contato: string, tipo: string) {
  if (tipo !== 'telefone') return contato;
  const m = contato.match(/^(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : contato;
}

// ---------- Sessão do participante ----------

export async function iniciarSessao(id: number) {
  (await cookies()).set(COOKIE_SESSAO, `${id}.${assinar(`p:${id}`)}`, opcoes);
}

export async function encerrarSessao() {
  (await cookies()).delete(COOKIE_SESSAO);
}

export async function participanteAtual(): Promise<Participante | null> {
  const bruto = (await cookies()).get(COOKIE_SESSAO)?.value;
  if (!bruto) return null;
  const [id, assinatura] = bruto.split('.');
  if (!/^\d+$/.test(id ?? '') || !assinatura || !iguais(assinatura, assinar(`p:${id}`))) return null;
  const [p] = await query<Participante>('SELECT id, nome, contato, tipo_contato FROM participantes WHERE id = $1', [
    Number(id),
  ]);
  return p ?? null;
}

// ---------- Administrador ----------

function tokenAdmin() {
  return assinar(`admin:${process.env.ADMIN_PASSWORD ?? ''}`);
}

export function senhaAdminConfere(senha: string) {
  const correta = process.env.ADMIN_PASSWORD;
  if (!correta) return false;
  return iguais(assinar(`s:${senha}`), assinar(`s:${correta}`));
}

export async function iniciarAdmin() {
  (await cookies()).set(COOKIE_ADMIN, tokenAdmin(), { ...opcoes, maxAge: 60 * 60 * 24 * 7 });
}

export async function encerrarAdmin() {
  (await cookies()).delete(COOKIE_ADMIN);
}

export async function ehAdmin() {
  if (!process.env.ADMIN_PASSWORD) return false;
  const v = (await cookies()).get(COOKIE_ADMIN)?.value;
  return !!v && iguais(v, tokenAdmin());
}
