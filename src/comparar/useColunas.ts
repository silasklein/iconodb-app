/**
 * Os objetos da bandeja prontos para a tela (uma `Coluna` por ref, na ordem da bandeja): os do livro vêm do pacote
 * (`item`), os objetos SKC do estado. Uma ref que não leva a dados vira uma coluna com a marca, nunca some nem derruba a
 * tela: «excluído» (o objeto SKC existe e foi excluído; os dados aparecem), «ainda não sincronizado» (o id `OB-…` não
 * chegou a este aparelho; é a mesma regra dos sítios da Tarefa 12), «não encontrado» (um número que o pacote não tem) ou
 * «não foi possível ler».
 *
 * Uma ref com o número de um objeto SKC (ou com um número provisório que o objeto perdeu, Tarefa 9) leva ao objeto SKC.
 *
 * Objetos ligados (Tarefa 9) são colunas separadas, cada um como ele mesmo; o que não é o principal do grupo leva a marca
 * «ligado a …» e o link «Abrir o item» abre ELE (`?sozinho=1`), sem redirecionar ao principal. As hipóteses da coluna
 * principal contam as do grupo, como o Item; as da outra, só as dela (é como ela abre).
 *
 * Os objetos do livro lidos do pacote ficam guardados por número enquanto a tela existe: tirar, desfazer ou acrescentar um
 * objeto lê só o que falta, e as outras colunas não voltam a «Carregando…» nem remontam a imagem.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { aoReabrir } from '../banco/cliente'
import { item } from '../banco/consultas'
import type { ItemDetalhe } from '../banco/tipos'
import { hipotesesSkcDosObjetos, porNivel as agruparPorNivel, type PorNivel } from '../hipoteses/doUsuario'
import { semPonto, textoDaData } from '../item/ficha'
import { textoSemLinks } from '../notas/links'
import { useGrupos, useNumeracao } from '../objetos-skc/atual'
import type { Grupos } from '../objetos-skc/ligacoes'
import { lerObjeto, textoDaOrigem, textoDasMedidas, tituloDe } from '../objetos-skc/modelo'
import { idDeObjetoSkc, nomeDoPeriodo, type Numeracao } from '../objetos-skc/numeracao'
import { useSitiosVivos, type SitiosVivos } from '../sitios/doUsuario'
import { useCarregar } from '../ui/useCarregar'
import { estadoAtual, useEstado, type Estado } from '../usuario/estado'
import { textoDasHipoteses, type Celula, type Coluna } from './linhas'

type Resolvida = { tipo: 'skc'; id: string } | { tipo: 'livro'; numero: string }

/** A ref da bandeja é de um objeto SKC (pelo id ou pelo número que ele tem agora) ou do livro. */
function resolver(ref: string, numeracao: Numeracao): Resolvida {
  if (idDeObjetoSkc(ref)) return { tipo: 'skc', id: ref }
  const skc = numeracao.porNumero.get(ref)
  return skc ? { tipo: 'skc', id: skc } : { tipo: 'livro', numero: ref }
}

/** O número provisório que um objeto SKC teve e perdeu leva ao objeto (Tarefa 9), quando o pacote não tem esse número. */
export function objetoQueTeveONumero(numero: string, numeracao: Numeracao): string | null {
  for (const i of numeracao.porId.values()) if (i.pedido === numero && i.numero !== numero && i.numero !== null && !i.reserva) return i.id
  return null
}

type DoPacote = ItemDetalhe | null | 'erro'

const contar = (p: PorNivel | undefined, d?: ItemDetalhe) => ({
  pre_iconographic: (d?.hipotesesPorNivel.pre_iconographic.length ?? 0) + (p?.pre_iconographic.length ?? 0),
  iconographic: (d?.hipotesesPorNivel.iconographic.length ?? 0) + (p?.iconographic.length ?? 0),
  iconological: (d?.hipotesesPorNivel.iconological.length ?? 0) + (p?.iconological.length ?? 0),
  semNivel: p?.semNivel.length ?? 0,
})

const semDados = (ref: string, situacao: Coluna['situacao'], marca: string, skc: boolean, numero: string | null = null): Coluna => ({
  ref,
  situacao,
  skc,
  numero,
  ligadoA: null,
  marcas: marca ? [marca] : [],
  origem: skc ? 'SKC' : '',
  titulo: '',
  rota: `/item/${encodeURIComponent(ref)}`,
  campos: {},
  leituras: {},
  imagens: [],
  alvo: null,
})

