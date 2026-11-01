import { useEffect, useState } from 'react'
import { urlImagem } from '../pacote/imagens'
import './ImagemDeCapa.css'

interface Props {
  /** Caminho da miniatura no pacote; null = sem capa. */
  caminho: string | null
  className?: string
}

/**
 * Imagem decorativa (a capa do Início e do Grupo): `alt` vazio. Se a imagem não está no
 * aparelho e não há internet, não desenha nada (nem imagem quebrada, nem aviso: é enfeite).
 */
export function ImagemDeCapa({ caminho, className = '' }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    setUrl(null)
    if (!caminho) return
    let atual = true
    urlImagem(caminho).then(
      (u) => atual && setUrl(u),
      () => undefined,
    )
    return () => {
      atual = false
    }
  }, [caminho])
  if (!url) return null
  return <img className={`imagem-capa ${className}`.trim()} src={url} alt="" decoding="async" />
}
