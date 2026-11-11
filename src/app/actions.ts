'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  conferirPin,
  ehAdmin,
  encerrarAdmin,
  encerrarSessao,
  hashPin,
  iniciarAdmin,
  iniciarSessao,
  normalizarContato,
  participanteAtual,
  senhaAdminConfere,
} from '@/lib/auth';
import { novoCodigo, query } from '@/lib/db';
import { contarParticipantes, deInputData, obterJogo, situacao, sortearPara, type Estado } from '@/lib/jogo';
import { buscarPrevia, validarUrl } from '@/lib/preview';

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? '').trim();
const MAX_DESEJOS = 30;
const MAX_TENTATIVAS = 5;

// ---------------- Participante ----------------

export async function cadastrar(_: Estado, fd: FormData): Promise<Estado> {
  const nome = texto(fd, 'nome').replace(/\s+/g, ' ');
  const pin = texto(fd, 'pin');
  const contato = normalizarContato(texto(fd, 'contato'));

  if (nome.length < 2 || nome.length > 60) return { erro: 'Informe seu nome (de 2 a 60 letras).' };
  if (!contato) return { erro: 'Informe um e-mail válido ou um telefone com DDD.' };
  if (!/^\d{4}$/.test(pin)) return { erro: 'O PIN deve ter exatamente 4 números.' };

  const jogo = await obterJogo();
  if (texto(fd, 'codigo') !== jogo.codigo_convite) return { erro: 'Este link de convite não é mais válido.' };
  if (!situacao(jogo, await contarParticipantes()).inscricoesAbertas) return { erro: 'As inscrições já foram encerradas.' };

  const [novo] = await query<{ id: number }>(
    `INSERT INTO participantes (nome, contato, tipo_contato, pin_hash) VALUES ($1, $2, $3, $4)
     ON CONFLICT (contato) DO NOTHING RETURNING id`,
    [nome, contato.contato, contato.tipo, hashPin(pin)],
  );
  if (!novo) return { erro: 'Este telefone/e-mail já está cadastrado. Use "Já participo" para entrar com seu PIN.' };

  await iniciarSessao(novo.id);
  redirect('/painel');
}

export async function entrar(_: Estado, fd: FormData): Promise<Estado> {
  const contato = normalizarContato(texto(fd, 'contato'));
  const pin = texto(fd, 'pin');
  const invalido = { erro: 'Telefone/e-mail ou PIN incorretos.' };
  if (!contato || !/^\d{4}$/.test(pin)) return invalido;

  const [p] = await query<{ id: number; pin_hash: string; tentativas: number; bloqueado_ate: Date | null }>(
    'SELECT id, pin_hash, tentativas, bloqueado_ate FROM participantes WHERE contato = $1',
    [contato.contato],
  );
  if (!p) return invalido;
  if (p.bloqueado_ate && new Date(p.bloqueado_ate).getTime() > Date.now()) {
    return { erro: 'Muitas tentativas erradas. Aguarde 15 minutos ou peça ao administrador para redefinir seu PIN.' };
  }
  if (!conferirPin(pin, p.pin_hash)) {
    const bloquear = p.tentativas + 1 >= MAX_TENTATIVAS;
    await query(
      `UPDATE participantes SET tentativas = $2, bloqueado_ate = CASE WHEN $3 THEN now() + interval '15 minutes' ELSE NULL END
        WHERE id = $1`,
      [p.id, bloquear ? 0 : p.tentativas + 1, bloquear],
    );
    return invalido;
  }
  await query('UPDATE participantes SET tentativas = 0, bloqueado_ate = NULL WHERE id = $1', [p.id]);
  await iniciarSessao(p.id);
  redirect('/painel');
}

export async function sair() {
  await encerrarSessao();
  redirect('/');
}

