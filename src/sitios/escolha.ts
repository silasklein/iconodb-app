/**
 * O campo Sítio da ficha (NovoObjeto e "Editar a ficha"): as opções (os sítios do livro com o nome de agora e os do usuário; o
 * campo acha também pelo nome antigo e pelas grafias, que vão no apoio) e a última opção, "Novo sítio «…»" (Tarefa 12, item 2),
 * que substitui o antigo «Usar … como nome»: escolher cria um sítio do usuário com esse nome, na MESMA gravação do objeto, e liga
 * o objeto a ele. Quando o texto já é o nome ou a grafia de um sítio, não se oferece criar outro (o existente aparece na lista).
 */
import { useCallback, useMemo } from 'react'
import type { OpcaoDeEscolha } from '../objetos-skc/CampoDeEscolha'
import { normalizarForma } from '../glossario/modelo'
import { sitiosComEsteNome, useOpcoesDeSitio, useSitiosParaComparar } from './doUsuario'

/** O começo do id da opção "Novo sítio «…»": o resto é o nome. */
export const PREFIXO_DE_SITIO_NOVO = 'novo-sitio:'

export const eSitioNovoEscolhido = (id: string): boolean => id.startsWith(PREFIXO_DE_SITIO_NOVO)
export const nomeDoSitioNovoEscolhido = (id: string): string => id.slice(PREFIXO_DE_SITIO_NOVO.length)

export function useEscolhaDeSitio(): { opcoes: OpcaoDeEscolha[]; livre: (texto: string) => OpcaoDeEscolha | null } {
  const sitios = useOpcoesDeSitio()
  const todos = useSitiosParaComparar()
  const opcoes = useMemo<OpcaoDeEscolha[]>(
    () =>
      sitios.map((o) => ({
        id: o.id,
        rotulo: o.nome,
        apoio: [o.regiao, o.doUsuario ? 'SKC' : null, o.nomeDoLivro ? `antes: ${o.nomeDoLivro}` : null, ...o.grafias].filter(Boolean).join(' · ') || undefined,
      })),
    [sitios],
  )
  const livre = useCallback(
    (texto: string): OpcaoDeEscolha | null => {
      const nome = normalizarForma(texto)
      if (nome.length < 2 || sitiosComEsteNome(todos, nome).length > 0) return null
      return { id: `${PREFIXO_DE_SITIO_NOVO}${nome}`, rotulo: `Novo sítio «${nome}»`, apoio: 'cria um sítio seu (SKC), a completar depois' }
    },
    [todos],
  )
  return { opcoes, livre }
}
