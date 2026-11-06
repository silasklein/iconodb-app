/**
 * `lerCopia` (2C, bloco 1, Tarefa 7; especificação §6.2): lê e valida uma cópia (.json, ou o `copia.json` de um .zip), sem
 * mudar nada. Dados sintéticos (TESTE).
 */
import { A, B, ev, T0 } from '../../tests/suporte/eventosDeTeste'
import type { Evento } from '../usuario/eventos'
import { FORMATO_DA_COPIA, type CopiaDeSeguranca } from '../usuario/exportar'
import { consolidar, fundir } from '../usuario/fusao'
import { ErroDaCopia, lerCopia, type MotivoDoErroDaCopia } from './lerCopia'
import { montarZip } from './zip'

const eventos: Evento[] = [
  ev({ ap: A, seq: 1, tipo: 'nota', reg: 'NT-aaaaaaaa-1', op: 'criar', campos: { texto: 'nota TESTE', alvo: 'CA00001' } }),
  ev({ ap: B, seq: 1, tipo: 'colecao', reg: 'CO-bbbbbbbb-1', op: 'criar', campos: { nome: 'Coleção TESTE', membros: [] } }),
]

function copia(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const c: CopiaDeSeguranca = {
    formato: FORMATO_DA_COPIA,
    versao: 1,
    geradoEm: new Date(T0).toISOString(),
    aparelho: { id: A, nome: 'Mac' },
    aparelhos: { [A]: 'Mac', [B]: 'iPhone' },
    eventos,
    naoEnviados: [],
    base: null,
    estado: consolidar(fundir(eventos)),
    marcas: { [A]: { seq: 1, segmento: 0 } },
    numerosConfirmados: { 'OB-aaaaaaaa-1': 'CA00046' },
    imagens: [],
    observacoes: ['TESTE'],
  }
  return { ...c, ...extra }
}

const json = (x: unknown, nome = 'iconodb-copia-2026-11-05-1520.json') => new File([JSON.stringify(x)], nome, { type: 'application/json' })

async function zip(entradas: { nome: string; dados: string | Uint8Array }[]): Promise<Blob> {
  async function* gerar() {
    for (const e of entradas) yield { nome: e.nome, dados: typeof e.dados === 'string' ? new TextEncoder().encode(e.dados) : e.dados }
  }
  return montarZip(gerar())
}
const comoArquivo = (b: Blob, nome = 'iconodb-copia-completa-2026-11-05-1520.zip') => new File([b], nome, { type: 'application/zip' })

async function motivo(p: Promise<unknown>): Promise<MotivoDoErroDaCopia | 'nenhum'> {
  try {
    await p
    return 'nenhum'
  } catch (e) {
    expect(e).toBeInstanceOf(ErroDaCopia)
    return (e as ErroDaCopia).motivo
  }
}

