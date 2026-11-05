import { useEffect, useRef, useState } from 'react'
import { lerVerbeteSkc } from '../glossario/modelo'
import { useOrigensQueCriaram } from '../pacote/redirecionamentos'
import { lerSitioSkc } from '../sitios/modelo'
import { Icon } from '../ui/Icon'
import { registrarVarios } from '../usuario/estado'
import { useLido } from '../usuario/useLido'
import '../imagens-usuario/MarcaSkc.css'
import '../objetos-skc/Formulario.css'
import './Lista.css'
import './VeioDeVoce.css'

interface Props {
  tipo: 'verbete' | 'sitio'
  /** O id do livro (`GL-<dígitos>` ou `<SIGLA>-<n>`). */
  id: string
}

interface Origem {
  id: string
  nome: string
  excluido: boolean
}

const TEXTO = {
  verbete: { titulo: 'Este verbete veio de você', singular: 'verbete', plural: 'verbetes', este: 'este verbete', ligado: 'as notas e hipóteses ligadas a este verbete ficam guardadas' },
  sitio: { titulo: 'Este sítio veio de você', singular: 'sítio', plural: 'sítios', este: 'este sítio', ligado: 'os objetos, as notas e as correções ligados a este sítio ficam guardados' },
} as const

const lista = (nomes: string[]) => nomes.map((n) => `«${n}»`).join(', ')

/**
 * Decisão 50 (revisão 2 da Tarefa 16): na página de um verbete ou sítio do livro que veio de um registro do usuário (a linha
 * do redirecionamento com `criado`; `useOrigensQueCriaram`), o bloco «Este verbete veio de você» / «Este sítio veio de
 * você» com «Excluir o seu verbete» / «Excluir o seu sítio». A ação exclui o(s) registro(s) de origem (`GL-<aparelho>-<n>`,
 * `SI-…`), num evento por origem e numa só transação; na importação seguinte a entrada sai dos livros e o id fica reservado
 * (decisão 47). Enquanto o pacote ainda a traz, a página continua aqui e o bloco mostra o aviso «Sai dos livros na
 * próxima importação» e «Restaurar» (que restaura as origens excluídas). Uma entrada que já era do livro (o registro do
 * usuário só leva a ela) não tem o bloco.
 *
 * Revisão 3 (decisão 51 e a re-revisão 2): com várias origens, «Excluir os seus 2 verbetes», e a confirmação diz que saem
 * juntos; a confirmação diz que nada se apaga, mas que o que está ligado à entrada fica sem ela até restaurar; depois de
 * excluir, «Até lá, «Restaurar» fica aqui.». Se uma origem viva ainda não chegou a este aparelho (m-O), o bloco não
 * afirma que a entrada sai dos livros: diz quantas faltam, pede para sincronizar e não oferece Excluir. A região viva
 * (`role="status"`) fica sempre montada (m-UI2), e Restaurar é descrito por ela.
 *
 * Revisão 4 (m-M): com uma origem já excluída e outra viva, o botão e a confirmação contam só as vivas (as que «Excluir»
 * exclui), e o texto diz qual já foi excluída.
 */
