/**
 * O instantâneo da camada do usuário para a cópia de segurança (Tarefa 15): tudo o que a cópia leva, lido do IndexedDB
 * numa SÓ transação de leitura sobre as lojas `config` e `eventos`. Assim os eventos e a base são do mesmo momento, mesmo
 * com uma sincronização rodando: a consolidação une a base (uma transação) e só depois poda o diário (outra); duas leituras
 * separadas poderiam ver a base de antes e o diário de depois, e a cópia perderia os eventos podados.
 *
 * Só as chaves que a cópia usa: o aparelho, a base, os nomes dos aparelhos (`sync:nomes`), as marcas de leitura
 * (`sync:lidos`), o seq local e os números confirmados. O login fica em outro banco (`iconodb-login`) e nunca é lido aqui.
 */
import { CHAVE_DOS_CONFIRMADOS } from '../objetos-skc/confirmados'
import { validarConfirmados } from '../objetos-skc/numeracao'
import { aparelhoAtual, CHAVE_DO_APARELHO, type Aparelho } from './aparelho'
import { emTransacao, LOJA_CONFIG, LOJA_EVENTOS } from './bancoUsuario'
import type { LinhaDeEvento, Lidos } from './diarioLocal'
import { validarEvento } from './eventos'
import type { Instantaneo } from './exportar'
import { validarBase } from './fusao'

const objeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

function nomesDe(x: unknown): Record<string, string> {
  const saida: Record<string, string> = {}
  if (!objeto(x)) return saida
  for (const [ap, v] of Object.entries(x)) if (/^[a-z0-9]{8}$/.test(ap) && objeto(v) && typeof v.nome === 'string' && v.nome) saida[ap] = v.nome
  return saida
}

function lidosDe(x: unknown): Lidos {
  const saida: Lidos = {}
  if (!objeto(x)) return saida
  for (const [ap, l] of Object.entries(x)) {
    if (!objeto(l) || typeof l.marca !== 'number' || typeof l.ate !== 'number') continue
    const alem: Record<string, number> = {}
    if (objeto(l.alem)) for (const [s, n] of Object.entries(l.alem)) if (typeof n === 'number') alem[s] = n
    saida[ap] = { marca: l.marca, ate: l.ate, alem }
  }
  return saida
}

/** Lê o instantâneo (formato em src/usuario/exportar.ts, `Instantaneo`). */
export async function lerInstantaneo(): Promise<Instantaneo> {
  // Garante o id deste aparelho (num banco novo, ele nasce aqui); a leitura abaixo o lê de novo, junto com o resto.
  const garantido = await aparelhoAtual()
  return emTransacao([LOJA_CONFIG, LOJA_EVENTOS], 'readonly', (tx) => {
    const config = tx.objectStore(LOJA_CONFIG)
    const aparelho = config.get(CHAVE_DO_APARELHO)
    const base = config.get('base')
    const nomes = config.get('sync:nomes')
    const lidos = config.get('sync:lidos')
    const seq = config.get('seq')
    const confirmados = config.get(CHAVE_DOS_CONFIRMADOS)
    const linhas = tx.objectStore(LOJA_EVENTOS).getAll()
    return () => {
      const ap = (aparelho.result as Aparelho | undefined) ?? garantido
      const eventos: Instantaneo['eventos'] = []
      for (const l of linhas.result as LinhaDeEvento[]) {
        const v = validarEvento(l.evento)
        if (v.ok) eventos.push({ evento: v.evento, enviado: l.enviado === 1 })
      }
      return {
        aparelho: { id: ap.id, nome: ap.nome },
        nomes: nomesDe(nomes.result),
        eventos,
        base: base.result === undefined ? null : (validarBase(base.result)?.base ?? null),
        lidos: lidosDe(lidos.result),
        seqLocal: typeof seq.result === 'number' ? seq.result : 0,
        confirmados: validarConfirmados(confirmados.result),
      }
    }
  })
}