describe('lerCopia', () => {
  it('um .json válido: a cópia, sem fotos', async () => {
    const lida = await lerCopia(json(copia()))
    expect(lida.fotos).toBeNull()
    expect(lida.copia).toMatchObject({ formato: 'iconodb-copia', versao: 1, aparelho: { id: A, nome: 'Mac' }, numerosConfirmados: { 'OB-aaaaaaaa-1': 'CA00046' } })
    expect(lida.copia.eventos).toEqual(eventos)
  })

  it('um .zip válido: o copia.json e as fotos (só as entradas de imagens/)', async () => {
    const b = await zip([
      { nome: 'LEIA-ME.txt', dados: 'TESTE' },
      { nome: 'copia.json', dados: JSON.stringify(copia()) },
      { nome: 'imagens/IM-aaaaaaaa-1/tela.webp', dados: new Uint8Array([1, 2, 3]) },
    ])
    const lida = await lerCopia(comoArquivo(b))
    expect(lida.copia.eventos).toEqual(eventos)
    expect([...lida.fotos!.keys()]).toEqual(['imagens/IM-aaaaaaaa-1/tela.webp'])
    expect([...new Uint8Array(await (await lida.fotos!.get('imagens/IM-aaaaaaaa-1/tela.webp')!()).arrayBuffer())]).toEqual([1, 2, 3])
  })

  it('o nome do arquivo não decide: um .zip com outro nome e um .json sem extensão também servem', async () => {
    const b = await zip([{ nome: 'copia.json', dados: JSON.stringify(copia()) }])
    expect((await lerCopia(comoArquivo(b, 'copia'))).fotos).not.toBeNull()
    expect((await lerCopia(json(copia(), 'copia'))).fotos).toBeNull()
  })

  it('outro JSON, um texto qualquer, um binário e um .zip sem copia.json: «nao-e-copia»', async () => {
    expect(await motivo(lerCopia(json({ formato: 'outra-coisa', versao: 1 })))).toBe('nao-e-copia')
    expect(await motivo(lerCopia(json([1, 2, 3])))).toBe('nao-e-copia')
    expect(await motivo(lerCopia(new File(['não é json'], 'x.json')))).toBe('nao-e-copia')
    expect(await motivo(lerCopia(new File([new Uint8Array([0, 1, 2, 3, 4, 5])], 'x.bin')))).toBe('nao-e-copia')
    expect(await motivo(lerCopia(new File([], 'vazio.json')))).toBe('nao-e-copia')
    expect(await motivo(lerCopia(comoArquivo(await zip([{ nome: 'outra.txt', dados: 'TESTE' }]))))).toBe('nao-e-copia')
  })

  it('`versao: 2`: «versao-nova» (no .json e no .zip)', async () => {
    expect(await motivo(lerCopia(json(copia({ versao: 2 }))))).toBe('versao-nova')
    expect(await motivo(lerCopia(comoArquivo(await zip([{ nome: 'copia.json', dados: JSON.stringify(copia({ versao: 2 })) }]))))).toBe('versao-nova')
  })

  it('evento adulterado (o estado não confere), evento inválido, estado ou base ilegíveis: «danificada»', async () => {
    const adulterado = eventos.map((e, i) => (i === 0 ? { ...e, campos: { texto: 'outro texto' } } : e))
    expect(await motivo(lerCopia(json(copia({ eventos: adulterado }))))).toBe('danificada')
    const invalido = eventos.map((e, i) => (i === 0 ? { ...e, hlc: 'x' } : e))
    expect(await motivo(lerCopia(json(copia({ eventos: invalido }))))).toBe('danificada')
    expect(await motivo(lerCopia(json(copia({ estado: { v: 1, registros: [{ tipo: 'nota' }] } }))))).toBe('danificada')
    expect(await motivo(lerCopia(json(copia({ estado: null }))))).toBe('danificada')
    expect(await motivo(lerCopia(json(copia({ base: { v: 2 } }))))).toBe('danificada')
    expect(await motivo(lerCopia(json(copia({ eventos: 'x' }))))).toBe('danificada')
    expect(await motivo(lerCopia(json(copia({ versao: 0 }))))).toBe('danificada')
    expect(await motivo(lerCopia(json(copia({ geradoEm: 'ontem' }))))).toBe('danificada')
  })

  it('a base que cobre eventos podados conta: eventos + base reproduzem o estado', async () => {
    const base = consolidar(fundir(eventos.slice(0, 1)))
    expect((await lerCopia(json(copia({ eventos: eventos.slice(1), base })))).copia.base).toEqual(base)
    // Sem a base, o estado não confere.
    expect(await motivo(lerCopia(json(copia({ eventos: eventos.slice(1), base: null }))))).toBe('danificada')
  })

  it('.zip truncado, ou com o copia.json ilegível: «danificada»', async () => {
    const b = await zip([{ nome: 'copia.json', dados: JSON.stringify(copia()) }])
    expect(await motivo(lerCopia(comoArquivo(b.slice(0, b.size - 10))))).toBe('danificada')
    expect(await motivo(lerCopia(comoArquivo(b.slice(0, 40))))).toBe('danificada')
    expect(await motivo(lerCopia(comoArquivo(await zip([{ nome: 'copia.json', dados: '{"formato": "iconodb-co' }]))))).toBe('danificada')
  })

  it('um arquivo que não é .zip só é lido inteiro se começa com «{» e não passa de 50 MB', async () => {
    // um arquivo de mentira: o tamanho é o declarado, e só a cabeça existe; text() é contado
    const falso = (cabeca: string, size: number) => {
      const real = new File([cabeca], 'x.json')
      let lidoInteiro = 0
      const f = {
        name: 'x.json',
        size,
        type: 'application/json',
        slice: (de?: number, ate?: number) => real.slice(de, ate),
        text: () => {
          lidoInteiro++
          return real.text()
        },
        arrayBuffer: () => real.arrayBuffer(),
      } as unknown as File
      return { f, lidoInteiro: () => lidoInteiro }
    }
    const valido = JSON.stringify(copia())
    // 200 MB de algo que não começa com «{» (um vídeo, um texto): «nao-e-copia» sem ler o arquivo
    const video = falso('\u0000\u0000\u0000 ftypisom' + 'x'.repeat(100), 200_000_000)
    expect(await motivo(lerCopia(video.f))).toBe('nao-e-copia')
    expect(video.lidoInteiro()).toBe(0)
    const texto = falso('   \n  Querido diário, ' + valido, 5_000)
    expect(await motivo(lerCopia(texto.f))).toBe('nao-e-copia')
    expect(texto.lidoInteiro()).toBe(0)
    // começa com «{», mas tem mais de 50 MB: «ilegivel», sem ler o arquivo
    const grande = falso(valido, 50 * 1024 * 1024 + 1)
    expect(await motivo(lerCopia(grande.f))).toBe('ilegivel')
    expect(grande.lidoInteiro()).toBe(0)
    // espaços e quebras de linha antes do «{» valem
    expect((await lerCopia(new File(['\n \t\r\n' + valido], 'x.json'))).copia.versao).toBe(1)
  })

  it('NB-4: uma cópia .json regravada com a marca UTF-8 (BOM, EF BB BF) no começo continua servindo', async () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf])
    const comBom = new File([bom, JSON.stringify(copia())], 'iconodb-copia-2026-11-05-1520.json', { type: 'application/json' })
    expect((await lerCopia(comBom)).copia.versao).toBe(1)
    // a marca seguida de espaços também; e a marca antes de outra coisa continua «nao-e-copia»
    expect((await lerCopia(new File([bom, ' \n', JSON.stringify(copia())], 'x.json'))).copia.versao).toBe(1)
    expect(await motivo(lerCopia(new File([bom, 'Querido diário'], 'x.json')))).toBe('nao-e-copia')
  })

  it('o arquivo não pode ser lido (o navegador recusa): «ilegivel»', async () => {
    const recusa = () => Promise.reject(new DOMException('não deu', 'NotReadableError'))
    const ruim = { name: 'x.json', size: 100, type: 'application/json', slice: () => ({ arrayBuffer: recusa, text: recusa }), text: recusa, arrayBuffer: recusa } as unknown as File
    expect(await motivo(lerCopia(ruim))).toBe('ilegivel')
  })
})
