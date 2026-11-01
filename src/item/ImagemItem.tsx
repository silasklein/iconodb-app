import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { useAtalhos } from '../app/useAtalhos'
import type { Imagem, Regiao } from '../banco/tipos'
import { consumirPedidoDeFoco } from '../imagem/estado'
import { IconButton } from '../ui/IconButton'
import { MSG_IMAGEM_OFFLINE } from '../ui/Miniatura'
import { estiloDeInversao, geometriaGirada, giroDaImagem, pontosDoPoligono, transformDoGiro, useUrlDaImagem } from './imagemComum'
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
  /**
   * "Ampliar a imagem": quem tem o roteador leva ao visualizador passando o estado (o original
   * ligado, para fechar voltando ao item). Sem isto, o botão é um link comum (`#/imagem/<id>`).
   */
  aoAmpliar?: (imagemId: string, original: boolean) => void
  /**
   * De volta do visualizador: a imagem que estava à vista e se o original estava ligado. Vale só
   * para este objeto (se a imagem não é dele, é ignorada) e só ao montar ou ao trocar de objeto.
   */
  inicial?: { imagemId: string; original: boolean } | null
}

function indiceInicial(imagens: readonly Imagem[], inicial: Props['inicial']): number {
  return inicial ? imagens.findIndex((i) => i.id === inicial.imagemId) : -1
}

/**
 * A imagem do item sobre o painel preto (decisão 10): o desenho de traço aparece invertido
 * (`filter: invert(1)`), o resto como está. Tocar (ou Enter/Espaço) no desenho mostra o original
 * e de novo volta; é um botão com `aria-pressed`. A região da hipótese aberta acende num SVG por
 * cima, com as coordenadas de 0 a 1 do banco (viewBox 0 0 1 1 sobre a caixa exata da imagem).
 * "Ampliar a imagem" leva ao visualizador (`#/imagem/<id>`, Tarefa 9).
 */
export function ImagemItem({ numero, imagens, regioes = {}, elementoAceso = null, comDica = false, aoAmpliar, inicial = null }: Props) {
  const ampliar = useRef<HTMLDivElement>(null)
  const [indice, setIndice] = useState(() => Math.max(indiceInicial(imagens, inicial), 0))
  const [original, setOriginal] = useState(() => (indiceInicial(imagens, inicial) >= 0 ? (inicial?.original ?? false) : false))
  const [natural, setNatural] = useState<{ caminho: string; w: number; h: number } | null>(null)
  const atual = imagens[Math.min(indice, imagens.length - 1)]
  const caminho = atual?.tela ?? atual?.miniatura ?? null

  // Outro objeto: volta à primeira imagem, invertida. (Ao montar, vale o `inicial`, que veio do visualizador.)
  const chaveDoObjeto = imagens.map((i) => i.id).join(' ')
  const objetoAnterior = useRef(chaveDoObjeto)
  useEffect(() => {
    if (objetoAnterior.current === chaveDoObjeto) return
    objetoAnterior.current = chaveDoObjeto
    const i = indiceInicial(imagens, inicial)
    setIndice(Math.max(i, 0))
    setOriginal(i >= 0 ? (inicial?.original ?? false) : false)
  }, [chaveDoObjeto])

  // A hipótese aberta fala de um elemento marcado só em outra imagem: mostra essa.
  useEffect(() => {
    if (!elementoAceso) return
    const temAqui = (img?: Imagem) => !!img && (regioes[img.id] ?? []).some((r) => r.elementoId === elementoAceso)
    if (temAqui(atual)) return
    const outra = imagens.findIndex((img) => temAqui(img))
    if (outra >= 0) setIndice(outra)
  }, [elementoAceso, regioes])

  // De volta do visualizador (Esc ou Fechar): o foco volta ao "Ampliar a imagem" desta tela nova.
  useEffect(() => {
    if (consumirPedidoDeFoco()) ampliar.current?.querySelector<HTMLElement>('a, button')?.focus()
  }, [])

  const { url, falhou, aoFalhar } = useUrlDaImagem(caminho)

  // Z amplia a imagem à vista (o mesmo que "Ampliar a imagem"), com o original se estiver ligado.
  useAtalhos({ z: () => (atual && aoAmpliar ? aoAmpliar(atual.id, original) : false) }, 'item')

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

  // O giro com que o livro imprime a figura: a imagem e as regiões giram juntas, dentro de uma caixa
  // que tem o tamanho da figura girada (a 90° troca largura e altura).
  const giro = giroDaImagem(atual.rotacao)
  const dimensoes = natural?.caminho === caminho ? { w: natural.w, h: natural.h } : atual.largura && atual.altura ? { w: atual.largura, h: atual.altura } : null
  const geometria = giro !== 0 && dimensoes ? geometriaGirada(dimensoes, giro) : null
  const pct = (fracao: number) => `${Number((fracao * 100).toFixed(4))}%`

  const miolo = (
    <>
      <img
        src={url ?? undefined}
        alt={alt}
        decoding="async"
        style={estiloDeInversao(atual.display_mode, original)}
        onError={aoFalhar}
        onLoad={(e) => {
          const { naturalWidth: w, naturalHeight: h } = e.currentTarget
          if (w > 0 && h > 0 && caminho) setNatural({ caminho, w, h })
        }}
      />
      {acesas.length > 0 && (
        <svg className="imagem-item-regioes" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
          {acesas.map((r) => (
            <polygon key={r.id} points={pontosDoPoligono(r.pontos)} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      )}
    </>
  )
  const estiloDaCaixa = geometria ? ({ '--razao': geometria.razao } as CSSProperties) : undefined
  const comBotao = traco && !!url
  const figura = url ? (
    <span className={`imagem-item-figura${geometria ? ' imagem-item-girada' : ''}`} style={estiloDaCaixa}>
      {geometria ? (
        <span
          className="imagem-item-giro"
          style={{ width: pct(geometria.fracao.w), height: pct(geometria.fracao.h), transform: `translate(-50%, -50%) ${transformDoGiro(giro)}` }}
        >
          {miolo}
        </span>
      ) : (
        miolo
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
        {comBotao ? (
          <button type="button" className={`imagem-item-alternar${geometria ? ' imagem-item-girada' : ''}`} style={estiloDaCaixa} aria-pressed={original} aria-label="Mostrar o original" onClick={() => setOriginal((v) => !v)}>
            {figura}
          </button>
        ) : (
          figura
        )}
        {acesas.length > 0 && <span className="so-leitor">{`Região acesa: ${acesas.map((r) => r.elemento).join(', ')}`}</span>}
        <div className="imagem-item-ampliar" ref={ampliar}>
          <IconButton icon="ampliar" label="Ampliar a imagem" shortcut="Z" href={`#/imagem/${encodeURIComponent(atual.id)}`} tipAbove onClick={aoAmpliar && ((e) => clicouEmAmpliar(e, atual.id))} />
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

  function clicouEmAmpliar(e: MouseEvent<HTMLAnchorElement>, id: string) {
    // Clique com modificador (abrir em outra aba…) segue o link; o comum vai pelo roteador.
    if (!aoAmpliar || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    aoAmpliar(id, original)
  }

  function troca(passo: number) {
    setIndice((i) => (i + passo + imagens.length) % imagens.length)
    setOriginal(false)
  }
}
