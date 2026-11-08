/**
 * A resolução dos sítios (src/sitios/resolucao.ts) para as telas (Parte 2C, bloco 2): o pacote dos sítios (`pacoteDeSitios`) +
 * a camada. Onde se lista, se conta ou se dá nome a um sítio, vale o DESTINO: o sítio mesclado (do livro, pelo pacote, ou pela
 * pessoa) some das listas e leva ao sítio em que entrou. Sem pacote (ou com a leitura falhando), `PACOTE_VAZIO`: só a camada.
 */
import { useEffect, useMemo, useState } from 'react'
import { aoReabrir, geracaoDoBanco } from '../banco/cliente'
import { objetosDosSitios } from '../banco/consultas'
import { useRedirecionamentos, type Redirecionamentos } from '../pacote/redirecionamentos'
import type { Estado } from '../usuario/fusao'
import { useLido } from '../usuario/useLido'
import { arvoreDoSitio, objetosDoPacoteNaArvore } from './contagem'
import { eSitioSkc } from './modelo'
import { pacoteDeSitios, pacoteDeSitiosPronto } from './pacote'
import { PACOTE_VAZIO, resolverSitios, type PacoteDeSitios, type Resolucao } from './resolucao'

/** O pacote dos sítios, ou `PACOTE_VAZIO` sem pacote (nunca rejeita). */
export const pacoteDeSitiosOuVazio = (): Promise<PacoteDeSitios> => Promise.resolve().then(pacoteDeSitios).catch(() => PACOTE_VAZIO)

/** O pacote dos sítios para uma tela: null enquanto a leitura não terminou; `PACOTE_VAZIO` sem pacote ou se ela falhou. */
export function usePacoteDeSitios(): PacoteDeSitios | null {
  const [pacote, setPacote] = useState<PacoteDeSitios | null>(pacoteDeSitiosPronto)
  useEffect(() => {
    let vivo = true
    const ler = () => void pacoteDeSitiosOuVazio().then((p) => vivo && setPacote(p))
    ler()
    const parar = aoReabrir(ler)
    return () => {
      vivo = false
      parar()
    }
  }, [])
  return pacote
}

/** Um número por objeto (o pacote, a resolução): a chave de um `useLido` que muda quando ele muda; `-` para null. */
const numeros = new WeakMap<object, number>()
let ultimoNumero = 0
export function chaveDoObjeto(o: object | null | undefined): string {
  if (!o) return '-'
  let n = numeros.get(o)
  if (n === undefined) numeros.set(o, (n = ++ultimoNumero))
  return String(n)
}

let guardada: { pacote: PacoteDeSitios; sitios: unknown; resolucao: Resolucao } | null = null

/**
 * A resolução sobre este estado e este pacote, a mesma enquanto nenhum dos dois muda (os registros `sitio`): todas as telas
 * (cada cartão de objeto pergunta o nome do sítio) e a busca dividem uma conta só.
 */
function resolucaoGuardada(estado: Estado, pacote: PacoteDeSitios): Resolucao {
  const sitios = estado.registros.get('sitio')
  if (guardada?.pacote === pacote && guardada.sitios === sitios) return guardada.resolucao
  const resolucao = resolverSitios(estado, pacote)
  guardada = { pacote, sitios, resolucao }
  return resolucao
}

/** A resolução de agora: null enquanto o pacote não chegou; refaz quando um `sitio` muda ou o pacote chega. */
export function useResolucaoDeSitios(): Resolucao | null {
  const pacote = usePacoteDeSitios()
  return useLido(['sitio'], `resolucao|${chaveDoObjeto(pacote)}`, (e) => (pacote ? resolucaoGuardada(e, pacote) : null))
}

/** A resolução sobre este estado, fora de uma tela (a busca, as sugestões). */
export async function resolucaoDeSitios(estado: Estado): Promise<Resolucao> {
  return resolucaoGuardada(estado, await pacoteDeSitiosOuVazio())
}

