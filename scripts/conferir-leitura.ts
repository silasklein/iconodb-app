/**
 * Confere a ordem de leitura de uma obra de catálogo num pacote (Tarefa 7 do plano «O IPIAO lido no formato do §»).
 *
 * Uso: `node scripts/conferir-leitura.ts <pasta>/pub-<SIGLA>.sqlite [--par <legenda>,<legenda> …]`
 *
 * Lê o arquivo, o comum.sqlite e as outras publicações ao lado dele do disco (só leitura: os bytes vão para um banco em memória,
 * aberto com SQLITE_DESERIALIZE_READONLY), o comum como `main` e cada publicação como `pub_<SIGLA>`, e monta a ordem com o MESMO
 * código do app: `ordemDaLeitura` (src/banco/leitura.ts), que lê as linhas do pacote e as passa a `ordemDaObra`
 * (src/leitura/ordem.ts). Imprime SÓ contagens, nunca texto do livro:
 * trechos e entradas no pacote e quantos a ordem tem uma vez, os passos de texto por volume, as entradas fora da ordem dos
 * números e o tempo para montar a ordem. Sai com 1 se falta ou se repete algum trecho ou entrada, ou se há entrada fora de ordem.
 *
 * Os mapas (plano «Os mapas da introdução pelo mapa do app», Tarefa 2): por legenda, o volume e a parte, o número de entradas
 * do mapa e o de sítios com coordenada (os pontos) e sem, pelo mesmo caminho da página (`mapasDaLeitura`, `sitiosDasEntradas`,
 * `juntar` e a resolução dos sítios do pacote), sem a camada do usuário (este script não a tem). E as duas legendas de cada par
 * de `PARES_DOS_MAPAS` desta obra têm de estar na mesma parte: sai com 1 se não estão, ou se uma falta. `--par a,b` confere
 * também esse par (para provar a conferência no pacote sintético, que não tem os pares do livro).
 *
 * Fica fora do build do app (o Vite não o importa). Os módulos do app importam sem a extensão (`./cliente`), como o Vite
 * resolve; aqui um gancho de resolução do Node tenta `.ts` quando o caminho relativo não existe.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { register } from 'node:module'
import { basename, dirname, join } from 'node:path'

const KINDS_DA_LEITURA = ['running_text', 'period_overview', 'caption']

const GANCHO = `
export async function resolve(especificador, contexto, proximo) {
  try {
    return await proximo(especificador, contexto)
  } catch (erro) {
    if (erro?.code === 'ERR_MODULE_NOT_FOUND' && /^\\.\\.?\\//.test(especificador) && !/\\.[cm]?[jt]sx?$/.test(especificador)) {
      return proximo(especificador + '.ts', contexto)
    }
    throw erro
  }
}`

type L = Record<string, unknown>
const cmpTexto = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** As vezes que cada chave aparece na lista. */
function contar(lista: readonly string[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const x of lista) m.set(x, (m.get(x) ?? 0) + 1)
  return m
}

/** Quantas do pacote a ordem tem exatamente uma vez, quantas faltam, quantas se repetem e quantas a ordem tem a mais. */
function cobertura(doPacote: readonly string[], naOrdem: readonly string[]) {
  const vezes = contar(naOrdem)
  const pacote = new Set(doPacote)
  let umaVez = 0
  let faltando = 0
  let repetidas = 0
  for (const id of pacote) {
    const v = vezes.get(id) ?? 0
    if (v === 0) faltando++
    else if (v === 1) umaVez++
    else repetidas++
  }
  const estranhas = [...vezes.keys()].filter((id) => !pacote.has(id)).length
  return { total: pacote.size, umaVez, faltando, repetidas, estranhas }
}

