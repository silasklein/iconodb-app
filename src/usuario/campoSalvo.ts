/**
 * Um campo de texto da camada do usuário que SE SALVA SOZINHO, sem botão "Salvar" e sem perder o que foi digitado.
 * Serve a qualquer campo pequeno de qualquer registro (a descrição da coleção; os próximos: nome, comentário, etc.).
 *
 *   const campo = useCampoSalvo({ tipo: 'colecao', reg: c.id, campo: 'descricao', valor: c.descricao, aoFalhar })
 *   <textarea value={campo.texto} onChange={(e) => campo.setTexto(e.target.value)} onFocus={campo.aoFocar} onBlur={() => void campo.aoDesfocar()} />
 *
 * Quando grava (um evento `alterar` só com este campo, pelo `registrar` da Tarefa 2):
 * - 1 s depois da última tecla (`ATRASO_DO_CAMPO_MS`); continuar digitando recomeça a contagem;
 * - ao sair do campo (`aoDesfocar`), com o texto aparado;
 * - em Ctrl/⌘S, "Salvar e sincronizar" e ao esconder a aba (o hook se registra em `pendentes`);
 * - ao desmontar (sair da tela).
 * Uma edição feita ENQUANTO uma gravação está em curso não espera o blur: o próximo atraso (ou Ctrl/⌘S) a grava, depois de
 * a gravação em curso terminar. Sem mudança em relação ao último valor salvo, nunca grava.
 *
 * Rede de segurança: ao esconder ou fechar a página (`pagehide`, `visibilitychange`) o IndexedDB pode ser cortado no meio.
 * Nesse instante, e de forma SÍNCRONA, o texto por gravar vai para o `localStorage` (`guardarEmergenciaDeCampo`), junto com
 * `base`, o hlc do campo de quando a pessoa começou a mexer. Quando o IndexedDB confirma, a entrada é limpa. Na abertura do
 * app, `recuperarEmergencias` aplica a entrada só se o hlc do campo ainda é a `base` (ver `emergencia.ts`): um valor mais
 * novo, de outro aparelho ou aba, nunca é coberto.
 *
 * Regras de uso:
 * - SÓ para registros que já existem (criados antes com `criar`). Se o registro não está no estado, o hook não grava nem
 *   guarda entrada de emergência: um `alterar` faria um registro existir sem `criar`. O texto fica na tela e é gravado
 *   quando o registro aparecer.
 * - Um hook por campo e por registro. Se a tela pode trocar de registro sem desmontar, ponha `key={reg}` no componente.
 * - `valor` é o valor que o estado tem agora (por exemplo `lerColecao(...).descricao`). Um valor novo que chega de fora
 *   (outro aparelho) só entra no campo se a pessoa não mexeu no texto, o campo não está com o foco e não há gravação em
 *   curso: o que ela escreveu nunca é trocado debaixo dos dedos.
 * - `aoFalhar(true)` quando a gravação falhou (o texto continua na tela e na memória; a próxima tentativa o grava) e
 *   `aoFalhar(false)` quando a seguinte passou.
 */
import { useEffect, useRef, useState } from 'react'
import { guardarEmergenciaDeCampo, limparEmergencia, temEmergencia } from './emergencia'
import { estadoAtual, registrar } from './estado'
import type { Json, Tipo } from './eventos'
import { registrarPendente } from './pendentes'

/** Quanto tempo depois da última tecla o campo grava sozinho. */
export const ATRASO_DO_CAMPO_MS = 1000

