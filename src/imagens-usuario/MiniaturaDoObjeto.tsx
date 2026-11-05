/**
 * A miniatura de um objeto nas grades (grupo, busca, coleções, sugestões). "Usar como principal" (decisão 33): se
 * o objeto tem uma imagem do usuário marcada como principal, ela é a capa; senão, a miniatura do livro.
 */
import { useCallback } from 'react'
import { useEstado, type Estado } from '../usuario/estado'
import { Miniatura, MSG_IMAGEM_OFFLINE } from '../ui/Miniatura'
import { principalDoObjeto } from './registro'
import { useUrlDoUsuario } from './urls'

interface Props {
  /** O número do objeto (ou o id de um objeto SKC). */
  numero: string
  /** A miniatura do livro (caminho no pacote), ou null. */
  caminho: string | null
  alt: string
}

export function MiniaturaDoObjeto({ numero, caminho, alt }: Props) {
  const principal = useEstado(useCallback((e: Estado) => principalDoObjeto(e, numero), [numero]))
  if (!principal) return <Miniatura caminho={caminho} alt={alt} />
  return <MiniaturaDoUsuario id={principal.id} alt={alt} />
}

function MiniaturaDoUsuario({ id, alt }: { id: string; alt: string }) {
  const r = useUrlDoUsuario(id, 'miniatura')
  if (r.estado === 'ok') return <img className="miniatura-imagem" src={r.url} alt={alt} decoding="async" />
  if (r.estado === 'carregando') return <span className="miniatura-aviso" aria-hidden="true" />
  return <span className="miniatura-aviso">{r.estado === 'ausente' ? 'Imagem ainda não enviada pelo outro aparelho' : MSG_IMAGEM_OFFLINE}</span>
}
