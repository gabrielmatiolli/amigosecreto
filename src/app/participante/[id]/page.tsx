import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ListaDesejos } from '@/components/ListaDesejos';
import { participanteAtual } from '@/lib/auth';
import { query } from '@/lib/db';
import { listarDesejos } from '@/lib/jogo';

export const dynamic = 'force-dynamic';

export default async function ListaDoParticipante({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await participanteAtual())) redirect('/');
  if (!/^\d{1,9}$/.test(id)) notFound();

  const [pessoa] = await query<{ id: number; nome: string }>('SELECT id, nome FROM participantes WHERE id = $1', [Number(id)]);
  if (!pessoa) notFound();
  const itens = await listarDesejos(pessoa.id);

  return (
    <div className="pilha">
      <Link href="/painel" className="voltar">← Voltar</Link>
      <section className="cartao">
        <p className="sobretitulo">Lista de desejos</p>
        <h1>{pessoa.nome}</h1>
        <ListaDesejos itens={itens} vazio={`${pessoa.nome.split(' ')[0]} ainda não adicionou nenhum desejo.`} />
      </section>
    </div>
  );
}
