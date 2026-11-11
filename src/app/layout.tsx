import type { Metadata, Viewport } from 'next';
import { Nunito, Playfair_Display } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const titulo = Playfair_Display({ subsets: ['latin'], variable: '--fonte-titulo', display: 'swap' });
const corpo = Nunito({ subsets: ['latin'], variable: '--fonte-corpo', display: 'swap' });

export const metadata: Metadata = {
  title: 'Amigo Secreto · Família Matiolli',
  description: 'O amigo secreto de Natal da Família Matiolli.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#a80f1f' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${titulo.variable} ${corpo.variable}`}>
      <body>
        <div className="faixa" aria-hidden="true" />
        <header className="topo">
          <Link href="/" className="marca">
            <span className="marca-estrela" aria-hidden="true">✦</span>
            <span>
              <small>Família Matiolli</small>
              Amigo Secreto
            </span>
          </Link>
        </header>
        <main className="conteudo">{children}</main>
        <footer className="rodape">
          <span aria-hidden="true">🎄</span> Feito com carinho para a Família Matiolli
        </footer>
      </body>
    </html>
  );
}