const rotuloDoObjeto = (ref: string, numeracao: Numeracao) => (idDeObjetoSkc(ref) ? (numeracao.porId.get(ref)?.numero ?? ref) : ref)
const caminhoDoItem = (n: string, sozinho: boolean) => `/item/${encodeURIComponent(n)}${sozinho ? '?sozinho=1' : ''}`

/** O grupo de ligação de `alvo` na comparação: o principal conta o grupo todo; quem não é o principal aparece sozinho e diz a quem está ligado. */
function doGrupo(alvo: string, grupos: Grupos, numeracao: Numeracao): { refsDasHipoteses: string[]; ligadoA: string | null } {
  const principal = grupos.principal(alvo)
  return principal === alvo ? { refsDasHipoteses: grupos.membros(alvo), ligadoA: null } : { refsDasHipoteses: [alvo], ligadoA: rotuloDoObjeto(principal, numeracao) }
}

function colunaDoLivro(ref: string, d: ItemDetalhe, sitios: SitiosVivos, hip: PorNivel | undefined, ligadoA: string | null): Coluna {
  const s = sitios.doObjetoDoPacote(d.numero, { id: d.sitio?.id ?? null, nome: d.sitio?.nome ?? null })
  const sitio = s.nome ? (s.marca ? `${s.nome} (${s.marca})` : s.nome) : ''
  const leituras: Record<string, Celula> = {}
  for (const l of d.leituras) {
    const nova: Celula = l.texto !== null ? { texto: l.texto, lang: 'pt' } : { texto: l.original, lang: 'de' }
    const ja = leituras[l.publicacao]
    leituras[l.publicacao] = ja && ja.lang === nova.lang ? { texto: `${ja.texto}\n\n${nova.texto}`, lang: ja.lang } : (ja ?? nova)
  }
  return {
    ref,
    situacao: 'ok',
    skc: false,
    numero: d.numero,
    ligadoA,
    marcas: [],
    origem: d.origem,
    titulo: d.descricao ?? d.tipo ?? d.numero,
    rota: caminhoDoItem(d.numero, ligadoA !== null),
    campos: {
      sitio,
      data: textoDaData(d) ?? '',
      medidas: d.medidas?.texto ? semPonto(d.medidas.texto) : '',
      acervo: d.acervo ?? '',
      hipoteses: textoDasHipoteses(contar(hip, d)),
    },
    leituras,
    imagens: d.imagens,
    alvo: d.numero,
  }
}

function colunaSkc(ref: string, id: string, estado: Estado, numeracao: Numeracao, sitios: SitiosVivos, hip: PorNivel | undefined, ligadoA: string | null): Coluna {
  const r = estado.registro('objeto', id)
  if (!r) return semDados(ref, 'ausente', 'ainda não sincronizado', true)
  const o = lerObjeto(r)
  const info = numeracao.porId.get(id)
  const marcas: string[] = []
  if (info?.situacao === 'provisorio') marcas.push('provisório')
  if (info?.situacao === 'rascunho') marcas.push('rascunho')
  if (o.excluido) marcas.push('excluído')
  const sitioId = o.sitio.trim()
  const nomeDoSitio = sitios.nome(sitioId || null, o.sitioNome.trim() || null)
  const marcaDoSitio = sitios.marca(sitioId || null)
  const sitio = nomeDoSitio ? (marcaDoSitio ? `${nomeDoSitio} (${marcaDoSitio})` : nomeDoSitio) : ''
  const leitura = textoSemLinks(o.leitura).trim()
  return {
    ref,
    situacao: o.excluido ? 'excluido' : 'ok',
    skc: true,
    numero: info?.numero ?? null,
    ligadoA,
    marcas,
    origem: 'SKC',
    titulo: tituloDe(o),
    rota: caminhoDoItem(info?.numero ?? id, ligadoA !== null),
    campos: {
      sitio,
      data: [o.periodo ? nomeDoPeriodo(o.periodo) : null, o.datacao.trim() || null].filter(Boolean).join(', '),
      material: o.material.trim(),
      medidas: textoDasMedidas(o),
      acervo: [o.acervo.trim(), o.inventario.trim()].filter(Boolean).join(', '),
      origem: textoDaOrigem(o),
      hipoteses: textoDasHipoteses(contar(hip)),
    },
    leituras: leitura ? { SKC: { texto: leitura, lang: 'pt' } } : {},
    imagens: [],
    alvo: id,
  }
}

