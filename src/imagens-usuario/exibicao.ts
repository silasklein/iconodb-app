/**
 * As imagens de um objeto como o item e o visualizador as mostram: as do livro primeiro, depois as do usuário (na
 * ordem em que foram adicionadas). Uma imagem do usuário vira uma `Imagem` como as do pacote (mesmo Tipo: `traco` é
 * invertida), com `skc` dizendo de onde vem (marca SKC, crédito, legenda, e o endereço pela camada do usuário).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Imagem } from '../banco/tipos'
import { aparelhoAtual, assinarTrocaDeAparelho } from '../usuario/aparelho'
import { useEstado, type Estado } from '../usuario/estado'
import { imagensDoObjeto, principalDoObjeto, type ImagemDoUsuario } from './registro'
import './MarcaSkc.css'

export interface ImagemExibida extends Imagem {
  /** Presente nas imagens do usuário. */
  skc?: ImagemDoUsuario
}

export function comoImagemExibida(img: ImagemDoUsuario, ordinal: number): ImagemExibida {
  return {
    id: img.id,
    itemId: img.alvo,
    ordinal,
    display_mode: img.tipo,
    tela: null,
    miniatura: null,
    largura: img.largura,
    altura: img.altura,
    credito: img.credito || null,
    rotacao: null,
    skc: img,
  }
}

export function juntarImagens(livro: readonly Imagem[], usuario: readonly ImagemDoUsuario[]): ImagemExibida[] {
  return [...livro, ...usuario.map((u, i) => comoImagemExibida(u, livro.length + i + 1))]
}

/** O crédito como aparece sob a imagem SKC: "Museu de Teste · vista frontal". */
export const creditoDaImagem = (img: Pick<ImagemDoUsuario, 'credito' | 'legenda'>) => [img.credito, img.legenda].map((s) => s.trim()).filter(Boolean).join(' · ')

/** As imagens vivas do usuário para o objeto e a principal (re-renderiza só quando elas mudam). */
export function useImagensDoUsuario(alvo: string): { imagens: readonly ImagemDoUsuario[]; principal: ImagemDoUsuario | null } {
  const imagens = useEstado(useCallback((e: Estado) => imagensDoObjeto(e, alvo), [alvo]))
  const principal = useEstado(useCallback((e: Estado) => principalDoObjeto(e, alvo), [alvo]))
  return useMemo(() => ({ imagens, principal }), [imagens, principal])
}

let esteAparelho: string | null = null
let pedido: Promise<string | null> | null = null
/** Muda a cada troca: a resposta de um pedido feito antes dela é descartada (revisão 1 da Tarefa 17a, m4). */
let geracao = 0
// O id muda (troca de aparelho, A-23 da Tarefa 17): esquece o guardado e quem está montado pede de novo.
assinarTrocaDeAparelho(() => {
  geracao++
  esteAparelho = null
  pedido = null
  for (const o of [...montados]) o()
})
const montados = new Set<() => void>()
/** O id deste aparelho (para dizer "do outro aparelho"); null enquanto não se sabe. */
export function useEsteAparelho(): string | null {
  const [id, setId] = useState(esteAparelho)
  const [vez, setVez] = useState(0)
  useEffect(() => {
    const o = () => setVez((v) => v + 1)
    montados.add(o)
    return () => void montados.delete(o)
  }, [])
  useEffect(() => {
    if (esteAparelho) {
      setId(esteAparelho)
      return
    }
    let vivo = true
    if (!pedido) {
      const desta = geracao
      pedido = aparelhoAtual().then(
        (a) => (desta === geracao ? (esteAparelho = a.id) : null),
        () => null,
      )
    }
    void pedido.then((a) => vivo && setId(a))
    return () => {
      vivo = false
    }
  }, [vez])
  return id
}
