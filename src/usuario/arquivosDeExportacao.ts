/**
 * Gera os três arquivos da tela Exportar (Tarefa 15), na hora do toque: lê o instantâneo do IndexedDB (uma só transação,
 * src/usuario/instantaneo.ts), funde e monta (src/usuario/exportar.ts). A cópia pergunta também à fila do OPFS quais
 * imagens ainda não subiram; as regiões leem o pacote (as regiões dos livros, o tamanho das imagens, os elementos, os
 * autores); as hipóteses, o localizador de cada objeto. Tudo local: sem login e sem internet. Se o pacote não puder ser
 * lido, os arquivos saem com o que o aparelho tem. As hipóteses e as regiões seguem os redirecionamentos do pacote (Tarefa 16).
 */
import { localizadoresDosObjetos, regioesDoLivroParaExportar, type DadosDoLivroParaRegioes, type RegiaoDoLivroParaExportar } from '../banco/consultas'
import { eHipoteseSkc, lerHipotese, lerRegiao, RE_ELEMENTO_DO_LIVRO } from '../hipoteses/modelo'
import { imagensAindaNesteAparelho } from '../imagens-usuario/fila'
import { montarCopia, montarHipoteses, montarRegioes, nomeDoArquivo, resumoDaCopia, resumoDasHipoteses, resumoDasRegioes, type Instantaneo, type ResumoDaCopia, type TipoDeArquivo } from './exportar'
import { fundir, type Estado } from './fusao'
import { lerInstantaneo } from './instantaneo'
import { descarregarPendentes } from './pendentes'
import { redirecionamentosOuNenhum } from '../pacote/redirecionamentos'

export interface ArquivoGerado {
  nome: string
  conteudo: string
  tipo: string
  /** Algo que a mensagem deve dizer além do nome (as regiões dos livros que não puderam ser lidas). */
  aviso: string | null
}

export const AVISO_SEM_LIVRO = 'Só as suas regiões: as dos livros não puderam ser lidas neste aparelho.'

const estadoDo = (i: Instantaneo): Estado => fundir(
  i.eventos.map((x) => x.evento),
  i.base ?? undefined,
)

/** As imagens e os elementos do pacote em que o usuário desenhou (para o tamanho em pixels e o rótulo do livro). */
function oQueAsRegioesUsam(estado: Estado): { imagens: string[]; elementos: string[] } {
  const imagens = new Set<string>()
  const elementos = new Set<string>()
  for (const r of estado.registros.get('regiao')?.values() ?? []) {
    const g = lerRegiao(r)
    if (g.imagem && !g.imagem.startsWith('IM-')) imagens.add(g.imagem)
    if (RE_ELEMENTO_DO_LIVRO.test(g.elementoId)) elementos.add(g.elementoId)
  }
  return { imagens: [...imagens], elementos: [...elementos] }
}

async function doLivro(estado: Estado): Promise<DadosDoLivroParaRegioes | null> {
  try {
    const { imagens, elementos } = oQueAsRegioesUsam(estado)
    return await regioesDoLivroParaExportar(imagens, elementos)
  } catch {
    return null
  }
}

/** O localizador dos objetos do pacote das hipóteses SKC ("TESTE I, Nr. 3"); sem o pacote, nenhum (sai o número). */
async function localizadores(estado: Estado): Promise<Map<string, string>> {
  const objetos = new Set<string>()
  for (const r of estado.registros.get('hipotese')?.values() ?? []) {
    const o = eHipoteseSkc(r.id) ? lerHipotese(r).objeto : null
    if (o && !o.startsWith('OB-')) objetos.add(o)
  }
  try {
    return await localizadoresDosObjetos([...objetos])
  } catch {
    return new Map()
  }
}

/** Gera o arquivo pedido. O que está por gravar (um campo aberto) é gravado antes. */
export async function gerarArquivo(tipo: TipoDeArquivo, agora: Date = new Date()): Promise<ArquivoGerado> {
  // Um rascunho que não pôde ser gravado continua na memória; a cópia sai com o que já está gravado.
  await descarregarPendentes().catch(() => undefined)
  const i = await lerInstantaneo()
  const nome = nomeDoArquivo(tipo, agora)
  const estado = estadoDo(i)
  if (tipo === 'copia') {
    const naFila = await imagensAindaNesteAparelho(estado)
    return { nome, conteudo: `${JSON.stringify(montarCopia(i, agora, naFila))}\n`, tipo: 'application/json', aviso: null }
  }
  if (tipo === 'hipoteses') {
    const [locais, redirecionamentos] = await Promise.all([localizadores(estado), redirecionamentosOuNenhum()])
    return { nome, conteudo: `${JSON.stringify(montarHipoteses(estado, agora, locais, redirecionamentos), null, 2)}\n`, tipo: 'application/json', aviso: null }
  }
  const [livro, redirecionamentos] = await Promise.all([doLivro(estado), redirecionamentosOuNenhum()])
  const colecao = montarRegioes({
    redirecionamentos,
    estado,
    doLivro: livro?.regioes ?? [],
    tamanhos: livro?.tamanhos ?? new Map(),
    termosDosElementos: livro?.termosDosElementos ?? new Map(),
    elementos: livro?.elementos ?? new Map(),
    publicacoes: livro?.publicacoes ?? new Map(),
    geradoEm: agora,
  })
  return { nome, conteudo: `${JSON.stringify(colecao, null, 2)}\n`, tipo: 'application/ld+json', aviso: livro ? null : AVISO_SEM_LIVRO }
}

export interface ResumoDaExportacao {
  copia: ResumoDaCopia
  regioes: { suas: number; doLivro: number | null }
  hipoteses: number
}

/**
 * Os números da tela: o que cada arquivo levaria agora (uma leitura e uma fusão). `regioesDoLivro`: as regiões do pacote
 * (só para contar; `regioesDoLivro()`), ou null: o pacote não pôde ser lido.
 */
export async function resumirExportacao(regioesDoLivro: readonly RegiaoDoLivroParaExportar[] | null): Promise<ResumoDaExportacao> {
  const i = await lerInstantaneo()
  const estado = estadoDo(i)
  const naFila = await imagensAindaNesteAparelho(estado)
  const r = resumoDasRegioes({ estado, doLivro: regioesDoLivro ?? [] })
  return { copia: resumoDaCopia(i, estado, naFila), regioes: { suas: r.suas, doLivro: regioesDoLivro ? r.doLivro : null }, hipoteses: resumoDasHipoteses(estado).hipoteses }
}
