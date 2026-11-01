import { useEffect, useState } from 'react'
import { urlImagem } from '../pacote/imagens'
import './Miniatura.css'

export const MSG_IMAGEM_OFFLINE = 'Imagem disponível quando houver internet'

interface Props {
  /** Caminho da miniatura no pacote (imagens/…/thumb-1.webp); null quando o objeto não tem imagem. */
  caminho: string | null
  alt: string
}

/**
 * A miniatura de um objeto sobre a área cinza das telas de consulta. Se a imagem não está
 * no aparelho e não há internet, mostra o marcador em vez de uma imagem quebrada.
 */
export function Miniatura({ caminho, alt }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [falhou, setFalhou] = useState(false)

  useEffect(() => {
    setUrl(null)
    setFalhou(false)
    if (!caminho) return
    let atual = true
    urlImagem(caminho)
      .then((u) => {
        if (!atual) return
        if (u) setUrl(u)
        else setFalhou(true)
      })
      .catch(() => atual && setFalhou(true))
    return () => {
      atual = false
    }
  }, [caminho])

  if (url) return <img className="miniatura-imagem" src={url} alt={alt} onError={() => setFalhou(true)} decoding="async" />
  if (!caminho) return <span className="miniatura-aviso">Sem imagem</span>
  if (falhou) return <span className="miniatura-aviso">{MSG_IMAGEM_OFFLINE}</span>
  return <span className="miniatura-aviso" aria-hidden="true" />
}
