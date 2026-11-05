import { useId, useState } from 'react'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { useCampoSalvo } from '../usuario/campoSalvo'
import { estadoAtual, registrar } from '../usuario/estado'
import { lerEdicaoDoVerbete, normalizarForma, type StatusDoVerbete } from './modelo'
import { aprovarVerbete, reabrirVerbete, voltarAProposta } from './operacoes'
import '../objetos-skc/Formulario.css'
import './Glossario.css'

interface Props {
  /** O id do verbete (`GL-<dígitos>` do pacote, ou `GL-<aparelho>-<n>` do usuário). */
  id: string
  /** A proposta original: a `forma` criada de um verbete do usuário, o `pt` de um do pacote. */
  original: string
  /** A forma de agora (a em uso, ou a original). */
  emUso: string
  /** O estado de AGORA (`situacaoDoVerbete`): aprovado só se a forma aprovada é a de agora. */
  status: StatusDoVerbete
  /** Havia uma aprovação e a forma mudou depois (outro aparelho, ou a recuperação de um texto): a tela avisa. */
  aprovacaoDesatualizada: boolean
  /** O estado que o pacote traz (vale quando ninguém mexeu no estado). */
  statusDoPacote: StatusDoVerbete
  /** Verbete do pacote: ele não tem `criar`, o primeiro `alterar` cria o registro. */
  doPacote: boolean
  /** O estado "aprovado" vem do pacote e ninguém o tocou (T17-B-11): a tela diz «Aprovado», não «Aprovado por você». */
  aprovadoPeloPacote?: boolean
}

/**
 * A forma em português de um verbete, editada no lugar (Verbete.dc.html): o campo se salva sozinho (`useCampoSalvo`: 1 s
 * depois da última tecla, ao sair e em Ctrl/⌘S), "Voltar à proposta original" (com "Desfazer"), a proposta original
 * embaixo, e "Aprovar". A mesma coisa para o verbete do livro e o do usuário; as duas escritas são um `alterar` de um
 * campo só no `verbete` (`formaEmUso`, `status`; src/glossario/modelo.ts). Uma forma vazia não é forma: o campo volta à de
 * agora ao sair. Escrever à mão a forma original grava `null`, o mesmo que voltar à proposta.
 *
 * Aprovação (revisão 2, I-A): "Aprovar" grava, num evento só, o estado e A FORMA QUE A PESSOA ESTÁ VENDO (`formaAprovada`). O
 * estado de agora é derivado (`situacaoDoVerbete`): aprovado só se a forma aprovada é a de agora; uma forma que mude depois,
 * de qualquer aparelho ou pela recuperação de um texto digitado, deixa de estar aprovada, com o aviso "A forma mudou; aprove
 * de novo quando quiser.". Além disso (revisão 1, M2), mudar a forma de um verbete aprovado grava antes `status: proposed`
 * (inofensivo e mais claro no histórico), salvo quando a forma que passa a valer é a aprovada.
 *
 * Não está aqui (a especificação do registro não tem o campo): "No texto corrido" e o gênero do desenho.
 */
