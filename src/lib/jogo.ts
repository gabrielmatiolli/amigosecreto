import { randomInt } from 'node:crypto';
import { query, tx, type Consulta } from './db';

export type Estado = { erro?: string; ok?: string };

export interface Jogo {
  nome: string;
  codigo_convite: string;
  min_participantes: number;
  data_limite: Date | null;
  inscricoes_encerradas: boolean;
  valor_min: string | number | null;
  valor_max: string | number | null;
  data_festa: Date | null;
  local_festa: string | null;
  sorteado_em: Date | null;
}

export interface Participante {
  id: number;
  nome: string;
  contato: string;
  tipo_contato: 'email' | 'telefone';
}

export interface Desejo {
  id: number;
  participante_id: number;
  titulo: string;
  url: string | null;
  loja: string | null;
  preco: string | null;
  observacao: string | null;
  tem_imagem: boolean;
}

export async function obterJogo(q: Consulta = query): Promise<Jogo> {
  const [jogo] = await q<Jogo>('SELECT * FROM jogo WHERE id = 1');
  return jogo;
}

export async function contarParticipantes(q: Consulta = query): Promise<number> {
  const [r] = await q<{ n: number }>('SELECT count(*)::int AS n FROM participantes');
  return Number(r.n);
}

export function situacao(jogo: Jogo, total: number) {
  const sorteado = !!jogo.sorteado_em;
  const prazoVencido = jogo.data_limite ? Date.now() >= new Date(jogo.data_limite).getTime() : false;
  const inscricoesAbertas = !sorteado && !jogo.inscricoes_encerradas && !prazoVencido;
  const faltam = Math.max(0, jogo.min_participantes - total);
  const sorteioLiberado = !inscricoesAbertas && faltam === 0;
  return { sorteado, prazoVencido, inscricoesAbertas, faltam, sorteioLiberado, total };
}

export async function listarDesejos(participanteId: number): Promise<Desejo[]> {
  return query<Desejo>(
    `SELECT id, participante_id, titulo, url, loja, preco, observacao, (imagem IS NOT NULL) AS tem_imagem
       FROM desejos WHERE participante_id = $1 ORDER BY id DESC`,
    [participanteId],
  );
}

/**
 * Revela o amigo secreto de um participante. Na primeira chamada (de qualquer pessoa),
 * o sorteio inteiro é gerado de uma vez, como um único ciclo aleatório: ninguém tira a si
 * mesmo e ninguém fica sem par. Cada pessoa só "abre o seu papel" quando clica em sortear.
 */
export async function sortearPara(participanteId: number): Promise<Estado> {
  return tx(async (q) => {
    const [jogo] = await q<Jogo>('SELECT * FROM jogo WHERE id = 1 FOR UPDATE');
    const ids = (await q<{ id: number }>('SELECT id FROM participantes ORDER BY id')).map((p) => p.id);
    const s = situacao(jogo, ids.length);
    if (!ids.includes(participanteId)) return { erro: 'Participante não encontrado.' };
    if (!s.sorteioLiberado) {
      return {
        erro: s.inscricoesAbertas
          ? 'O sorteio só é liberado quando as inscrições forem encerradas.'
          : `Ainda faltam ${s.faltam} participante(s) para o sorteio.`,
      };
    }
    if (!s.sorteado) {
      for (let i = ids.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      await q('DELETE FROM sorteio');
      for (let i = 0; i < ids.length; i++) {
        await q('INSERT INTO sorteio (doador_id, recebedor_id) VALUES ($1, $2)', [ids[i], ids[(i + 1) % ids.length]]);
      }
      await q('UPDATE jogo SET sorteado_em = now() WHERE id = 1');
    }
    await q('UPDATE sorteio SET revelado_em = COALESCE(revelado_em, now()) WHERE doador_id = $1', [participanteId]);
    return {};
  });
}

export async function amigoDe(participanteId: number): Promise<{ id: number; nome: string } | null> {
  const [r] = await query<{ id: number; nome: string }>(
    `SELECT p.id, p.nome FROM sorteio s JOIN participantes p ON p.id = s.recebedor_id
      WHERE s.doador_id = $1 AND s.revelado_em IS NOT NULL`,
    [participanteId],
  );
  return r ?? null;
}

const TZ = 'America/Sao_Paulo';

export function formatarData(d: Date | null) {
  if (!d) return '';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, dateStyle: 'long', timeStyle: 'short' }).format(new Date(d));
}

/** Date -> valor de <input type="datetime-local"> no horário de Brasília. */
export function paraInputData(d: Date | null) {
  if (!d) return '';
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(d))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Valor de datetime-local (horário de Brasília, UTC-3) -> Date. */
export function deInputData(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return null;
  const d = new Date(`${v.slice(0, 16)}:00-03:00`);
  return isNaN(d.getTime()) ? null : d;
}

export function formatarValor(v: string | number | null) {
  if (v === null || v === '') return '';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function faixaDeValor(jogo: Jogo) {
  const min = formatarValor(jogo.valor_min);
  const max = formatarValor(jogo.valor_max);
  if (min && max) return min === max ? min : `de ${min} a ${max}`;
  if (max) return `até ${max}`;
  if (min) return `a partir de ${min}`;
  return '';
}
