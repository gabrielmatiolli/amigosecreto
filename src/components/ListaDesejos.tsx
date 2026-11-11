import { removerDesejo } from '@/app/actions';
import type { Desejo } from '@/lib/jogo';
import { BotaoConfirmar, EnviarFoto } from './Formulario';

export function ListaDesejos({ itens, editavel = false, vazio }: { itens: Desejo[]; editavel?: boolean; vazio: string }) {
  if (itens.length === 0) return <p className="vazio">{vazio}</p>;
  return (
    <ul className="desejos">
      {itens.map((d) => (
        <li key={d.id} className="desejo">
          <div className="desejo-foto">
            {d.tem_imagem ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/imagem/${d.id}`} alt="" loading="lazy" />
            ) : (
              <span aria-hidden="true">🎁</span>
            )}
          </div>
          <div className="desejo-corpo">
            {d.loja && <span className="etiqueta">{d.loja}</span>}
            <h3>{d.titulo}</h3>
            {d.preco && <p className="preco">{d.preco}</p>}
            {d.observacao && <p className="observacao">“{d.observacao}”</p>}
            <div className="desejo-acoes">
              {d.url && (
                <a href={d.url} target="_blank" rel="noopener noreferrer nofollow" className="botao botao-pequeno">
                  Ver na loja ↗
                </a>
              )}
              {editavel && !d.tem_imagem && <EnviarFoto id={d.id} />}
              {editavel && (
                <form action={removerDesejo}>
                  <input type="hidden" name="id" value={d.id} />
                  <BotaoConfirmar mensagem={`Remover "${d.titulo}" da sua lista?`}>Remover</BotaoConfirmar>
                </form>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
