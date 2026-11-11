import { ehAdmin, participanteAtual } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) return new Response(null, { status: 404 });
  if (!(await participanteAtual()) && !(await ehAdmin())) return new Response(null, { status: 401 });

  const [d] = await query<{ imagem: Uint8Array | null; imagem_tipo: string | null }>(
    'SELECT imagem, imagem_tipo FROM desejos WHERE id = $1',
    [Number(id)],
  );
  if (!d?.imagem) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(d.imagem), {
    headers: {
      'content-type': d.imagem_tipo ?? 'image/jpeg',
      'cache-control': 'private, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}
