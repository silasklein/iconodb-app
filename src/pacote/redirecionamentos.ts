/**
 * Os redirecionamentos do pacote (Tarefa 16): a tabela `redirecionamento` do comum.sqlite (schema 6), que o pipeline grava
 * quando publica um verbete ou um sítio que a pessoa criou no app (`python -m iconodb user-import`, depois o build):
 *   `GL-<aparelho>-<n>` → `GL-<dígitos>` (o verbete do usuário virou um verbete do livro, novo ou um que já existia);
 *   `SI-<aparelho>-<n>` → `<SIGLA>-<n>` (o sítio do usuário virou um sítio do livro).
 * O registro do usuário continua na camada (nada é reescrito), mas o app o trata como o do livro: ele some das listas
 * (Glossário, Sítios, campo Termo, Revisão, busca) e tudo o que aponta para ele (as hipóteses, os `[[…]]`, o sítio de um
 * objeto, o endereço antigo `/verbete/GL-…` e `/sitio/SI-…`) leva ao destino. Lidos uma vez por pacote aberto; sem pacote,
 * com a consulta falhando ou com um pacote do schema 5 (sem a tabela), nenhum redirecionamento.
 * Só valem as linhas de um id do usuário para um id do livro (o pacote nunca redireciona um id do livro), e para um destino
 * que existe no pacote (revisão 1, m7).
 * A coluna `criado` (decisão 50; revisão 2) diz se o destino foi CRIADO do registro do usuário (o verbete ou sítio novo que
 * ele publicou) ou se já era do livro (o do usuário só leva a ele). Só no primeiro caso a página do livro mostra «Este
 * verbete veio de você» (`useOrigensQueCriaram`). Uma linha sem a coluna conta como não criada.
 */
import { useEffect, useMemo, useState } from 'react'
import { aoReabrir, geracaoDoBanco } from '../banco/cliente'
import { redirecionamentos } from '../banco/consultas'
import { sitiosDoPacote } from '../sitios/pacote'

export type Redirecionamentos = ReadonlyMap<string, string>
export const SEM_REDIRECIONAMENTOS: Redirecionamentos = new Map()

/** O que a leitura da tabela dá: o mapa e os ids do usuário cujo destino foi criado deles (`criado`). */
interface Leitura {
  mapa: Redirecionamentos
  criados: ReadonlySet<string>
}
const SEM_LEITURA: Leitura = { mapa: SEM_REDIRECIONAMENTOS, criados: new Set() }

const RE_VERBETE_DO_USUARIO = /^GL-[a-z0-9]{8}-[1-9][0-9]*$/
const RE_SITIO_DO_USUARIO = /^SI-[a-z0-9]{8}-[1-9][0-9]*$/
const RE_VERBETE_DO_LIVRO = /^GL-[0-9]{6,}$/
const RE_SITIO_DO_LIVRO = /^[A-Za-z][A-Za-z0-9_]*-[0-9]+$/

/** Os ids sequenciais do pipeline (`GL-…`, `EL-…`, `HY-…`, `BIB-…`) têm a forma de um id de sítio do livro e nunca o são. */
const RE_ID_SEQUENCIAL = /^(?:GL|EL|HY|BIB)-[0-9]+$/

const valida = (de: string, para: string, tipo: string) =>
  (tipo === 'verbete' && RE_VERBETE_DO_USUARIO.test(de) && RE_VERBETE_DO_LIVRO.test(para)) ||
  (tipo === 'sitio' && RE_SITIO_DO_USUARIO.test(de) && RE_SITIO_DO_LIVRO.test(para) && !RE_ID_SEQUENCIAL.test(para))

/** O destino de um id (ele mesmo, se não é redirecionado). */
export const destinoDe = (r: Redirecionamentos | null | undefined, id: string): string => r?.get(id) ?? id

/** Os ids redirecionados para `para` (os do usuário que viraram este do livro). */
export function origensDe(r: Redirecionamentos | null | undefined, para: string): string[] {
  const saida: string[] = []
  for (const [de, p] of r ?? []) if (p === para) saida.push(de)
  return saida
}

let guardado: { motor: number; pedido: Promise<Leitura>; mapa: Promise<Redirecionamentos>; pronto: Leitura | null } | null = null
aoReabrir(() => {
  guardado = null
})

