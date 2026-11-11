import { headers } from 'next/headers';
import {
  adminEntrar,
  adminSair,
  alternarInscricoes,
  gerarNovoConvite,
  redefinirPin,
  reiniciarSorteio,
  removerParticipante,
  salvarConfig,
} from '@/app/actions';
import { BotaoConfirmar, CopiarLink, Formulario } from '@/components/Formulario';
import { ehAdmin, formatarContato } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatarData, obterJogo, paraInputData, situacao } from '@/lib/jogo';

export const dynamic = 'force-dynamic';

interface Linha {
  id: number;
  nome: string;
  contato: string;
  tipo_contato: string;
  itens: number;
  revelou: boolean;
}

export default async function Admin() {
  if (!(await ehAdmin())) {
    return (
      <section className="cartao estreito">
        <p className="sobretitulo">Área restrita</p>
        <h1>Administrador</h1>
        <Formulario action={adminEntrar} botao="Entrar">
          <label>
            Senha
            <input name="senha" type="password" required autoComplete="current-password" />
          </label>
        </Formulario>
      </section>
    );
  }

  const [jogo, participantes, h] = await Promise.all([
    obterJogo(),
    query<Linha>(
      `SELECT p.id, p.nome, p.contato, p.tipo_contato,
              (SELECT count(*)::int FROM desejos d WHERE d.participante_id = p.id) AS itens,
              EXISTS (SELECT 1 FROM sorteio s WHERE s.doador_id = p.id AND s.revelado_em IS NOT NULL) AS revelou
         FROM participantes p ORDER BY p.id`,
    ),
    headers(),
  ]);
  const s = situacao(jogo, participantes.length);
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const link = `${proto}://${host}/convite/${jogo.codigo_convite}`;
  const revelaram = participantes.filter((p) => p.revelou).length;

  const status = s.sorteado
    ? `Sorteio em andamento: ${revelaram} de ${s.total} já tiraram o seu amigo secreto.`
    : s.sorteioLiberado
      ? `Inscrições encerradas com ${s.total} participantes. Sorteio liberado — ninguém sorteou ainda.`
      : s.inscricoesAbertas
        ? `Inscrições abertas${jogo.data_limite ? ` até ${formatarData(jogo.data_limite)}` : ' (sem data limite)'}. ${s.total} participante(s), mínimo de ${jogo.min_participantes}.`
        : `Inscrições encerradas, mas faltam ${s.faltam} participante(s) para o mínimo. Reabra as inscrições ou reduza o mínimo.`;

  return (
    <div className="pilha">
      <div className="saudacao">
        <div>
          <p className="sobretitulo">Painel do administrador</p>
          <h1>{jogo.nome}</h1>
        </div>
        <form action={adminSair}>
          <button className="botao-texto">Sair</button>
        </form>
      </div>

      <p className={`aviso ${s.sorteioLiberado ? 'aviso-ok' : 'aviso-info'}`}>{status}</p>

      <section className="cartao">
        <h2>Link de convite</h2>
        <p className="suave">Envie este link para a família. Quem abrir preenche nome, telefone ou e-mail e cria um PIN.</p>
        <CopiarLink link={link} texto={`Entre no ${jogo.nome}! 🎄`} />
        <div className="linha">
          {!s.sorteado && (
            <form action={alternarInscricoes}>
              <input type="hidden" name="encerrar" value={jogo.inscricoes_encerradas ? '0' : '1'} />
              {jogo.inscricoes_encerradas ? (
                <button className="botao-texto">Reabrir inscrições</button>
              ) : (
                <BotaoConfirmar className="botao-texto" mensagem="Encerrar as inscrições agora? Ninguém mais poderá entrar e, havendo o mínimo de participantes, o sorteio será liberado.">
                  Encerrar inscrições agora
                </BotaoConfirmar>
              )}
            </form>
          )}
          <form action={gerarNovoConvite}>
            <BotaoConfirmar mensagem="Gerar um novo link? O link atual deixará de funcionar.">Gerar novo link</BotaoConfirmar>
          </form>
        </div>
      </section>

      <section className="cartao">
        <h2>Configurações</h2>
        <Formulario action={salvarConfig} botao="Salvar configurações" className="form-grade">
          <label className="largo">
            Nome do jogo
            <input name="nome" defaultValue={jogo.nome} maxLength={80} required />
          </label>
          <label>
            Mínimo de participantes
            <input name="min_participantes" type="number" min={3} max={200} defaultValue={jogo.min_participantes} required />
          </label>
          <label>
            Data limite para entrar <small>(horário de Brasília)</small>
            <input name="data_limite" type="datetime-local" defaultValue={paraInputData(jogo.data_limite)} />
          </label>
          <label>
            Valor mínimo do presente (R$)
            <input name="valor_min" inputMode="decimal" defaultValue={jogo.valor_min === null ? '' : String(Number(jogo.valor_min)).replace('.', ',')} placeholder="50" />
          </label>
          <label>
            Valor máximo do presente (R$)
            <input name="valor_max" inputMode="decimal" defaultValue={jogo.valor_max === null ? '' : String(Number(jogo.valor_max)).replace('.', ',')} placeholder="100" />
          </label>
          <label>
            Data da festa
            <input name="data_festa" type="datetime-local" defaultValue={paraInputData(jogo.data_festa)} />
          </label>
          <label>
            Local da festa
            <input name="local_festa" defaultValue={jogo.local_festa ?? ''} maxLength={200} placeholder="Casa da vovó" />
          </label>
        </Formulario>
        <p className="suave">
          Quando a data limite passar (ou você encerrar as inscrições) e houver o mínimo de participantes, cada pessoa poderá sortear o seu amigo secreto.
        </p>
      </section>

      <section className="cartao">
        <h2>Participantes ({participantes.length})</h2>
        {participantes.length === 0 ? (
          <p className="vazio">Ninguém entrou ainda. Envie o link de convite!</p>
        ) : (
          <ul className="admin-lista">
            {participantes.map((p) => (
              <li key={p.id}>
                <div>
                  <strong>{p.nome}</strong>
                  <small>
                    {formatarContato(p.contato, p.tipo_contato)} · {p.itens} {p.itens === 1 ? 'desejo' : 'desejos'}
                    {s.sorteado && <> · {p.revelou ? '✅ já sorteou' : '⏳ ainda não sorteou'}</>}
                  </small>
                </div>
                <details>
                  <summary>Opções</summary>
                  <Formulario action={redefinirPin} botao="Redefinir PIN" classeBotao="botao botao-pequeno" className="form-inline">
                    <input type="hidden" name="id" value={p.id} />
                    <input name="pin" inputMode="numeric" pattern="\d{4}" maxLength={4} placeholder="Novo PIN" required aria-label={`Novo PIN de ${p.nome}`} />
                  </Formulario>
                  {!s.sorteado && (
                    <form action={removerParticipante}>
                      <input type="hidden" name="id" value={p.id} />
                      <BotaoConfirmar mensagem={`Remover ${p.nome} do amigo secreto? A lista de desejos dessa pessoa também será apagada.`}>
                        Remover participante
                      </BotaoConfirmar>
                    </form>
                  )}
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      {s.sorteado && (
        <section className="cartao cartao-perigo">
          <h2>Reiniciar sorteio</h2>
          <p>
            Apaga todos os pares já sorteados (inclusive os que já foram vistos) para que todos sorteiem de novo.
            Use apenas se algo deu errado — por exemplo, se alguém desistiu.
          </p>
          <form action={reiniciarSorteio}>
            <BotaoConfirmar className="botao botao-perigo" mensagem="Tem certeza? Todos os pares serão apagados e quem já viu o seu amigo secreto terá que sortear novamente.">
              Reiniciar sorteio
            </BotaoConfirmar>
          </form>
        </section>
      )}
    </div>
  );
}
