import { useEffect, useState } from 'react'
import type { Imagem, Regiao } from '../banco/tipos'
import { urlImagem } from '../pacote/imagens'
import { IconButton } from '../ui/IconButton'
import { MSG_IMAGEM_OFFLINE } from '../ui/Miniatura'
import './ImagemItem.css'

interface Props {
  /** Número do objeto (para o texto alternativo). */
  numero: string
  imagens: readonly Imagem[]
  /** As regiões marcadas de cada imagem (id da imagem → regiões). */
  regioes?: Readonly<Record<string, readonly Regiao[]>>
  /** O elemento da hipótese aberta: as regiões dele acendem por cima da imagem. */
  elementoAceso?: string | null
  /** Computador: a dica "Clique na imagem mostra o original" no pé. */
  comDica?: boolean
}

/**
 * A imagem do item sobre o painel preto (decisão 10): o desenho de traço aparece invertido
 * (`filter: invert(1)`), o resto como está. Tocar (ou Enter/Espaço) no desenho mostra o original
 * e de novo volta; é um botão com `aria-pressed`. A região da hipótese aberta acende num SVG por
 * cima, com as coordenadas de 0 a 1 do banco (viewBox 0 0 1 1 sobre a caixa exata da imagem).
 * "Ampliar a imagem" leva ao visualizador (`#/imagem/<id>`, Tarefa 9).
 */
export function ImagemItem({ numero, imagens, regioes = {}, elementoAceso = null, comDica = false }: Props) {
  const [indice, setIndice] = useState(0)
  const [original, setOriginal] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [falhou, setFalhou] = useState(false)
  const atual = imagens[Math.min(indice, imagens.length - 1)]
  const caminho = atual?.tela ?? atual?.miniatura ?? null

  // Outro objeto: volta à primeira imagem, invertida.
  const chaveDoObjeto = imagens.map((i) => i.id).join(' ')
  useEffect(() => {
    setIndice(0)
    setOriginal(false)
  }, [chaveDoObjeto])

  // A hipótese aberta fala de um elemento marcado só em outra imagem: mostra essa.
  useEffect(() => {
    if (!elementoAceso) return
    const temAqui = (img?: Imagem) => !!img && (regioes[img.id] ?? []).some((r) => r.elementoId === elementoAceso)
    if (temAqui(atual)) return
    const outra = imagens.findIndex((img) => temAqui(img))
    if (outra >= 0) setIndice(outra)
  }, [elementoAceso, regioes])

  useEffect(() => {
    setUrl(null)
    setFalhou(false)
    if (!caminho) return
    let vivo = true
    urlImagem(caminho).then(
      (u) => {
        if (!vivo) return
        if (u) setUrl(u)
        else setFalhou(true)
      },
      () => vivo && setFalhou(true),
    )
    return () => {
      vivo = false
    }
  }, [caminho])

  if (!atual) {
    return (
      <div className="imagem-item">
        <div className="imagem-item-painel">
          <span className="imagem-item-aviso">Sem imagem</span>
        </div>
      </div>
    )
  }

  const traco = atual.display_mode === 'traco'
  const invertida = traco && !original
  const acesas = elementoAceso ? (regioes[atual.id] ?? []).filter((r) => r.elementoId === elementoAceso) : []
  const alt = `Imagem ${atual.ordinal} de ${numero}${invertida ? ', invertida' : ''}`

  const figura = url ? (
    <span className="imagem-item-figura">
      <img src={url} alt={alt} decoding="async" style={invertida ? { filter: 'invert(1)' } : undefined} onError={() => setFalhou(true)} />
      {acesas.length > 0 && (
        <svg className="imagem-item-regioes" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
          {acesas.map((r) => (
            <polygon key={r.id} points={r.pontos.map(([x, y]) => `${x},${y}`).join(' ')} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      )}
    </span>
  ) : (
    <span className="imagem-item-aviso" aria-hidden={!falhou}>
      {falhou ? MSG_IMAGEM_OFFLINE : ''}
    </span>
  )

  return (
    <div className="imagem-item">
      <div className="imagem-item-painel">
        {traco && url ? (
          <button type="button" className="imagem-item-alternar" aria-pressed={original} aria-label="Mostrar o original" onClick={() => setOriginal((v) => !v)}>
            {figura}
          </button>
        ) : (
          figura
        )}
        {acesas.length > 0 && <span className="so-leitor">{`Região acesa: ${acesas.map((r) => r.elemento).join(', ')}`}</span>}
        <div className="imagem-item-ampliar">
          <IconButton icon="ampliar" label="Ampliar a imagem" href={`#/imagem/${encodeURIComponent(atual.id)}`} tipAbove />
        </div>
      </div>
      {(imagens.length > 1 || (comDica && traco)) && (
        <div className="imagem-item-pe">
          {comDica && traco ? <span className="imagem-item-dica">{original ? 'Clique na imagem volta ao invertido' : 'Clique na imagem mostra o original'}</span> : <span />}
          {imagens.length > 1 && (
            <span className="imagem-item-paginas">
              <IconButton icon="anterior" label="Imagem anterior" tipAbove tipPosition="start" onClick={() => troca(-1)} />
              <span className="codigo">{`${indice + 1} / ${imagens.length}`}</span>
              <IconButton icon="proximo" label="Imagem seguinte" tipAbove onClick={() => troca(1)} />
            </span>
          )}
        </div>
      )}
      {atual.credito && <p className="imagem-item-credito">{atual.credito}</p>}
    </div>
  )

  function troca(passo: number) {
    setIndice((i) => (i + passo + imagens.length) % imagens.length)
    setOriginal(false)
  }
}
