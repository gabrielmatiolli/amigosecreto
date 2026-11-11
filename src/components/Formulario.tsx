'use client';

import { startTransition, useActionState, useEffect, useRef, useState, type ReactNode } from 'react';
import { definirFoto } from '@/app/actions';
import type { Estado } from '@/lib/jogo';

type Acao = (anterior: Estado, dados: FormData) => Promise<Estado>;

/** Formulário ligado a uma server action, com mensagem de erro/sucesso e botão com estado de espera. */
export function Formulario({
  action,
  botao,
  aguarde = 'Aguarde…',
  className = '',
  classeBotao = 'botao',
  limparAoConcluir = false,
  children,
}: {
  action: Acao;
  botao: string;
  aguarde?: string;
  className?: string;
  classeBotao?: string;
  limparAoConcluir?: boolean;
  children?: ReactNode;
}) {
  const [estado, enviar, pendente] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (limparAoConcluir && estado.ok) ref.current?.reset();
  }, [estado, limparAoConcluir]);

  return (
    <form
      ref={ref}
      className={`formulario ${className}`}
      onSubmit={(e) => {
        // Mantém os campos preenchidos quando a ação devolve erro (o React limparia o formulário).
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        startTransition(() => enviar(dados));
      }}
    >
      {children}
      {estado.erro && <p className="aviso aviso-erro" role="alert">{estado.erro}</p>}
      {estado.ok && <p className="aviso aviso-ok" role="status">{estado.ok}</p>}
      <button className={classeBotao} disabled={pendente}>
        {pendente ? aguarde : botao}
      </button>
    </form>
  );
}

/** Botão de formulário que pede confirmação antes de enviar. */
export function BotaoConfirmar({ mensagem, className = 'botao-texto perigo', children }: { mensagem: string; className?: string; children: ReactNode }) {
  return (
    <button
      className={className}
      onClick={(e) => {
        if (!confirm(mensagem)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

/** Mostra o nome sorteado atrás de um botão, para ninguém ver por cima do ombro. */
export function Revelacao({ nome, children }: { nome: string; children?: ReactNode }) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div className="revelacao">
      <p className="revelacao-rotulo">Você tirou</p>
      <p className={`revelacao-nome ${visivel ? '' : 'oculto'}`} aria-live="polite">
        {visivel ? nome : '🎁 ? ? ? 🎁'}
      </p>
      <button type="button" className="botao botao-dourado" onClick={() => setVisivel((v) => !v)}>
        {visivel ? 'Esconder' : 'Mostrar meu amigo secreto'}
      </button>
      {visivel && children}
    </div>
  );
}

export function CopiarLink({ link, texto }: { link: string; texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="copiar">
      <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Link de convite" />
      <div className="linha">
        <button
          type="button"
          className="botao"
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          }}
        >
          {copiado ? 'Copiado!' : 'Copiar link'}
        </button>
        <a className="botao botao-verde" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`${texto} ${link}`)}`}>
          Enviar pelo WhatsApp
        </a>
      </div>
    </div>
  );
}

/** Envio manual de foto (reduzida no navegador), para lojas que bloqueiam a consulta automática. */
export function EnviarFoto({ id }: { id: number }) {
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  return (
    <label className="enviar-foto">
      {enviando ? 'Enviando…' : '📷 Adicionar foto'}
      <input
        type="file"
        accept="image/*"
        disabled={enviando}
        onChange={async (e) => {
          const arquivo = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (!arquivo) return;
          setErro('');
          setEnviando(true);
          try {
            const img = await createImageBitmap(arquivo);
            const escala = Math.min(1, 800 / Math.max(img.width, img.height));
            const tela = document.createElement('canvas');
            tela.width = Math.round(img.width * escala);
            tela.height = Math.round(img.height * escala);
            const ctx = tela.getContext('2d')!;
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, tela.width, tela.height);
            ctx.drawImage(img, 0, 0, tela.width, tela.height);
            const blob = await new Promise<Blob | null>((ok) => tela.toBlob(ok, 'image/jpeg', 0.82));
            if (!blob) throw new Error();
            const dados = new FormData();
            dados.set('id', String(id));
            dados.set('foto', new File([blob], 'foto.jpg', { type: 'image/jpeg' }));
            const r = await definirFoto(dados);
            if (r.erro) setErro(r.erro);
          } catch {
            setErro('Não consegui usar essa imagem.');
          } finally {
            setEnviando(false);
          }
        }}
      />
      {erro && <small role="alert">{erro}</small>}
    </label>
  );
}
