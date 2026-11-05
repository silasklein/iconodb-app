import { useEffect, useState } from 'react'
import type { Imagem } from '../banco/tipos'
import type { ImagemExibida } from '../imagens-usuario/exibicao'
import { useEsteAparelho } from '../imagens-usuario/exibicao'
import { useUrlDoUsuario } from '../imagens-usuario/urls'
import { caixaGirada, type Tamanho } from '../imagem/zoom'
import { urlImagem } from '../pacote/imagens'
import { MSG_IMAGEM_OFFLINE } from '../ui/Miniatura'

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

export const MSG_AINDA_NAO_ENVIADA = 'Imagem ainda não enviada pelo outro aparelho'
export const MSG_SEM_ARQUIVO = 'Imagem não encontrada neste aparelho nem no Dropbox'

export interface UrlDaImagemExibida extends UrlDaImagem {
  /** O que mostrar no lugar quando não há imagem (null enquanto carrega). */
  aviso: string | null
}

/**
 * A URL de uma imagem do livro (pacote) ou do usuário (camada do usuário, `useUrlDoUsuario`). Do outro aparelho, o
 * evento pode chegar antes dos arquivos: o aviso diz "ainda não enviada" e o hook tenta de novo sozinho.
 */
export function useUrlDaImagemExibida(img: ImagemExibida | undefined, versao: 'tela' | 'miniatura' = 'tela'): UrlDaImagemExibida {
  const doLivro = useUrlDaImagem(img && !img.skc ? (versao === 'tela' ? (img.tela ?? img.miniatura) : img.miniatura) : null)
  const doUsuario = useUrlDoUsuario(img?.skc ? img.id : null, versao)
  const [quebrou, setQuebrou] = useState<string | null>(null)
  const este = useEsteAparelho()
  if (!img?.skc) return { ...doLivro, aviso: doLivro.falhou ? MSG_IMAGEM_OFFLINE : null }
  const url = doUsuario.estado === 'ok' && quebrou !== doUsuario.url ? doUsuario.url : null
  const aviso =
    doUsuario.estado === 'ausente'
      ? este && img.skc.aparelho === este
        ? MSG_SEM_ARQUIVO
        : MSG_AINDA_NAO_ENVIADA
      : doUsuario.estado === 'indisponivel' || (doUsuario.estado === 'ok' && !url)
        ? MSG_IMAGEM_OFFLINE
        : null
  return { url, falhou: aviso !== null, aoFalhar: () => setQuebrou(doUsuario.estado === 'ok' ? doUsuario.url : null), aviso }
}