export function EditorDaForma({ id, original, emUso, status, aprovacaoDesatualizada, statusDoPacote, doPacote, aprovadoPeloPacote = false }: Props) {
  const uid = useId()
  const [falhou, setFalhou] = useState(false)
  // O que valia antes de "Voltar à proposta original", para o "Desfazer" (some ao digitar).
  const [anterior, setAnterior] = useState<string | null>(null)
  const [mudou, setMudou] = useState(false)
  const formaOriginal = normalizarForma(original)

  /** Se o estado gravado é "aprovado" e `nova` não é a forma aprovada, o devolve a "a revisar" (antes de a forma ser escrita). */
  const reabrirSeMudou = async (nova: string) => {
    const r = estadoAtual().registro('verbete', id)
    const edicao = r ? lerEdicaoDoVerbete(r) : null
    if ((edicao?.status ?? statusDoPacote) !== 'approved') return
    if (normalizarForma(nova) === normalizarForma(edicao?.formaAprovada ?? original)) return
    await reabrirVerbete(id)
    setMudou(true)
  }

  const campo = useCampoSalvo({
    tipo: 'verbete',
    reg: id,
    campo: 'formaEmUso',
    valor: emUso,
    normalizar: normalizarForma,
    aceitar: (limpo) => limpo !== '',
    valorGravado: (limpo) => (limpo === formaOriginal ? null : limpo),
    criaRegistro: doPacote,
    antesDeGravar: (valor) => reabrirSeMudou(typeof valor === 'string' ? valor : original),
    aoFalhar: setFalhou,
  })
  const mudada = normalizarForma(emUso) !== formaOriginal

  const tentar = (p: Promise<unknown>) => {
    setFalhou(false)
    p.catch(() => setFalhou(true))
  }
  const voltar = () =>
    tentar(
      (async () => {
        // O que foi digitado e ainda não gravou entra primeiro (M3): o "Desfazer" restaura o que valia de fato.
        await campo.gravarAgora()
        const r = estadoAtual().registro('verbete', id)
        const antes = (r && lerEdicaoDoVerbete(r).formaEmUso) ?? null
        campo.setTexto(antes ?? original)
        await reabrirSeMudou(original)
        await voltarAProposta(id)
        setAnterior(antes)
      })(),
    )
  const desfazer = () => {
    const antes = anterior
    setAnterior(null)
    if (antes !== null)
      tentar(
        (async () => {
          await reabrirSeMudou(antes)
          await registrar('verbete', id, 'alterar', { formaEmUso: antes })
        })(),
      )
  }
  const aprovar = () =>
    tentar(
      campo.gravarAgora().then(async () => {
        // A forma que está na tela (já gravada acima): é ela que se aprova.
        const vista = normalizarForma(campo.texto) || emUso
        await aprovarVerbete(id, vista)
        setMudou(false)
      }),
    )

  return (
    <div className="forma-editor">
      <div className="form-campo">
        <label htmlFor={`${uid}-pt`}>Forma em português</label>
        <div className="forma-linha">
          <input
            id={`${uid}-pt`}
            type="text"
            lang="pt-BR"
            autoComplete="off"
            value={campo.texto}
            aria-describedby={`${uid}-apoio`}
            onChange={(e) => {
              setAnterior(null)
              campo.setTexto(e.target.value)
            }}
            onFocus={campo.aoFocar}
            onBlur={() => {
              // Uma forma vazia não é forma: volta à de agora, sem gravar nada.
              if (campo.texto.trim() === '') campo.setTexto(emUso)
              void campo.aoDesfocar()
            }}
          />
          {mudada && (
            <span className="forma-voltar">
              <IconButton icon="desfazer" label="Voltar à proposta original" tipPosition="start" onClick={voltar} />
            </span>
          )}
        </div>
        <span id={`${uid}-apoio`} className="form-ajuda">
          Proposta original: {original}
        </span>
      </div>

      {anterior !== null && (
        <p role="status" className="forma-aviso">
          Voltou à proposta original.{' '}
          <button type="button" className="hit forma-desfazer" onClick={desfazer}>
            Desfazer
          </button>
        </p>
      )}
      {(mudou || aprovacaoDesatualizada) && status !== 'approved' && (
        <p role="status" className="forma-aviso">
          A forma mudou; aprove de novo quando quiser.
        </p>
      )}

      {status === 'approved' ? (
        <div className="forma-aprovado">
          <p className="forma-aprovado-texto">
            <Icon name="confirmar" size={18} /> {aprovadoPeloPacote ? 'Aprovado' : 'Aprovado por você'}
          </p>
          <button type="button" className="form-botao" onClick={() => tentar(reabrirVerbete(id))}>
            Voltar a revisar
          </button>
        </div>
      ) : (
        <button type="button" className="form-botao form-botao-forte forma-aprovar" onClick={aprovar}>
          <Icon name="confirmar" size={18} />
          Aprovar
        </button>
      )}
      <p className="forma-nota">A forma em uso aparece nas listas, nas hipóteses e no texto onde o termo está como no glossário; nas outras ocorrências, na dica.</p>
      {falhou && (
        <p className="hipoteses-erro" role="alert">
          Não foi possível guardar; tente de novo.
        </p>
      )}
    </div>
  )
}