function lerDoPacote(): NonNullable<typeof guardado> {
  const motor = geracaoDoBanco()
  if (guardado?.motor === motor) return guardado
  // Dentro do `then`: qualquer falha da consulta (sem pacote, banco com defeito) vira uma rejeição, nunca um erro síncrono.
  const pedido = Promise.resolve()
    .then(() => redirecionamentos())
    .then(async (linhas): Promise<Leitura> => {
      // m7: só vale o destino que existe no pacote (um verbete do glossário; um sítio da lista dos sítios). Um destino
      // ausente deixaria o do usuário escondido e levaria a "não encontrado"; sem a linha, ele continua como sempre.
      const validas = linhas.filter((l) => valida(l.de, l.para, l.tipo))
      const sitios = validas.some((l) => l.tipo === 'sitio') ? await sitiosDoPacote() : null
      const vivas = validas.filter((l) => (l.tipo === 'verbete' ? l.verbeteExiste : !!sitios?.has(l.para)))
      const leitura: Leitura = { mapa: new Map(vivas.map((l) => [l.de, l.para] as const)), criados: new Set(vivas.filter((l) => l.criado).map((l) => l.de)) }
      entrada.pronto = leitura
      return leitura
    })
  const entrada: NonNullable<typeof guardado> = { motor, pronto: null, pedido, mapa: pedido.then((l) => l.mapa) }
  guardado = entrada
  entrada.pedido.catch(() => {
    if (guardado === entrada) guardado = null
  })
  entrada.mapa.catch(() => {})
  return entrada
}

/** Os redirecionamentos do pacote aberto. Rejeita sem pacote (quem usa trata como nenhum). */
export function redirecionamentosDoPacote(): Promise<Redirecionamentos> {
  return lerDoPacote().mapa
}

/** Os redirecionamentos, ou nenhum se não há pacote ou a leitura falhou. */
export const redirecionamentosOuNenhum = (): Promise<Redirecionamentos> => redirecionamentosDoPacote().catch(() => SEM_REDIRECIONAMENTOS)

/** O mapa quando já foi lido (sem esperar); null se não, ou se o pacote é outro. */
export const redirecionamentosProntos = (): Redirecionamentos | null => (guardado?.motor === geracaoDoBanco() ? (guardado.pronto?.mapa ?? null) : null)
const leituraPronta = (): Leitura | null => (guardado?.motor === geracaoDoBanco() ? guardado.pronto : null)

/**
 * Os redirecionamentos para uma tela: null enquanto a leitura não terminou; vazio sem pacote ou se ela falhou (um verbete ou
 * sítio do usuário nunca fica sem a sua página por falta de pacote).
 */
export function useRedirecionamentos(): Redirecionamentos | null {
  return useLeitura()?.mapa ?? null
}

function useLeitura(): Leitura | null {
  const [leitura, setLeitura] = useState<Leitura | null>(leituraPronta)
  useEffect(() => {
    let vivo = true
    const ler = () =>
      lerDoPacote().pedido.then(
        (l) => vivo && setLeitura(l),
        () => vivo && setLeitura(SEM_LEITURA),
      )
    void ler()
    const parar = aoReabrir(() => void ler())
    return () => {
      vivo = false
      parar()
    }
  }, [])
  return leitura
}

/**
 * Os redirecionamentos com `criado` (de → para): os ids do usuário que criaram uma entrada do livro. Vazio enquanto a leitura
 * não terminou ou sem pacote (o mesmo objeto enquanto a leitura não muda).
 */
export function useDestinosCriados(): Redirecionamentos {
  const leitura = useLeitura()
  return useMemo(() => (leitura ? new Map([...leitura.mapa].filter(([de]) => leitura.criados.has(de))) : SEM_REDIRECIONAMENTOS), [leitura])
}

/**
 * Decisão 50: os ids do usuário que CRIARAM esta entrada do livro (as linhas com `criado`, na ordem do id): o verbete ou
 * o sítio que a pessoa criou e o pipeline publicou, e os do usuário que levam a ele. Vazio se a entrada já era do livro
 * (o do usuário só leva a ela) ou se não há linha; null enquanto a leitura não terminou.
 */
export function useOrigensQueCriaram(para: string): string[] | null {
  const leitura = useLeitura()
  if (leitura === null) return null
  return origensDe(leitura.mapa, para).filter((de) => leitura.criados.has(de))
}
