/**
 * Ajudas dos testes das imagens do usuário (não entra no app): uma imagem já processada, sem canvas, e uma Escrita
 * falsa que registra os envios e pode falhar por caminho.
 */
import type { Escrita } from '../../src/dropbox/escrita'
import { ErroDeArquivoAusente, ErroDeConflito } from '../../src/dropbox/escrita'
import type { ImagemProcessada } from '../../src/imagens-usuario/processar'

export function processadaFalsa(extra: Partial<ImagemProcessada> = {}): ImagemProcessada {
  return {
    tela: new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'image/webp' }),
    miniatura: new Blob([new Uint8Array([6, 7])], { type: 'image/webp' }),
    original: new File([new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9])], 'IMG_2041.JPG', { type: 'image/jpeg' }),
    extensao: 'jpg',
    nome: 'IMG_2041.JPG',
    formato: 'webp',
    modoSugerido: 'tons',
    metricas: { extremes: 0.22, grey_core: 0.7585 },
    largura: 1600,
    altura: 1200,
    miniaturaLargura: 320,
    miniaturaAltura: 240,
    originalLargura: 8000,
    originalAltura: 6000,
    ...extra,
  }
}

export interface EscritaFalsa extends Escrita {
  enviados: Map<string, Uint8Array>
  chamadas: string[]
  /** caminho (ou '*') → erro a lançar no envio. */
  falhas: Map<string, unknown>
  /** Sessões de envio em partes: id → bytes já recebidos. */
  sessoes: Map<string, Uint8Array>
  /** Lança este erro depois de N partes confirmadas (uma rede que cai no meio de um original grande). */
  cairDepoisDe: { partes: number; erro: unknown } | null
}

export function escritaFalsa(): EscritaFalsa {
  const enviados = new Map<string, Uint8Array>()
  const chamadas: string[] = []
  const falhas = new Map<string, unknown>()
  const sessoes = new Map<string, Uint8Array>()
  let n = 0
  const juntar = (a: Uint8Array, b: Uint8Array) => {
    const r = new Uint8Array(a.length + b.length)
    r.set(a)
    r.set(b, a.length)
    return r
  }
  const escrita: EscritaFalsa = {
    enviados,
    chamadas,
    falhas,
    sessoes,
    cairDepoisDe: null,
    /** Como a do Dropbox: partes, retomada pela sessão guardada, "add" no fim (o mesmo conteúdo já lá = ok). */
    async enviarEmPartes(caminho, arquivo, { sessao = null, aoAvancar, parte = 4 } = {}) {
      chamadas.push(`partes ${caminho}${sessao ? ` de ${sessao.offset}` : ''}`)
      const erro = falhas.get(caminho) ?? falhas.get('*')
      if (erro) throw erro
      let atual = sessao && sessoes.has(sessao.id) && sessoes.get(sessao.id)!.length === sessao.offset ? { ...sessao } : null
      if (!atual) {
        atual = { id: `sessao-${++n}`, offset: 0 }
        sessoes.set(atual.id, new Uint8Array(0))
      }
      let partes = 0
      while (atual.offset < arquivo.size) {
        const p: Uint8Array = new Uint8Array(await arquivo.slice(atual.offset, atual.offset + parte).arrayBuffer())
        sessoes.set(atual.id, juntar(sessoes.get(atual.id)!, p))
        atual = { id: atual.id, offset: atual.offset + p.length }
        await aoAvancar?.(atual)
        if (escrita.cairDepoisDe && ++partes >= escrita.cairDepoisDe.partes) {
          const e = escrita.cairDepoisDe.erro
          escrita.cairDepoisDe = null
          throw e
        }
      }
      const dados = sessoes.get(atual.id)!
      const ja = enviados.get(caminho)
      if (ja && (ja.length !== dados.length || ja.some((v, i) => v !== dados[i]))) throw new ErroDeConflito(caminho)
      enviados.set(caminho, dados)
      await aoAvancar?.(null)
      return { rev: `r${enviados.size}` }
    },
    async enviar(caminho, bytes) {
      chamadas.push(caminho)
      const erro = falhas.get(caminho) ?? falhas.get('*')
      if (erro) throw erro
      enviados.set(caminho, new Uint8Array(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).slice())
      return { rev: `r${enviados.size}` }
    },
    async listar() {
      return []
    },
    async baixar(caminho) {
      chamadas.push(`baixar ${caminho}`)
      const erro = falhas.get(`baixar ${caminho}`) ?? falhas.get('baixar *')
      if (erro) throw erro
      const b = enviados.get(caminho)
      if (!b) throw new ErroDeArquivoAusente(caminho)
      return b.slice().buffer
    },
  }
  return escrita
}