/**
 * Para as funções que já recebiam os redirecionamentos das publicações (src/sitios/doUsuario.ts): um mapa de cada sítio que
 * não é o destino dele para o destino, isto é, os `SI-…` publicados (`redirecionados`, como antes) e os absorvidos (do livro
 * ou do usuário). Só ids de sítio.
 */
export function destinosDosSitios(r: Resolucao, redirecionados?: Redirecionamentos | null): Redirecionamentos {
  const ja = destinosGuardados.get(r)
  if (ja && ja.redirecionados === (redirecionados ?? null)) return ja.mapa
  const mapa = new Map<string, string>()
  for (const [de] of redirecionados ?? []) if (eSitioSkc(de)) mapa.set(de, r.destino(de))
  for (const k of r.sitios) {
    const d = r.destino(k)
    if (d !== k) mapa.set(k, d)
  }
  destinosGuardados.set(r, { redirecionados: redirecionados ?? null, mapa })
  return mapa
}

/** O último mapa de cada resolução (cada cartão de objeto pede o seu). */
const destinosGuardados = new WeakMap<Resolucao, { redirecionados: Redirecionamentos | null; mapa: Redirecionamentos }>()

/** `destinosDosSitios` para as telas: enquanto a resolução não chegou, só os redirecionamentos (null enquanto nem eles). */
export function useDestinosDosSitios(): Redirecionamentos | null {
  const redirecionados = useRedirecionamentos()
  const r = useResolucaoDeSitios()
  return useMemo(() => (r ? destinosDosSitios(r, redirecionados) : redirecionados), [r, redirecionados])
}

let semRepetir: { motor: number; porArvore: Map<string, Promise<ReadonlySet<string>>> } | null = null

/** As trocas de sítio (`item-sitio`): número do objeto → o sítio a que a pessoa o ligou. */
export type TrocasDosObjetos = ReadonlyMap<string, { sitio: string | null }>

/**
 * Para cada destino com absorvidos ou partes, quantos objetos do pacote há na árvore dele, cada um uma vez (`objetosDosSitios`:
 * uma consulta por árvore, guardada por pacote), sem os que a pessoa ligou a um sítio da mesma árvore (`trocas`; eles contam
 * pela pessoa: `objetosDoPacoteNaArvore`). Os outros sítios não entram (a soma das contagens já é a certa).
 */
export async function objetosDoPacoteSemRepetir(r: Resolucao, trocas?: TrocasDosObjetos | null): Promise<ReadonlyMap<string, number>> {
  const motor = geracaoDoBanco()
  if (semRepetir?.motor !== motor) semRepetir = { motor, porArvore: new Map() }
  const cache = semRepetir.porArvore
  const saida = new Map<string, number>()
  await Promise.all(
    r.sitios
      .filter((k) => r.destino(k) === k)
      .map(async (d) => {
        const arvore = arvoreDoSitio(r, d)
        if (arvore.length === 1) return
        const chave = arvore.join('\u0000')
        let pedido = cache.get(chave)
        if (!pedido) {
          pedido = objetosDosSitios(arvore).then((m) => new Set([...m.values()].flatMap((os) => os.map((o) => o.numero))))
          cache.set(chave, pedido)
          pedido.catch(() => cache.delete(chave))
        }
        saida.set(d, objetosDoPacoteNaArvore(r, arvore, await pedido, trocas))
      }),
  )
  return saida
}

/** `objetosDoPacoteSemRepetir` para uma tela: null enquanto não chegou (quem usa soma, como antes). */
export function useObjetosDoPacoteSemRepetir(r: Resolucao | null, trocas: TrocasDosObjetos | null): ReadonlyMap<string, number> | null {
  const [mapa, setMapa] = useState<{ mapa: ReadonlyMap<string, number> } | null>(null)
  useEffect(() => {
    if (!r) return
    let vivo = true
    objetosDoPacoteSemRepetir(r, trocas).then(
      (m) => vivo && setMapa({ mapa: m }),
      () => undefined,
    )
    return () => {
      vivo = false
    }
  }, [r, trocas])
  // Enquanto a conta de uma resolução nova não chega, vale a da anterior (as árvores raramente mudam).
  return mapa?.mapa ?? null
}
