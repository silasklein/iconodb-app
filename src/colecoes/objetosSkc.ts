/**
 * Os objetos SKC (os do usuário) vistos como resumos de objeto, para os cartões, as listas e as coleções.
 *
 * O número vem da numeração (Tarefa 9, src/objetos-skc/numeracao.ts): confirmado, provisório (marca "provisório") ou
 * nenhum (rascunho: o "número" do resumo é o id e a marca diz "sem número"), com o SKC, Nr. (decisão 38). Reservas de
 * livro (Tarefa 16) não aparecem.
 */
import { useMemo } from 'react'
import type { ObjetoResumo } from '../banco/tipos'
import { numeracaoDe, useNumeracao } from '../objetos-skc/atual'
import { eObjetoSkc, lerFicha, textoDaOrigem, tipoCurtoDe } from '../objetos-skc/modelo'
import type { Numeracao } from '../objetos-skc/numeracao'
import { nomeDeAgoraDoSitio } from '../sitios/doUsuario'
import { sitiosDoPacoteProntos, useSitiosDoPacote } from '../sitios/pacote'
import { redirecionamentosProntos } from '../pacote/redirecionamentos'
import { estadoAtual, useEstado, type Estado, type Registro } from '../usuario/estado'

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** O resumo de um objeto SKC. Sem número (rascunho, ou ainda calculando), o "número" é o id do registro. */
export function resumoDeObjetoSkc(r: Registro, numeracao: Numeracao = numeracaoDe(estadoAtual()), estado: Estado = estadoAtual()): ObjetoResumo {
  const ficha = lerFicha(r.campos)
  const info = numeracao.porId.get(r.id)
  const sitioId = texto(r.campos.sitio)
  // O nome de agora (corrigido → do livro → o guardado na ficha); a marca «excluído» é de quem mostra o cartão.
  // Um sítio seu que o pacote publicou (Tarefa 16) tem o nome do sítio do livro.
  const sitio = (sitioId ? nomeDeAgoraDoSitio(estado, sitioId, sitiosDoPacoteProntos(), texto(ficha.sitioNome), redirecionamentosProntos()) : null) ?? texto(ficha.sitioNome)
  const resumo: ObjetoResumo = {
    numero: info?.numero ?? r.id,
    itemId: r.id,
    origem: textoDaOrigem(ficha) || 'SKC',
    tipo: tipoCurtoDe(ficha),
    sitio,
    sitioId,
    miniatura: null,
    display_mode: null,
    skc: true,
  }
  if (info?.situacao === 'provisorio') resumo.provisorio = true
  if (!info?.numero) resumo.semNumero = true
  if (info?.nrSkc != null) resumo.nrSkc = info.nrSkc
  return resumo
}

const SEM_REGISTROS: ReadonlyMap<string, Registro> = new Map()

/** Os objetos SKC que existem (sem os excluídos e as reservas de livro), do mais novo ao mais antigo. */
export function useObjetosSkc(): ObjetoResumo[] {
  const registros = useEstado((e) => e.registros.get('objeto')) ?? SEM_REGISTROS
  const numeracao = useNumeracao()
  // O nome do sítio de cada objeto é o de agora: renomear um sítio (ou o pacote de sítios chegar) refaz a lista (T17-B-17).
  const sitios = useEstado((e) => e.registros.get('sitio'))
  const livro = useSitiosDoPacote()
  return useMemo(
    () =>
      [...registros.values()]
        .filter((r) => !r.excluido && eObjetoSkc(r))
        .sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : a.criadoEm > b.criadoEm ? -1 : a.id < b.id ? 1 : -1))
        .map((r) => resumoDeObjetoSkc(r, numeracao)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sitios` e `livro` só dizem QUANDO refazer: `resumoDeObjetoSkc` os lê do estado
    [registros, numeracao, sitios, livro],
  )
}
