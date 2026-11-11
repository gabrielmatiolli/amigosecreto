import { redirect } from 'next/navigation';
import { entrar } from './actions';
import { Formulario } from '@/components/Formulario';
import { participanteAtual } from '@/lib/auth';
import { formatarData, obterJogo } from '@/lib/jogo';

export const dynamic = 'force-dynamic';

export default async function Inicio() {
  if (await participanteAtual()) redirect('/painel');
  const jogo = await obterJogo();

  return (
    <div className="duas-colunas">
      <section className="heroi">
        <p className="sobretitulo">Natal em família</p>
        <h1>{jogo.nome}</h1>
        <p>
          Monte sua lista de desejos, descubra quem você tirou e prepare o presente perfeito.
          {jogo.data_festa && <> A festa será em <strong>{formatarData(jogo.data_festa)}</strong>.</>}
        </p>
        <p className="suave">
          Ainda não participa? Peça o <strong>link de convite</strong> ao administrador da família.
        </p>
      </section>

      <section className="cartao">
        <h2>Já participo</h2>
        <Formulario action={entrar} botao="Entrar">
          <label>
            Telefone ou e-mail
            <input name="contato" required autoComplete="username" placeholder="(11) 91234-5678 ou voce@email.com" />
          </label>
          <label>
            PIN de 4 números
            <input name="pin" required inputMode="numeric" pattern="\d{4}" maxLength={4} type="password" autoComplete="current-password" placeholder="••••" />
          </label>
        </Formulario>
      </section>
    </div>
  );
}
