import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface Previa {
  titulo: string | null;
  preco: string | null;
  loja: string;
  imagem: Buffer | null;
  imagemTipo: string | null;
}

const UA_NAVEGADOR =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
// Várias lojas (ex.: Shopee) só entregam as metatags de pré-visualização para robôs de link preview.
const UA_PREVIA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

const MAX_HTML = 2_000_000;
const MAX_IMAGEM = 3_000_000;

const LOJAS: [RegExp, string][] = [
  [/shopee\./, 'Shopee'],
  [/amazon\.|amzn\./, 'Amazon'],
  [/mercadoli[vb]re\.|meli\./, 'Mercado Livre'],
  [/magazineluiza\.|magalu\./, 'Magalu'],
  [/aliexpress\./, 'AliExpress'],
  [/shein\./, 'Shein'],
  [/americanas\./, 'Americanas'],
  [/casasbahia\./, 'Casas Bahia'],
  [/kabum\./, 'KaBuM!'],
  [/netshoes\./, 'Netshoes'],
];

export function nomeDaLoja(url: URL) {
  const host = url.hostname.toLowerCase();
  return LOJAS.find(([re]) => re.test(host))?.[1] ?? host.replace(/^www\./, '');
}

export function validarUrl(bruto: string): URL | null {
  let v = bruto.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.') ? u : null;
  } catch {
    return null;
  }
}

function ipPrivado(ip: string) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return ipPrivado(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  );
}

/** Impede que o servidor seja usado para acessar endereços internos (SSRF). */
async function hostPermitido(u: URL) {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return !ipPrivado(host);
  try {
    const enderecos = await lookup(host, { all: true });
    return enderecos.length > 0 && enderecos.every((e) => !ipPrivado(e.address));
  } catch {
    return false;
  }
}

async function buscar(url: URL, ua: string, aceitar: string): Promise<Response | null> {
  let atual = url;
  for (let i = 0; i < 6; i++) {
    if (!(await hostPermitido(atual))) return null;
    const r = await fetch(atual, {
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
      headers: { 'user-agent': ua, accept: aceitar, 'accept-language': 'pt-BR,pt;q=0.9,en;q=0.5' },
    });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      atual = new URL(r.headers.get('location')!, atual);
      continue;
    }
    return r;
  }
  return null;
}

async function lerLimitado(r: Response, max: number): Promise<Buffer | null> {
  if (!r.body) return null;
  const partes: Uint8Array[] = [];
  let total = 0;
  const leitor = r.body.getReader();
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await leitor.cancel().catch(() => {});
      return max === MAX_HTML ? Buffer.concat(partes) : null; // HTML: o início basta; imagem: descarta
    }
    partes.push(value);
  }
  return Buffer.concat(partes);
}

function decodificar(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function metas(html: string) {
  const mapa = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const chave = tag.match(/\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const valor = tag.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ?? tag.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1];
    if (chave && valor && !mapa.has(chave)) mapa.set(chave, decodificar(valor));
  }
  return mapa;
}

function extrair(html: string, base: URL) {
  const m = metas(html);
  let titulo =
    m.get('og:title') ?? m.get('twitter:title') ??
    (html.match(/id=["']productTitle["'][^>]*>([^<]+)</i)?.[1] || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]);
  titulo = titulo ? decodificar(titulo).slice(0, 200) : undefined;

  let imagem =
    m.get('og:image:secure_url') ?? m.get('og:image') ?? m.get('twitter:image') ?? m.get('twitter:image:src') ??
    m.get('image') ??
    html.match(/data-old-hires=["'](https?:[^"']+)["']/i)?.[1] ?? // Amazon
    html.match(/"(?:hiRes|large)"\s*:\s*"(https?:[^"]+)"/)?.[1] ?? // Amazon
    html.match(/id=["']landingImage["'][^>]*\bsrc=["'](https?:[^"']+)["']/i)?.[1] ??
    html.match(/"image"\s*:\s*\[?\s*"(https?:[^"]+)"/)?.[1]; // JSON-LD
  if (imagem) {
    try {
      imagem = new URL(decodificar(imagem).replace(/\\\//g, '/'), base).toString();
    } catch {
      imagem = undefined;
    }
  }

  let preco: string | null = null;
  const valor =
    m.get('product:price:amount') ?? m.get('og:price:amount') ?? m.get('price') ??
    html.match(/"price"\s*:\s*"?(\d+(?:[.,]\d{1,2})?)"?/)?.[1];
  const n = valor ? Number(valor.replace(',', '.')) : NaN;
  if (n > 0 && n < 1_000_000) {
    const moeda = m.get('product:price:currency') ?? m.get('og:price:currency') ?? 'BRL';
    preco =
      moeda === 'BRL' ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : `${moeda} ${n.toFixed(2)}`;
  }

  return { titulo: titulo ?? null, imagem: imagem ?? null, preco };
}

async function baixarImagem(src: string): Promise<{ dados: Buffer; tipo: string } | null> {
  try {
    const r = await buscar(new URL(src), UA_NAVEGADOR, 'image/avif,image/webp,image/*,*/*;q=0.5');
    if (!r?.ok) return null;
    const tipo = (r.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(tipo)) return null;
    const dados = await lerLimitado(r, MAX_IMAGEM);
    return dados && dados.length > 0 ? { dados, tipo } : null;
  } catch {
    return null;
  }
}

/** Consulta a página do produto e devolve título, preço e a imagem (já baixada). Nunca lança erro. */
export async function buscarPrevia(url: URL): Promise<Previa> {
  const previa: Previa = { titulo: null, preco: null, loja: nomeDaLoja(url), imagem: null, imagemTipo: null };
  let imagemUrl: string | null = null;

  for (const ua of [UA_NAVEGADOR, UA_PREVIA]) {
    try {
      const r = await buscar(url, ua, 'text/html,application/xhtml+xml');
      if (!r?.ok || !(r.headers.get('content-type') ?? '').includes('html')) continue;
      const corpo = await lerLimitado(r, MAX_HTML);
      if (!corpo) continue;
      const achado = extrair(corpo.toString('utf8'), new URL(r.url || url));
      previa.titulo ??= achado.titulo;
      previa.preco ??= achado.preco;
      imagemUrl ??= achado.imagem;
      if (imagemUrl) break;
    } catch {
      // tenta o próximo
    }
  }

  // A Shopee costuma bloquear a consulta da página; nesse caso, o próprio link traz o nome
  // do produto (antes de "-i.loja.item") e, muitas vezes, o código da foto (image_ids).
  if (previa.loja === 'Shopee') {
    const slug = url.pathname.match(/^\/([^/]+)-i\.\d+\.\d+/)?.[1];
    if (!previa.titulo && slug) {
      try {
        previa.titulo = decodeURIComponent(slug).replace(/-+/g, ' ').trim().slice(0, 200) || null;
      } catch {
        // slug malformado: fica sem título
      }
    }
    const idImagem = url.searchParams.get('image_ids')?.split(',')[0];
    if (!imagemUrl && idImagem && /^[\w-]{10,80}$/.test(idImagem)) {
      imagemUrl = `https://down-br.img.susercontent.com/file/${idImagem}`;
    }
  }

  if (imagemUrl) {
    const img = await baixarImagem(imagemUrl);
    if (img) {
      previa.imagem = img.dados;
      previa.imagemTipo = img.tipo;
    }
  }
  return previa;
}