export interface OpcoesDoCampo {
  tipo: Tipo
  reg: string
  campo: string
  /** O valor salvo, como o estado o tem agora. */
  valor: string
  /** Apara os espaços das pontas ao gravar (padrão: sim). */
  aparar?: boolean
  /** Só para testes: troca o atraso de 1 s. */
  atrasoMs?: number
  /** Chamado a cada gravação: `true` se falhou, `false` se passou. */
  aoFalhar?: (falhou: boolean) => void
  /**
   * Um valor que não pode ser gravado (o crédito vazio de uma imagem, por exemplo): falso = não grava nem guarda
   * entrada de emergência; o valor salvo continua o anterior e o texto fica na tela para a pessoa corrigir.
   */
  aceitar?: (limpo: string) => boolean
  /**
   * Normaliza o texto (depois de aparar) antes de comparar com o salvo e de gravar: a forma de um verbete tem os espaços
   * colapsados e NFC, por exemplo. O que o campo mostra enquanto se digita não muda.
   */
  normalizar?: (texto: string) => string
  /** O valor que vai no evento, a partir do texto limpo (padrão: o próprio texto). Por exemplo `null` para "voltar à original". */
  valorGravado?: (limpo: string) => Json
  /**
   * O primeiro `alterar` pode CRIAR o registro (sem `criar` antes): é o caso do verbete do pacote, que não tem `criar` (a
   * fusão cria o registro com o primeiro evento; src/glossario/modelo.ts). Sem isto, um registro que não existe não é
   * escrito (um `alterar` faria existir um registro sem `criar`, como uma nota sem lugar).
   */
  criaRegistro?: boolean
  /**
   * Chamado (e esperado) logo ANTES de cada gravação, com o valor que vai no evento: quem precisa escrever outro registro
   * antes (a aprovação que se desfaz quando a forma muda, Tarefa 11) o faz aqui. Se rejeitar, a gravação falha como qualquer
   * outra (`aoFalhar(true)`) e o texto continua na tela.
   */
  antesDeGravar?: (valor: Json) => void | Promise<unknown>
}

export interface CampoSalvo {
  /** O que o campo mostra (o que a pessoa digitou, ainda não aparado). */
  texto: string
  setTexto: (texto: string) => void
  focado: boolean
  aoFocar: () => void
  /** Sai do campo: grava o que falta e apara o texto na tela. Espera a gravação. */
  aoDesfocar: () => Promise<void>
  /** Grava agora o que falta (espera a gravação em curso, se houver). */
  gravarAgora: () => Promise<void>
}

interface Interno {
  texto: string
  /** O último valor conhecido como salvo (já aparado, se o campo apara). */
  salva: string
  /** A pessoa mexeu no texto desde o último valor salvo ou recebido. */
  editado: boolean
  /** O hlc do campo de quando começou a mexer (`undefined`: ainda não mexeu). */
  base: string | null | undefined
  focado: boolean
  gravando: Promise<void> | null
  /** O valor da gravação em andamento (`undefined` fora dela): vai para a entrada de emergência (A-5 da Tarefa 17). */
  emVoo: Json | undefined
  temporizador: ReturnType<typeof setTimeout> | null
  chave: string
}

const sorteio = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

interface Funcoes {
  setTexto: (t: string) => void
  aoFocar: () => void
  aoDesfocar: () => Promise<void>
  gravar: () => Promise<void>
  sincrona: () => void
  cancelar: () => void
}

