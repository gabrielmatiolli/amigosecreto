import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cadastrar } from '@/app/actions';
import { Formulario } from '@/components/Formulario';
import { participanteAtual } from '@/lib/auth';
import { contarParticipantes, faixaDeValor, formatarData, obterJogo, situacao } from '@/lib/jogo';

export const dynamic = 'force-dynamic';

export default async function Convite({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  if (await participanteAtual()) redirect('/painel');

  const jogo = await obterJogo();
  const total = await contarParticipantes();
  const s = situacao(jogo, total);

  if (codigo !== jogo.codigo_convite) {
    return (
      <section className="cartao estreito centro">
        <h1>Convite inválido</h1>
        <p>Este link não é mais válido. Peça um novo link ao administrador da família.</p>
        <Link className="botao" href="/">Ir para o início</Link>
      </section>
    );
  }

  if (!s.inscricoesAbertas) {
    return (
      <section className="cartao estreito centro">
        <h1>Inscrições encerradas</h1>
        <p>O prazo para entrar no amigo secreto já terminou. Se você já se cadastrou, entre com seu PIN.</p>
        <Link className="botao" href="/">Já participo</Link>
      </section>
    );
  }

  const faixa = faixaDeValor(jogo);

  return (
    <div className="duas-colunas">
      <section className="heroi">
        <p className="sobretitulo">Você foi convidado!</p>
        <h1>{jogo.nome}</h1>
        <ul className="fatos">
          <li><span aria-hidden="true">🎅</span> {total === 0 ? 'Seja o primeiro a entrar' : `${total} ${total === 1 ? 'pessoa já entrou' : 'pessoas já entraram'}`}</li>
          {jogo.data_limite && <li><span aria-hidden="true">⏰</span> Entre até {formatarData(jogo.data_limite)}</li>}
          {faixa && <li><span aria-hidden="true">🎁</span> Presentes {faixa}</li>}
          {jogo.data_festa && <li><span aria-hidden="true">🎄</span> Festa em {formatarData(jogo.data_festa)}</li>}
          {jogo.local_festa && <li><span aria-hidden="true">📍</span> {jogo.local_festa}</li>}
        </ul>
      </section>

      <section className="cartao">
        <h2>Quero participar</h2>
        <Formulario action={cadastrar} botao="Entrar no amigo secreto">
          <input type="hidden" name="codigo" value={codigo} />
          <label>
            Seu nome
            <input name="nome" required minLength={2} maxLength={60} autoComplete="name" placeholder="Como a família te chama" />
          </label>
          <label>
            Telefone ou e-mail
            <input name="contato" required autoComplete="username" placeholder="(11) 91234-5678 ou voce@email.com" />
          </label>
          <label>
            Crie um PIN de 4 números
            <input name="pin" required inputMode="numeric" pattern="\d{4}" maxLength={4} type="password" autoComplete="new-password" placeholder="••••" />
            <small>Você vai usar o PIN para voltar ao site e ver quem tirou. Não esqueça!</small>
          </label>
        </Formulario>
        <p className="suave centro">Já se cadastrou? <Link href="/">Entre com seu PIN</Link></p>
      </section>
    </div>
  );
}
