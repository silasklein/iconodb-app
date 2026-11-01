import { useEffect, useState } from 'react'
import type { Imagem } from '../banco/tipos'
import { caixaGirada, type Tamanho } from '../imagem/zoom'
import { urlImagem } from '../pacote/imagens'

/**
 * O que o item e o visualizador compartilham da imagem (decisão 10): o desenho de traço aparece
 * invertido sobre o painel preto (`filter: invert(1)`), o resto como está.
 */
export const estiloDeInversao = (modo: Imagem['display_mode'], original: boolean) =>
  modo === 'traco' && !original ? ({ filter: 'invert(1)' } as const) : undefined

/**
 * O giro com que o livro imprime a figura (`rotacao`, graus no sentido horário), a mesma regra no
 * item e no visualizador: abaixo de 0,5° (ou sem rotação) não gira.
 */
export const giroDaImagem = (rotacao: number | null): number => (rotacao !== null && Math.abs(rotacao) >= 0.5 ? rotacao : 0)

/** O transform CSS do giro, o mesmo para a imagem e para o desenho das regiões por cima. */
export const transformDoGiro = (graus: number) => `rotate(${graus}deg)`

/**
 * A caixa que contém a figura girada. `razao` é largura/altura da caixa; `fracao` é o tamanho da
 * figura (antes de girar) como fração da caixa, em cada direção: a 90° a caixa troca largura e altura
 * e a figura passa a medir, por exemplo, 75 % × 133 % dela. A figura gira em torno do centro da caixa.
 */
export function geometriaGirada(figura: Tamanho, graus: number) {
  const caixa = caixaGirada(figura, graus)
  return { caixa, razao: caixa.w / caixa.h, fracao: { w: figura.w / caixa.w, h: figura.h / caixa.h } }
}

/** Os pontos de uma região (0 a 1) no formato do atributo `points` de um polígono SVG. */
export const pontosDoPoligono = (pontos: readonly (readonly [number, number])[]) => pontos.map(([x, y]) => `${x},${y}`).join(' ')

export interface UrlDaImagem {
  url: string | null
  /** Sem cópia no aparelho e sem rede (ou a imagem não carregou): o marcador no lugar. */
  falhou: boolean
  aoFalhar: () => void
}

/**
 * A URL da imagem no pacote (`urlImagem`): `null` até chegar; `falhou` quando não há cópia e não há
 * rede, para mostrar "Imagem disponível quando houver internet" em vez de uma imagem quebrada.
 */
export function useUrlDaImagem(caminho: string | null): UrlDaImagem {
  const [url, setUrl] = useState<string | null>(null)
  const [falhou, setFalhou] = useState(false)
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
  // Se a imagem não carrega (arquivo ruim ou sumido), some o <img> e fica o marcador.
  return { url: falhou ? null : url, falhou, aoFalhar: () => setFalhou(true) }
}