async function main(argumentos: readonly string[]): Promise<number> {
  const uso = () => {
    console.error('Uso: node scripts/conferir-leitura.ts <pasta>/pub-<SIGLA>.sqlite [--par <legenda>,<legenda> …]')
    return 2
  }
  const paresAMais: (readonly [string, string])[] = []
  const posicionais: string[] = []
  for (let i = 0; i < argumentos.length; i++) {
    if (argumentos[i] !== '--par') {
      posicionais.push(argumentos[i]!)
      continue
    }
    const [a, b, ...resto] = (argumentos[++i] ?? '').split(',')
    if (!a || !b || resto.length > 0) return uso()
    paresAMais.push([a, b])
  }
  const caminho = posicionais.length === 1 ? posicionais[0] : undefined
  const nome = caminho ? basename(caminho) : ''
  const sigla = /^pub-([A-Za-z0-9_]+)\.sqlite$/.exec(nome)?.[1]
  if (!caminho || !sigla) return uso()

  register('data:text/javascript,' + encodeURIComponent(GANCHO))
  const [{ default: sqlite3InitModule }, cliente, leitura, { esquemaDaPublicacao }, { resumosDosItens }, mapas, pacoteDosSitios, { resolverSitios }, { juntar }] =
    await Promise.all([
      import('@sqlite.org/sqlite-wasm'),
      import('../src/banco/cliente.ts'),
      import('../src/banco/leitura.ts'),
      import('../src/banco/arquivos.ts'),
      import('../src/banco/consultas.ts'),
      import('../src/leitura/mapasDoLivro.ts'),
      import('../src/sitios/pacote.ts'),
      import('../src/sitios/resolucao.ts'),
      import('../src/sitios/juntar.ts'),
    ])

  // o arquivo em memória, só leitura (nada volta ao disco)
  const sqlite3 = await sqlite3InitModule()
  const { capi, wasm } = sqlite3
  const esquema = esquemaDaPublicacao(sigla)
  const caminhoDoComum = join(dirname(caminho), 'comum.sqlite')
  if (!existsSync(caminhoDoComum)) {
    console.error(`Falta o comum.sqlite ao lado de ${nome} (os sítios dos mapas usam o glossário e os objetos do pacote).`)
    return 2
  }
  const db = new sqlite3.oo1.DB(':memory:')
  // o comum.sqlite é o `main`, e a publicação é anexada como `pub_<SIGLA>`, como no app (src/banco/nucleo.ts)
  const desserializar = (arquivo: string, alvo: string) => {
    const bytes = new Uint8Array(readFileSync(arquivo))
    const p = wasm.allocFromTypedArray(bytes)
    const flags = capi.SQLITE_DESERIALIZE_FREEONCLOSE | capi.SQLITE_DESERIALIZE_READONLY
    const rc = capi.sqlite3_deserialize(db.pointer!, alvo, p, bytes.byteLength, bytes.byteLength, flags)
    if (rc !== 0) throw new Error(`Não foi possível abrir ${basename(arquivo)} (sqlite ${rc}).`)
  }
  desserializar(caminhoDoComum, 'main')
  // todas as publicações da pasta, como o app as abre (os sítios de uma podem ter sido mesclados nos de outra), na ordem do
  // manifest.json quando há; a conferida, mesmo fora dele
  const pasta = dirname(caminho)
  const naPasta = readdirSync(pasta).flatMap((f) => /^pub-([A-Za-z0-9_]+)\.sqlite$/.exec(f)?.[1] ?? [])
  let ordemDoManifesto: string[] = []
  try {
    const manifesto = JSON.parse(readFileSync(join(pasta, 'manifest.json'), 'utf8')) as { publicacoes?: { sigla?: unknown }[] }
    ordemDoManifesto = (manifesto.publicacoes ?? []).map((p) => String(p.sigla))
  } catch {
    // sem manifesto: a ordem dos nomes
  }
  const siglas = [...new Set([...ordemDoManifesto.filter((x) => naPasta.includes(x)), ...naPasta.sort(), sigla])]
  const publicacoes = siglas.map((x) => ({ sigla: x, esquema: esquemaDaPublicacao(x) }))
  for (const pub of publicacoes) {
    db.exec(`ATTACH ':memory:' AS ${pub.esquema}`)
    desserializar(pub.sigla === sigla ? caminho : join(pasta, `pub-${pub.sigla}.sqlite`), pub.esquema)
  }
  const consultar = (sql: string, parametros?: Record<string, unknown>) => db.selectObjects(sql, parametros as never) as L[]

  // o motor do app sobre estes arquivos
  const estado = { estado: 'aberto' as const, publicacoes, geradoEm: '', modo: 'memoria' as const }
  cliente.usarMotor({
    abrir: async () => estado,
    reabrir: async () => estado,
    executar: async (sql, parametros) => consultar(sql, parametros as Record<string, unknown> | undefined),
  })
  await cliente.abrirBanco()

  const inicio = performance.now()
  const passos = await leitura.ordemDaLeitura(sigla)
  const ms = performance.now() - inicio
  if (!passos) {
    console.error(`${sigla} não é obra de leitura (sem entradas de catálogo, livro em parágrafos ou tradução).`)
    return 2
  }

  // o pacote, direto: os trechos (kinds da leitura, locator «<vol>.S.<p>») e as entradas de catálogo da obra
  const trechosDoPacote = consultar(
    `SELECT id FROM ${esquema}.passage WHERE publication = $sigla AND kind IN (${KINDS_DA_LEITURA.map((k) => `'${k}'`).join(', ')}) AND locator GLOB '*.S.*'`,
    { $sigla: sigla },
  ).map((l) => String(l.id))
  const entradasDoPacote = consultar(`SELECT id FROM ${esquema}.item WHERE kind = 'catalog' AND publication = $sigla`, { $sigla: sigla }).map((l) =>
    String(l.id),
  )

  const trechosNaOrdem = passos.flatMap((q) => (q.tipo === 'texto' ? q.trechos : []))
  const entradasNaOrdem = passos.flatMap((q) => (q.tipo === 'entrada' ? [q.itemId] : []))
  const trechos = cobertura(trechosDoPacote, trechosNaOrdem)
  const entradas = cobertura(entradasDoPacote, entradasNaOrdem)

  // os passos de texto por volume, na ordem em que os volumes aparecem
  const volumes: string[] = []
  const textoPorVolume = new Map<string, number>()
  for (const q of passos) {
    if (!textoPorVolume.has(q.volume)) {
      volumes.push(q.volume)
      textoPorVolume.set(q.volume, 0)
    }
    if (q.tipo === 'texto') textoPorVolume.set(q.volume, textoPorVolume.get(q.volume)! + 1)
  }
  const passosDeTexto = passos.filter((q) => q.tipo === 'texto').length

  // fora de ordem: no mesmo volume, uma entrada com número e letra menores que os da entrada emitida antes dela
  let foraDeOrdem = 0
  const ultimaDoVolume = new Map<string, { numero: number; sufixo: string }>()
  for (const q of passos) {
    if (q.tipo !== 'entrada') continue
    const antes = ultimaDoVolume.get(q.volume)
    if (antes && (q.numero - antes.numero || cmpTexto(q.sufixo, antes.sufixo)) < 0) foraDeOrdem++
    ultimaDoVolume.set(q.volume, { numero: q.numero, sufixo: q.sufixo })
  }

  const linha = (rotulo: string, c: ReturnType<typeof cobertura>) =>
    `${rotulo}: ${c.total} no pacote; ${c.umaVez} uma vez na ordem; ${c.faltando} faltando; ${c.repetidas} repetidos; ${c.estranhas} na ordem e fora do pacote`
  console.log(`Obra: ${sigla} (${nome})`)
  console.log(linha('Trechos', trechos))
  console.log(linha('Entradas', entradas))
  console.log(`Passos: ${passos.length} (${passosDeTexto} de texto, ${entradasNaOrdem.length} de entrada)`)
  console.log(`Passos de texto por volume: ${volumes.map((v) => `${v} ${textoPorVolume.get(v)}`).join(', ')}`)
  console.log(`Entradas fora da ordem dos números: ${foraDeOrdem}`)
  console.log(`Tempo para montar a ordem: ${Math.round(ms)} ms`)

  // os mapas: por legenda, as entradas e os sítios (como a página: o sítio do livro de cada entrada, levado ao destino pelas
  // mesclas do pacote; a coordenada do destino ou do absorvido de menor id), sem a camada do usuário
  const legendas = (await leitura.mapasDaLeitura(sigla)) ?? []
  const [listaDosSitios, pacoteDeSitios] = await Promise.all([pacoteDosSitios.listaDosSitiosDoPacote(), pacoteDosSitios.pacoteDeSitios()])
  const semCamada = { registros: new Map(), hlcDoCampo: () => null } as unknown as Parameters<typeof resolverSitios>[0]
  const resolucao = resolverSitios(semCamada, pacoteDeSitios)
  // os destinos, como `destinosDosSitios` (src/sitios/useResolucao.ts): os `SI-…` publicados e os sítios absorvidos
  const destinos = new Map<string, string>()
  for (const [de] of pacoteDeSitios.publicados) destinos.set(de, resolucao.destino(de))
  for (const k of resolucao.sitios) if (resolucao.destino(k) !== k) destinos.set(k, resolucao.destino(k))
  const daLista = { resolucao, destinos, nomes: new Map<string, string[]>() }
  const { itens: sitiosDaLista } = juntar(listaDosSitios, new Map(), [], new Map(), daLista, [], null)
  const rotuloDaParte = (m: { volume: string; parte: number }) => `${m.volume}, parte ${m.parte}`
  console.log(`Mapas (legendas): ${legendas.length}`)
  for (const m of legendas) {
    const resumos = await resumosDosItens(m.entradas, 'dada')
    const doMapa = mapas.sitiosDasEntradas(
      resumos.map((r) => r.sitioId ?? null),
      sitiosDaLista,
      destinos,
    )
    const { comCoordenada, semCoordenada } = mapas.contarSitios(doMapa)
    console.log(`  ${m.legenda} (${rotuloDaParte(m)}): ${m.entradas.length} entradas; ${comCoordenada} sítios com coordenada; ${semCoordenada} sem coordenada`)
  }
  const parteDe = new Map(legendas.map((m) => [m.legenda, rotuloDaParte(m)] as const))
  const pares = mapas.conferirParesDosMapas(sigla, (l) => parteDe.get(l) ?? null, [...mapas.PARES_DOS_MAPAS, ...paresAMais])
  console.log(`Pares de mapas desta obra: ${pares.length}`)
  for (const { par, partes, ok } of pares) {
    const onde = partes.map((p) => p ?? 'fora da obra').join(' | ')
    console.log(`  ${par[0]} + ${par[1]}: ${ok ? 'na mesma parte' : 'NÃO na mesma parte'} (${onde})`)
  }
  const paresErrados = pares.filter((p) => !p.ok).length

  db.close()
  const problemas =
    trechos.faltando + trechos.repetidas + trechos.estranhas + entradas.faltando + entradas.repetidas + entradas.estranhas + foraDeOrdem + paresErrados
  console.log(problemas === 0 ? 'Resultado: OK' : `Resultado: ${problemas} problema(s)`)
  return problemas === 0 ? 0 : 1
}

process.exitCode = await main(process.argv.slice(2))
