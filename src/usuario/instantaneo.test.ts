/**
 * O instantâneo da camada do usuário para a cópia de segurança (Tarefa 15): uma só leitura do IndexedDB, com os eventos
 * (enviados e por enviar, deste e dos outros aparelhos), a base, os nomes, as marcas e os números confirmados. Nada de
 * login. Consistente mesmo com uma sincronização rodando ao mesmo tempo.
 */
import { B, ev } from '../../tests/suporte/eventosDeTeste'
import { gravarToken, gravarPendente } from '../dropbox/tokenStore'
import { CHAVE_DOS_CONFIRMADOS } from '../objetos-skc/confirmados'
import { aparelhoAtual, renomearAparelho } from './aparelho'
import { gravarNovosEventos, guardarEventosRemotos, lerBase, todosEventos, unirBase } from './armazem'
import { abrirBancoUsuario } from './bancoUsuario'
import { gravarConfig, marcarSegmentoEnviado, planejar, podarProprios, registrarLidos } from './diarioLocal'
import { estadoCanonico, consolidar, fundir } from './fusao'
import { montarCopia } from './exportar'
import { lerInstantaneo } from './instantaneo'

function apagar(nome: string) {
  return new Promise<void>((ok, falha) => {
    const r = indexedDB.deleteDatabase(nome)
    r.onsuccess = () => ok()
    r.onerror = () => falha(r.error)
    r.onblocked = () => falha(new Error(`banco ${nome} bloqueado`))
  })
}

async function fecharEApagar() {
  ;(await abrirBancoUsuario()).close()
  await apagar('iconodb-usuario')
}

beforeEach(async () => {
  await apagar('iconodb-usuario')
})
afterEach(() => vi.restoreAllMocks())

const nota = (reg: string, texto: string) => ({ tipo: 'nota' as const, reg, op: 'alterar' as const, campos: { texto } })