export function useCampoSalvo(opcoes: OpcoesDoCampo): CampoSalvo {
  const [texto, setTextoVisivel] = useState(opcoes.valor)
  const [focado, setFocadoVisivel] = useState(false)
  const opts = useRef(opcoes)
  opts.current = opcoes
  const m = useRef<Interno | null>(null)
  m.current ??= { texto: opcoes.valor, salva: opcoes.valor, editado: false, base: undefined, focado: false, gravando: null, emVoo: undefined, temporizador: null, chave: `campo-${sorteio()}` }
  const f = useRef<Funcoes | null>(null)
  if (f.current === null) {
    const i = m.current
    const limpar = (t: string) => {
      const aparado = opts.current.aparar === false ? t : t.trim()
      return opts.current.normalizar ? opts.current.normalizar(aparado) : aparado
    }
    const podeEscrever = () => opts.current.criaRegistro === true || estadoAtual().registro(opts.current.tipo, opts.current.reg) !== undefined
    const hlc = () => estadoAtual().hlcDoCampo(opts.current.tipo, opts.current.reg, opts.current.campo)
    const aplicar = (t: string) => {
      i.texto = t
      setTextoVisivel(t)
    }
    const cancelar = () => {
      if (i.temporizador !== null) clearTimeout(i.temporizador)
      i.temporizador = null
    }
    const gravar = (): Promise<void> => {
      cancelar()
      // Uma gravação em curso termina primeiro; o que foi digitado nesse meio-tempo é gravado em seguida.
      if (i.gravando) return i.gravando.then(gravar)
      const limpo = limpar(i.texto)
      const { tipo, reg, campo, aoFalhar } = opts.current
      if (!i.editado || limpo === i.salva) {
        // Nada a gravar: uma entrada de emergência que tenha sobrado (gravação que falhou, depois a pessoa desistiu) não vale mais.
        limparEmergencia(i.chave)
        return Promise.resolve()
      }
      // Só para registros que já existem: um `alterar` faria existir um registro sem `criar`. O texto fica na tela.
      if (!podeEscrever()) return Promise.resolve()
      if (opts.current.aceitar && !opts.current.aceitar(limpo)) {
        limparEmergencia(i.chave)
        return Promise.resolve()
      }
      const valor = opts.current.valorGravado ? opts.current.valorGravado(limpo) : limpo
      const antes = opts.current.antesDeGravar
      const escrever = () => registrar(tipo, reg, 'alterar', { [campo]: valor })
      i.emVoo = valor
      const emCurso = (antes ? Promise.resolve(antes(valor)).then(escrever) : escrever()).then(
        () => {
          i.emVoo = undefined
          i.salva = limpo
          if (limpar(i.texto) === limpo) {
            i.editado = false
            i.base = undefined
            limparEmergencia(i.chave)
          } else {
            // Digitou mais durante a gravação: a base do que falta é o hlc da escrita que acabou de passar. Uma entrada de
            // emergência guardada no meio dela (com a base de antes) é regravada com a nova.
            i.base = hlc()
            if (temEmergencia(i.chave)) f.current?.sincrona()
          }
          aoFalhar?.(false)
        },
        () => {
          i.emVoo = undefined
          aoFalhar?.(true)
        },
      )
      i.gravando = emCurso.finally(() => {
        i.gravando = null
      })
      return i.gravando
    }
    f.current = {
      cancelar,
      gravar,
      setTexto: (t) => {
        if (t === i.texto) return
        if (limpar(t) === i.salva) {
          i.editado = false
          i.base = undefined
          limparEmergencia(i.chave) // voltou ao que estava salvo: o rascunho guardado no pagehide não pode ressuscitar
        } else if (!i.editado) {
          i.editado = true
          i.base = hlc()
        }
        aplicar(t)
        cancelar()
        i.temporizador = setTimeout(() => {
          i.temporizador = null
          void gravar()
        }, opts.current.atrasoMs ?? ATRASO_DO_CAMPO_MS)
      },
      aoFocar: () => {
        i.focado = true
        setFocadoVisivel(true)
      },
      aoDesfocar: async () => {
        i.focado = false
        setFocadoVisivel(false)
        await gravar()
        // Sem nada por gravar, o campo mostra o valor salvo (aparado; ou o que chegou de fora enquanto havia foco).
        if (!i.editado) aplicar(i.salva)
      },
      sincrona: () => {
        const limpo = limpar(i.texto)
        const { tipo, reg, campo } = opts.current
        if (!i.editado || limpo === i.salva) return limparEmergencia(i.chave)
        if (!podeEscrever()) return
        if (opts.current.aceitar && !opts.current.aceitar(limpo)) return limparEmergencia(i.chave)
        guardarEmergenciaDeCampo(i.chave, {
          tipo,
          reg,
          campo,
          texto: limpo,
          ...(opts.current.valorGravado ? { valor: opts.current.valorGravado(limpo) } : {}),
          base: i.base !== undefined ? i.base : hlc(),
          ...(opts.current.criaRegistro ? { criar: true } : {}),
          // A gravação em voo pode ter chegado ao IndexedDB sem a página ver (A-5): a recuperação a reconhece por este valor.
          ...(i.emVoo !== undefined ? { emVoo: i.emVoo } : {}),
        })
      },
    }
  }
  const i = m.current
  const fn = f.current

  // Um valor novo que chega de fora vale se a pessoa não mexeu, não está no campo e nada está sendo gravado. Se chegou com o
  // foco no campo, entra ao sair dele (`aoDesfocar`).
  const { valor } = opcoes
  useEffect(() => {
    i.salva = valor
    if (!i.editado && !i.focado && !i.gravando) {
      i.texto = valor
      setTextoVisivel(valor)
    }
  }, [valor, i])

  useEffect(() => {
    const desfazer = registrarPendente(fn.gravar, fn.sincrona)
    return () => {
      desfazer()
      fn.cancelar()
      void fn.gravar()
    }
  }, [fn])

  return { texto, setTexto: fn.setTexto, focado, aoFocar: fn.aoFocar, aoDesfocar: fn.aoDesfocar, gravarAgora: fn.gravar }
}