export async function adicionarDesejo(_: Estado, fd: FormData): Promise<Estado> {
  const eu = await participanteAtual();
  if (!eu) return { erro: 'Sua sessão expirou. Entre novamente.' };

  const link = texto(fd, 'url');
  let titulo = texto(fd, 'titulo').slice(0, 200);
  const observacao = texto(fd, 'observacao').slice(0, 300) || null;
  if (!link && !titulo) return { erro: 'Cole o link do produto ou escreva o nome do presente.' };

  const url = link ? validarUrl(link) : null;
  if (link && (!url || link.length > 2000)) return { erro: 'Esse link não parece válido. Copie o endereço completo da página do produto.' };

  const [{ n }] = await query<{ n: number }>('SELECT count(*)::int AS n FROM desejos WHERE participante_id = $1', [eu.id]);
  if (Number(n) >= MAX_DESEJOS) return { erro: `Sua lista já tem ${MAX_DESEJOS} itens. Remova algum para adicionar outro.` };

  const previa = url ? await buscarPrevia(url) : null;
  titulo ||= previa?.titulo || (previa ? `Produto em ${previa.loja}` : '');

  await query(
    `INSERT INTO desejos (participante_id, titulo, url, loja, preco, observacao, imagem, imagem_tipo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [eu.id, titulo, url?.toString() ?? null, previa?.loja ?? null, previa?.preco ?? null, observacao, previa?.imagem ?? null, previa?.imagemTipo ?? null],
  );
  revalidatePath('/painel');
  if (url && !previa?.imagem) return { ok: 'Presente adicionado! Não consegui obter a foto nessa loja, mas o link foi salvo.' };
  return { ok: 'Presente adicionado à sua lista!' };
}

export async function removerDesejo(fd: FormData) {
  const eu = await participanteAtual();
  if (!eu) return;
  await query('DELETE FROM desejos WHERE id = $1 AND participante_id = $2', [Number(fd.get('id')), eu.id]);
  revalidatePath('/painel');
}

export async function sortear(_: Estado, __: FormData): Promise<Estado> {
  const eu = await participanteAtual();
  if (!eu) return { erro: 'Sua sessão expirou. Entre novamente.' };
  const r = await sortearPara(eu.id);
  revalidatePath('/painel');
  return r;
}

// ---------------- Administrador ----------------

export async function adminEntrar(_: Estado, fd: FormData): Promise<Estado> {
  if (!process.env.ADMIN_PASSWORD) return { erro: 'ADMIN_PASSWORD não está configurada no servidor.' };
  if (!senhaAdminConfere(texto(fd, 'senha'))) {
    await new Promise((r) => setTimeout(r, 1500));
    return { erro: 'Senha incorreta.' };
  }
  await iniciarAdmin();
  redirect('/admin');
}

export async function adminSair() {
  await encerrarAdmin();
  redirect('/admin');
}

function numero(v: string): number | null {
  if (!v) return null;
  const n = Number(v.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n < 100000 ? n : null;
}

export async function salvarConfig(_: Estado, fd: FormData): Promise<Estado> {
  if (!(await ehAdmin())) return { erro: 'Acesso negado.' };
  const min = Number(texto(fd, 'min_participantes'));
  if (!Number.isInteger(min) || min < 3 || min > 200) return { erro: 'O mínimo de participantes deve ser um número entre 3 e 200.' };

  const limiteBruto = texto(fd, 'data_limite');
  const festaBruta = texto(fd, 'data_festa');
  const limite = limiteBruto ? deInputData(limiteBruto) : null;
  const festa = festaBruta ? deInputData(festaBruta) : null;
  if (limiteBruto && !limite) return { erro: 'Data limite inválida.' };
  if (festaBruta && !festa) return { erro: 'Data da festa inválida.' };

  const vMin = numero(texto(fd, 'valor_min'));
  const vMax = numero(texto(fd, 'valor_max'));
  if (vMin !== null && vMax !== null && vMin > vMax) return { erro: 'O valor mínimo não pode ser maior que o máximo.' };

  await query(
    `UPDATE jogo SET nome = $1, min_participantes = $2, data_limite = $3, valor_min = $4, valor_max = $5,
            data_festa = $6, local_festa = $7 WHERE id = 1`,
    [
      texto(fd, 'nome').slice(0, 80) || 'Amigo Secreto da Família Matiolli',
      min,
      limite,
      vMin,
      vMax,
      festa,
      texto(fd, 'local_festa').slice(0, 200) || null,
    ],
  );
  revalidatePath('/', 'layout');
  return { ok: 'Configurações salvas.' };
}

export async function alternarInscricoes(fd: FormData) {
  if (!(await ehAdmin())) return;
  await query('UPDATE jogo SET inscricoes_encerradas = $1 WHERE id = 1', [fd.get('encerrar') === '1']);
  revalidatePath('/', 'layout');
}

export async function gerarNovoConvite() {
  if (!(await ehAdmin())) return;
  await query('UPDATE jogo SET codigo_convite = $1 WHERE id = 1', [novoCodigo()]);
  revalidatePath('/admin');
}

export async function removerParticipante(fd: FormData) {
  if (!(await ehAdmin())) return;
  const jogo = await obterJogo();
  if (jogo.sorteado_em) return; // depois do sorteio, é preciso reiniciá-lo antes de remover alguém
  await query('DELETE FROM participantes WHERE id = $1', [Number(fd.get('id'))]);
  revalidatePath('/', 'layout');
}

export async function redefinirPin(_: Estado, fd: FormData): Promise<Estado> {
  if (!(await ehAdmin())) return { erro: 'Acesso negado.' };
  const pin = texto(fd, 'pin');
  if (!/^\d{4}$/.test(pin)) return { erro: 'O PIN deve ter 4 números.' };
  await query('UPDATE participantes SET pin_hash = $2, tentativas = 0, bloqueado_ate = NULL WHERE id = $1', [
    Number(fd.get('id')),
    hashPin(pin),
  ]);
  return { ok: 'PIN redefinido.' };
}

export async function reiniciarSorteio() {
  if (!(await ehAdmin())) return;
  await query('DELETE FROM sorteio');
  await query('UPDATE jogo SET sorteado_em = NULL WHERE id = 1');
  revalidatePath('/', 'layout');
}

/** Foto enviada pelo próprio participante, para quando a loja não deixa o site obter a imagem. */
export async function definirFoto(fd: FormData): Promise<Estado> {
  const eu = await participanteAtual();
  if (!eu) return { erro: 'Sua sessão expirou. Entre novamente.' };
  const foto = fd.get('foto');
  if (!(foto instanceof File) || !/^image\/(jpeg|png|webp)$/.test(foto.type) || foto.size === 0 || foto.size > 900_000) {
    return { erro: 'Não consegui usar essa imagem. Tente outra foto.' };
  }
  await query('UPDATE desejos SET imagem = $1, imagem_tipo = $2 WHERE id = $3 AND participante_id = $4', [
    Buffer.from(await foto.arrayBuffer()),
    foto.type,
    Number(fd.get('id')),
    eu.id,
  ]);
  revalidatePath('/painel');
  return {};
}