describe('lerInstantaneo', () => {
  it('lê o aparelho, os nomes, todos os eventos (com "enviado"), a base, as marcas, o seq e os números confirmados', async () => {
    await renomearAparelho('Mac de teste')
    const { id } = await aparelhoAtual()
    const [local] = await gravarNovosEventos([nota('NT-x-1', 'por enviar')])
    await guardarEventosRemotos([ev({ ap: B, seq: 1, reg: 'NT-bbbbbbbb-1', campos: { texto: 'do outro' } })])
    const base = consolidar(fundir([ev({ ap: B, seq: 9, reg: 'CO-bbbbbbbb-1', tipo: 'colecao', op: 'criar', campos: { nome: 'x' } })]))
    await unirBase(base)
    await gravarConfig('sync:nomes', { [B]: { nome: 'iPhone', rev: 'r1' } })
    await registrarLidos([{ aparelho: B, seg: 1, maiorSeq: 9 }])
    await gravarConfig(CHAVE_DOS_CONFIRMADOS, { 'OB-aaaaaaaa-1': 'CA00005' })

    const i = await lerInstantaneo()
    expect(i.aparelho).toEqual({ id, nome: 'Mac de teste' })
    expect(i.nomes).toEqual({ [B]: 'iPhone' })
    expect(i.eventos.map((x) => [x.evento.id, x.enviado]).sort()).toEqual([
      [local!.id, false],
      [`${B}-1-0`, true],
    ].sort())
    expect(i.base).toEqual(base)
    expect(i.lidos[B]).toEqual({ marca: 1, ate: 9, alem: {} })
    expect(i.seqLocal).toBe(1)
    expect(i.confirmados).toEqual({ 'OB-aaaaaaaa-1': 'CA00005' })
  })

  it('banco novo: o aparelho é criado, o resto vem vazio', async () => {
    const i = await lerInstantaneo()
    expect(i.aparelho.id).toMatch(/^[a-z0-9]{8}$/)
    expect(i).toMatchObject({ nomes: {}, eventos: [], base: null, lidos: {}, seqLocal: 0, confirmados: {} })
  })

  it('nenhum dado de login entra na cópia (token, código, verificador), nem outras chaves da configuração', async () => {
    const segredos = ['sl.TOKEN-DE-ACESSO-INVENTADO', 'REFRESH-INVENTADO-123', 'VERIFICADOR-INVENTADO-456', 'ESTADO-INVENTADO-789']
    await gravarToken({ accessToken: segredos[0]!, refreshToken: segredos[1]!, expiraEm: Date.now() + 3_600_000 })
    await gravarPendente({ modo: 'redirect', codeVerifier: segredos[2]!, state: segredos[3]! })
    // Chaves da configuração que não são da cópia (hash e rev do estado.json etc.) também ficam de fora.
    await gravarConfig('sync:estadoHash', 'HASH-QUE-NAO-VAI')
    await gravarNovosEventos([nota('NT-x-1', 'texto')])
    const texto = JSON.stringify(montarCopia(await lerInstantaneo(), new Date()))
    for (const s of [...segredos, 'HASH-QUE-NAO-VAI']) expect(texto).not.toContain(s)
    // Nenhuma chave com cara de dado de login, em qualquer nível.
    const chaves: string[] = []
    const andar = (x: unknown) => {
      if (Array.isArray(x)) x.forEach(andar)
      else if (x && typeof x === 'object')
        for (const [k, v] of Object.entries(x)) {
          chaves.push(k)
          andar(v)
        }
    }
    andar(JSON.parse(texto))
    expect(chaves.filter((k) => /token|refresh|access|verifier|secret|senha|password|auth|code|state$/i.test(k))).toEqual([])
    // Valores com cara de token do Dropbox ("sl.…") também não.
    expect(texto).not.toMatch(/"sl\.[A-Za-z0-9_-]/)
  })

  it('consistente com uma sincronização rodando: a consolidação une a base e só depois poda o diário; a cópia nunca perde nada', async () => {
    // Para cada ponto em que a sincronização pode estar quando a cópia começa, a cópia vê os eventos E a base do mesmo
    // momento: o estado dela tem sempre as três notas, e os eventos sobre a base o reproduzem.
    // O atraso anda em microtarefas (não é espera por um resultado: o resultado é conferido depois de
    // esperar as duas promessas); com uma leitura só, nenhum atraso muda nada.
    for (let atraso = 0; atraso < 60; atraso++) {
      const { id } = await aparelhoAtual()
      await gravarNovosEventos([nota('NT-x-1', 'um')])
      await gravarNovosEventos([nota('NT-x-2', 'dois')])
      await gravarNovosEventos([nota('NT-x-3', 'três')])
      const [plano] = await planejar(500, 0)
      await marcarSegmentoEnviado(plano!, id, 3)
      const eventos = await todosEventos()
      const base = consolidar(fundir(eventos))
      const cobertura = { ate: { [id]: 3 }, segmentos: { [id]: 1 } }
      const citados = new Set(eventos.map((e) => e.id))

      const sincronizacao = (async () => {
        for (let i = 0; i < atraso; i++) await Promise.resolve()
        await unirBase(base)
        await podarProprios(id, cobertura, citados)
      })()
      const instantaneo = await lerInstantaneo()
      await sincronizacao
      // A poda aconteceu de fato (o teste exercita a corrida).
      expect(await todosEventos()).toEqual([])
      expect(await lerBase()).not.toBeNull()

      const copia = montarCopia(instantaneo, new Date())
      const notas = copia.estado.registros.filter((r) => r.tipo === 'nota').map((r) => r.id)
      expect(notas, `atraso ${atraso}`).toEqual(['NT-x-1', 'NT-x-2', 'NT-x-3'])
      expect(estadoCanonico(fundir(copia.eventos, copia.base ?? undefined))).toBe(estadoCanonico(fundir([], copia.estado)))
      await fecharEApagar()
    }
  })
})