export interface Colunas {
  colunas: readonly Coluna[]
  /** Os objetos do livro ainda estão sendo lidos do pacote. */
  carregando: boolean
}

export function useColunas(refs: readonly string[]): Colunas {
  const numeracao = useNumeracao()
  const grupos = useGrupos()
  const sitios = useSitiosVivos()
  const chave = refs.join('|')
  const resolvidas = useMemo(() => refs.map((r) => resolver(r, numeracao)), [chave, numeracao]) // eslint-disable-line react-hooks/exhaustive-deps
  const numeros = useMemo(() => [...new Set(resolvidas.flatMap((r) => (r.tipo === 'livro' ? [r.numero] : [])))], [resolvidas])
  // O que já foi lido do pacote fica guardado por número (um erro não: tenta de novo). Muda a lista, lê só o que falta.
  const guardados = useRef(new Map<string, DoPacote>())
  // O pacote pode trocar com a tela aberta (uma sincronização): o que estava guardado é do pacote velho. Esquece tudo e lê de novo
  // (T17-C-9); a leitura antiga continua à vista enquanto a nova chega (`manter`).
  const [versaoDoPacote, setVersaoDoPacote] = useState(0)
  useEffect(
    () =>
      aoReabrir(() => {
        guardados.current.clear()
        setVersaoDoPacote((v) => v + 1)
      }),
    [],
  )
  const carga = useCarregar(
    async () => {
      const faltam = numeros.filter((n) => !guardados.current.has(n))
      const lidos = await Promise.all(faltam.map(async (n): Promise<[string, DoPacote]> => [n, await item(n).catch((): DoPacote => 'erro')]))
      for (const [n, d] of lidos) if (d !== 'erro') guardados.current.set(n, d)
      const erros = new Map(lidos.filter(([, d]) => d === 'erro'))
      return new Map([...guardados.current, ...erros])
    },
    `${numeros.join('|')}#${versaoDoPacote}`,
    { manter: true },
  )
  // Os objetos SKC, as hipóteses SKC e as imagens do usuário vêm do estado: a tela refaz quando os registros deles mudam.
  const mapaDosObjetos = useEstado((e) => e.registros.get('objeto'))
  const mapaDasHipoteses = useEstado((e) => e.registros.get('hipotese'))
  const pacote = carga.fase === 'ok' ? carga.dados : null
  const colunas = useMemo(() => {
    const estado = estadoAtual()
    const doSkc = (alvo: string) => {
      const g = doGrupo(alvo, grupos, numeracao)
      return { hip: agruparPorNivel(hipotesesSkcDosObjetos(estado, g.refsDasHipoteses)), ligadoA: g.ligadoA }
    }
    return refs.map((ref, i): Coluna => {
      const x = resolvidas[i]!
      if (x.tipo === 'skc') {
        const g = doSkc(x.id)
        return colunaSkc(ref, x.id, estado, numeracao, sitios, g.hip, g.ligadoA)
      }
      const d = pacote?.get(x.numero)
      if (d === undefined) return semDados(ref, 'ok', '', false, x.numero)
      if (d === 'erro') return semDados(ref, 'erro', 'não foi possível ler', false, x.numero)
      if (d === null) {
        const antigo = objetoQueTeveONumero(x.numero, numeracao)
        if (antigo) {
          const g = doSkc(antigo)
          return colunaSkc(ref, antigo, estado, numeracao, sitios, g.hip, g.ligadoA)
        }
        return semDados(ref, 'nao-encontrado', 'não encontrado', false, x.numero)
      }
      const g = doSkc(d.numero)
      return colunaDoLivro(ref, d, sitios, g.hip, g.ligadoA)
    })
  }, [refs, resolvidas, pacote, mapaDosObjetos, mapaDasHipoteses, numeracao, grupos, sitios])
  return { colunas, carregando: numeros.length > 0 && carga.fase === 'carregando' }
}