export function VeioDeVoce({ tipo, id }: Props) {
  const ids = useOrigensQueCriaram(id) ?? []
  // Só as origens que este aparelho tem (o registro chega com a sincronização): excluir um registro que não existe criaria
  // um registro vazio, e o nome seria só o id.
  const origens = useLido([tipo], `${tipo}:${ids.join('|')}`, (e): Origem[] =>
    ids.flatMap((o) => {
      const r = e.registro(tipo, o)
      if (!r) return []
      const nome = tipo === 'verbete' ? lerVerbeteSkc(r).emUso : lerSitioSkc(r).nomeDeAgora
      return [{ id: o, nome, excluido: r.excluido }]
    }),
  )
  const [confirmando, setConfirmando] = useState(false)
  const [falhou, setFalhou] = useState<string | null>(null)
  // O foco depois de cada passo: Cancelar ao abrir a confirmação; o botão ao fechá-la ou ao restaurar; Restaurar ao excluir.
  const [foco, setFoco] = useState<'cancelar' | 'gatilho' | 'restaurar' | null>(null)
  const gatilhoRef = useRef<HTMLButtonElement>(null)
  const cancelarRef = useRef<HTMLButtonElement>(null)
  const restaurarRef = useRef<HTMLButtonElement>(null)
  const excluidas = origens.length > 0 && origens.every((o) => o.excluido)
  useEffect(() => {
    const alvo = foco === 'cancelar' ? cancelarRef.current : foco === 'gatilho' ? gatilhoRef.current : foco === 'restaurar' ? restaurarRef.current : null
    if (alvo) {
      alvo.focus()
      setFoco(null)
    }
  }, [foco, confirmando, excluidas])

  if (origens.length === 0) return null
  const t = TEXTO[tipo]
  const nomes = origens.map((o) => o.nome)
  const varias = origens.length > 1
  /** Quantas origens vivas o pacote diz que existem e este aparelho ainda não tem (m-O). */
  const faltam = Math.max(0, ids.length - origens.length)
  const nDe = (n: number) => (n === 1 ? `1 ${t.singular} seu` : `${n} ${t.plural} seus`)
  // Revisão 4 (m-M): uma origem já excluída (noutro aparelho, antes do pacote) não conta no botão nem na confirmação:
  // «Excluir» só exclui as vivas.
  const vivas = origens.filter((o) => !o.excluido)
  const jaExcluidas = origens.filter((o) => o.excluido)
  const nomesVivos = vivas.map((o) => o.nome)
  const variasVivas = vivas.length > 1
  const rotuloExcluir = variasVivas ? `Excluir os seus ${vivas.length} ${t.plural}` : `Excluir o seu ${t.singular}`
  // «do seu verbete «x»» / «de 2 verbetes seus («x», «y»)»
  const de = varias ? `de ${nDe(origens.length)} (${lista(nomes)})` : `do seu ${t.singular} ${lista(nomes)}`
  const quem = varias ? `os seus ${origens.length} ${t.plural}` : `o seu ${t.singular} ${lista(nomes)}`
  const ainda = faltam === 1 ? 'que ainda não chegou' : 'que ainda não chegaram'
  const aviso = !excluidas
    ? ''
    : faltam === 0
      ? (
          <>
            Você excluiu {quem}. <strong>Sai dos livros na próxima importação.</strong> Até lá, «Restaurar» fica aqui.
          </>
        )
      : `Você excluiu ${quem}. Mais ${nDe(faltam)} ${faltam === 1 ? 'leva' : 'levam'} a ${t.este} e ainda não ${faltam === 1 ? 'chegou' : 'chegaram'} a este aparelho: enquanto ${faltam === 1 ? 'ele existir' : 'um deles existir'}, ${t.este} continua nos livros. Sincronize para ${faltam === 1 ? 'vê-lo' : 'vê-los'}.`
  const statusId = `veio-de-voce-status-${id}`

  const excluir = () => {
    setFalhou(null)
    setConfirmando(false)
    registrarVarios(vivas.map((o) => ({ tipo, reg: o.id, op: 'excluir' as const, campos: {} }))).then(
      () => setFoco('restaurar'),
      () => {
        setFalhou('Não foi possível excluir; tente de novo.')
        setFoco('gatilho')
      },
    )
  }
  const restaurar = () => {
    setFalhou(null)
    registrarVarios(origens.filter((o) => o.excluido).map((o) => ({ tipo, reg: o.id, op: 'restaurar' as const, campos: {} }))).then(
      () => setFoco('gatilho'),
      () => setFalhou('Não foi possível restaurar; tente de novo.'),
    )
  }

  return (
    <section className="detalhe-secao veio-de-voce" aria-labelledby={`veio-de-voce-${id}`}>
      <div className="detalhe-secao-topo">
        <h2 id={`veio-de-voce-${id}`}>{t.titulo}</h2>
        <span className="marca-skc">SKC</span>
      </div>
      {/* m-UI2: sempre montada, para o aviso ser anunciado quando o texto chega */}
      <p role="status" id={statusId} className="veio-de-voce-status">
        {aviso}
      </p>
      {excluidas ? (
        <div className="veio-de-voce-excluido">
          <button ref={restaurarRef} type="button" className="form-botao" aria-describedby={statusId} onClick={restaurar}>
            <Icon name="desfazer" size={18} />
            Restaurar
          </button>
        </div>
      ) : faltam > 0 ? (
        <p className="veio-de-voce-texto">
          Publicado a partir {de} e de mais {nDe(faltam)} {ainda} a este aparelho. Sincronize para ver todos; enquanto um deles existir, {t.este} continua nos livros.
        </p>
      ) : (
        <>
          <p className="veio-de-voce-texto">
            Publicado a partir {de}.{' '}
            {jaExcluidas.length > 0
              ? `Você já excluiu ${lista(jaExcluidas.map((o) => o.nome))}; se excluir ${variasVivas ? `os outros ${vivas.length}` : lista(nomesVivos)}, ele sai dos livros na próxima importação.`
              : `Se você ${varias ? 'os' : 'o'} excluir, ele sai dos livros na próxima importação.`}
          </p>
          {confirmando ? (
            <div role="group" aria-label={variasVivas ? `${rotuloExcluir}?` : `${rotuloExcluir} ${lista(nomesVivos)}?`} className="veio-de-voce-confirmar">
              <p>
                {variasVivas && (
                  <>
                    Os {nDe(vivas.length)} ({lista(nomesVivos)}) são excluídos juntos: enquanto um deles existir, {t.este} continua nos livros.{' '}
                  </>
                )}
                <span className="veio-de-voce-id">{id}</span> fica reservado para ele. Nada se apaga: {t.ligado}, mas sem ele até você restaurar. Ao restaurar, ele volta com o mesmo{' '}
                <span className="veio-de-voce-id">{id}</span> e tudo volta a se ligar a ele.
              </p>
              <div className="veio-de-voce-botoes">
                <button
                  ref={cancelarRef}
                  type="button"
                  className="form-botao"
                  onClick={() => {
                    setConfirmando(false)
                    setFoco('gatilho')
                  }}
                >
                  Cancelar
                </button>
                <button type="button" className="form-botao form-botao-forte" onClick={excluir}>
                  Excluir
                </button>
              </div>
            </div>
          ) : (
            <button
              ref={gatilhoRef}
              type="button"
              className="form-botao"
              onClick={() => {
                setFalhou(null)
                setConfirmando(true)
                setFoco('cancelar')
              }}
            >
              <Icon name="excluir" size={18} />
              {rotuloExcluir}
            </button>
          )}
        </>
      )}
      {falhou && <p role="alert" className="veio-de-voce-falha">{falhou}</p>}
    </section>
  )
}
