import Link from 'next/link';
import { redirect } from 'next/navigation';
import { adicionarDesejo, sair, sortear } from '@/app/actions';
import { Formulario, Revelacao } from '@/components/Formulario';
import { ListaDesejos } from '@/components/ListaDesejos';
import { participanteAtual } from '@/lib/auth';
import { query } from '@/lib/db';
import { amigoDe, faixaDeValor, formatarData, listarDesejos, obterJogo, situacao } from '@/lib/jogo';

export const dynamic = 'force-dynamic';

export default async function Painel() {
  const eu = await participanteAtual();
  if (!eu) redirect('/');

  const [jogo, participantes, meusDesejos, amigo] = await Promise.all([
    obterJogo(),
    query<{ id: number; nome: string; itens: number }>(
      `SELECT p.id, p.nome, (SELECT count(*)::int FROM desejos d WHERE d.participante_id = p.id) AS itens
         FROM participantes p ORDER BY lower(p.nome)`,
    ),
    listarDesejos(eu.id),
    amigoDe(eu.id),
  ]);
  const s = situacao(jogo, participantes.length);
  const faixa = faixaDeValor(jogo);

  return (
    <div className="pilha">
      <div className="saudacao">
        <div>
          <p className="sobretitulo">{jogo.nome}</p>
          <h1>Olá, {eu.nome.split(' ')[0]}!</h1>
        </div>
        <form action={sair}>
          <button className="botao-texto">Sair</button>
        </form>
      </div>

      <section className="cartao cartao-sorteio">
        {amigo ? (
          <Revelacao nome={amigo.nome}>
            <Link className="botao botao-claro" href={`/participante/${amigo.id}`}>
              Ver a lista de desejos de {amigo.nome.split(' ')[0]}
            </Link>
          </Revelacao>
        ) : s.sorteioLiberado ? (
          <>
            <h2>Chegou a hora!</h2>
            <p>As inscrições foram encerradas com {s.total} participantes. Tire o seu papelzinho — só você verá o resultado.</p>
            <Formulario action={sortear} botao="🎁 Sortear meu amigo secreto" aguarde="Sorteando…" classeBotao="botao botao-dourado botao-grande" />
          </>
        ) : s.inscricoesAbertas ? (
          <>
            <h2>O sorteio ainda não começou</h2>
            <p>
              {jogo.data_limite
                ? <>As inscrições ficam abertas até <strong>{formatarData(jogo.data_limite)}</strong>. Depois disso, volte aqui para sortear.</>
                : <>O sorteio será liberado quando o administrador encerrar as inscrições.</>}
            </p>
            <p className="contagem">
              <strong>{s.total}</strong> {s.total === 1 ? 'participante' : 'participantes'} · mínimo de {jogo.min_participantes}
              {s.faltam > 0 && <> · faltam {s.faltam}</>}
            </p>
          </>
        ) : (
          <>
            <h2>Ainda falta gente</h2>
            <p>
              As inscrições terminaram com {s.total} {s.total === 1 ? 'participante' : 'participantes'}, mas o mínimo é {jogo.min_participantes}.
              Fale com o administrador para reabrir as inscrições.
            </p>
          </>
        )}
      </section>

      {(faixa || jogo.data_festa || jogo.local_festa) && (
        <ul className="fatos fatos-linha">
          {faixa && <li><span aria-hidden="true">🎁</span> Valor sugerido: <strong>{faixa}</strong></li>}
          {jogo.data_festa && <li><span aria-hidden="true">🎄</span> Festa: <strong>{formatarData(jogo.data_festa)}</strong></li>}
          {jogo.local_festa && <li><span aria-hidden="true">📍</span> {jogo.local_festa}</li>}
        </ul>
      )}

      <section className="cartao">
        <h2>Minha lista de desejos</h2>
        <p className="suave">Cole o link de um produto (Shopee, Amazon, Mercado Livre…) e a foto é salva automaticamente. Toda a família pode ver sua lista.</p>
        <Formulario action={adicionarDesejo} botao="Adicionar à lista" aguarde="Buscando o produto…" className="form-desejo" limparAoConcluir>
          <label className="largo">
            Link do produto
            <input name="url" inputMode="url" placeholder="https://shopee.com.br/…" maxLength={2000} />
          </label>
          <label>
            Nome do presente <small>(opcional se tiver link)</small>
            <input name="titulo" maxLength={200} placeholder="Ex.: Livro de receitas" />
          </label>
          <label>
            Observação <small>(tamanho, cor…)</small>
            <input name="observacao" maxLength={300} placeholder="Ex.: tamanho M, cor verde" />
          </label>
        </Formulario>
        <ListaDesejos itens={meusDesejos} editavel vazio="Sua lista está vazia. Adicione o primeiro presente acima!" />
      </section>

      <section className="cartao">
        <h2>Quem está participando</h2>
        <ul className="pessoas">
          {participantes.map((p) => (
            <li key={p.id}>
              <Link href={`/participante/${p.id}`}>
                <span className="avatar" aria-hidden="true">{p.nome[0]?.toUpperCase()}</span>
                <span>
                  <strong>{p.nome}{p.id === eu.id && ' (você)'}</strong>
                  <small>{p.itens === 0 ? 'lista vazia' : `${p.itens} ${p.itens === 1 ? 'desejo' : 'desejos'}`}</small>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
