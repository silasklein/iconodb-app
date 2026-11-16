import { useEffect, useRef, useState } from 'react'
import { lerObra } from '../bibliografia/modelo'
import { lerVerbeteSkc } from '../glossario/modelo'
import { guardarNomes } from '../excluidos/nomesGuardados'
import { useOrigensQueCriaram } from '../pacote/redirecionamentos'
import { lerSitioSkc } from '../sitios/modelo'
import { Icon } from '../ui/Icon'
import { registrarVarios } from '../usuario/estado'
import { useSincronizacao } from '../usuario/useSincronizacao'
import { useLido } from '../usuario/useLido'
import '../imagens-usuario/MarcaSkc.css'
import '../objetos-skc/Formulario.css'
import './Lista.css'
import './VeioDeVoce.css'

interface Props {
  tipo: 'verbete' | 'sitio' | 'obra'
  /** O id do livro (`GL-<dígitos>`, `<SIGLA>-<n>` ou `BIB-<dígitos>`). */
  id: string
  /**
   * O nome da entrada dos livros (a página aberta). Não é mostrado (uma origem que só tem a marca é dita sem nome, N-2), mas
   * fica guardado neste aparelho para as origens que faltam, para «Excluídos» dizê-lo depois da importação (P5).
   */
  nomeDoLivro?: string
}

interface Origem {
  id: string
  nome: string
  excluido: boolean
  /**
   * O registro só tem a marca de exclusão (sem campos): a origem que nunca chegou e foi retirada mesmo assim (§5). Ela não
   * tem nome próprio, e o da entrada dos livros repetiria o de outra origem; os textos a dizem sem nome, «que não chegou».
   */
  soMarca: boolean
}

/** As palavras que concordam com a entrada (o verbete e o sítio no masculino, a obra no feminino). */
const MASCULINO = { o: 'o', os: 'os', seu: 'seu', seus: 'seus', ele: 'ele', eles: 'eles', do: 'do', um: 'um deles', outros: 'outros', juntos: 'excluídos juntos', publicado: 'Publicado', lo: 'lo', los: 'los', todos: 'todos', Os: 'Os' }
const FEMININO = { o: 'a', os: 'as', seu: 'sua', seus: 'suas', ele: 'ela', eles: 'elas', do: 'da', um: 'uma delas', outros: 'outras', juntos: 'excluídas juntas', publicado: 'Publicada', lo: 'la', los: 'las', todos: 'todas', Os: 'As' }

const TEXTO = {
  verbete: { titulo: 'Este verbete veio de você', singular: 'verbete', plural: 'verbetes', este: 'este verbete', ligado: 'as notas e hipóteses ligadas a este verbete ficam guardadas', g: MASCULINO },
  sitio: { titulo: 'Este sítio veio de você', singular: 'sítio', plural: 'sítios', este: 'este sítio', ligado: 'os objetos, as notas e as correções ligados a este sítio ficam guardados', g: MASCULINO },
  // Parte 2C, bloco 3 (Tarefa 14): a obra do usuário que o pacote publicou (`redirecionamento tipo 'obra'`, `criado`)
  obra: { titulo: 'Esta obra veio de você', singular: 'obra', plural: 'obras', este: 'esta obra', ligado: 'as citações ligadas a esta obra, os objetos que a citam e as notas ficam guardados', g: FEMININO },
} as const

/** O nome de uma origem: a forma em uso do verbete, o nome de agora do sítio, a citação curta (ou o título) da obra. */
function nomeDaOrigem(tipo: Props['tipo'], r: Parameters<typeof lerObra>[0]): string {
  if (tipo === 'verbete') return lerVerbeteSkc(r).emUso
  if (tipo === 'sitio') return lerSitioSkc(r).nomeDeAgora
  const o = lerObra(r)
  return (o && (o.curta || o.csl.title)) || r.id
}

const ROTULO_RETIRAR = 'Retirar dos livros mesmo assim'

/** «x», «y»; o mesmo nome (duas origens com o mesmo nome) aparece uma vez, como em «Excluídos» (P7). */
const lista = (nomes: string[]) => [...new Set(nomes)].map((n) => `«${n}»`).join(', ')
const queNaoChegou = (n: number) => (n === 1 ? 'que não chegou' : 'que não chegaram')

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
 * Revisão 5 (2C, bloco 1, §5): se falta alguma origem viva e a sincronização está «Sincronizado» sem nada por enviar, o bloco
 * oferece «Retirar dos livros mesmo assim» (mesma confirmação, com «Retirar»): um `excluir` para cada origem viva, inclusive as
 * que faltam, numa transação. A que faltava fica só com a marca (sem campos) e, ao chegar depois, continua excluída.
 * «Restaurar» restaura todas as excluídas, inclusive as que só têm a marca (que voltam a «faltar»).
 *
 * Revisão 4 (m-M): com uma origem já excluída e outra viva, o botão e a confirmação contam só as vivas (as que «Excluir»
 * exclui), e o texto diz qual já foi excluída.
 *
 * Parte 2C, bloco 3 (Tarefa 14): também a obra dos livros que veio de uma obra sua (`BIB-<aparelho>-<n>` → `BIB-<dígitos>`,
 * `tipo 'obra'`): «Esta obra veio de você», «Excluir a sua obra», o mesmo comportamento, com as palavras no feminino.
 */
export function VeioDeVoce({ tipo, id, nomeDoLivro }: Props) {
  const ids = useOrigensQueCriaram(id) ?? []
  // Só as origens que este aparelho tem (o registro chega com a sincronização): excluir um registro que não existe criaria
  // um registro vazio, e o nome seria só o id.
  const origens = useLido([tipo], `${tipo}:${ids.join('|')}`, (e): Origem[] =>
    ids.flatMap((o) => {
      const r = e.registro(tipo, o)
      if (!r) return []
      const soMarca = Object.keys(r.campos).length === 0
      // Uma origem restaurada que só tem a marca continua sem chegar: não conta como presente (§5).
      if (soMarca && !r.excluido) return []
      const nome = soMarca ? '' : nomeDaOrigem(tipo, r)
      return [{ id: o, nome, excluido: r.excluido, soMarca }]
    }),
  )
  const { estado: estadoDaSync, ultimaEm, iniciado } = useSincronizacao()
  const [confirmando, setConfirmando] = useState<false | 'excluir' | 'retirar'>(false)
  const [falhou, setFalhou] = useState<string | null>(null)
  // O foco depois de cada passo: Cancelar ao abrir a confirmação; o botão ao fechá-la ou ao restaurar; Restaurar ao excluir.
  const [foco, setFoco] = useState<'cancelar' | 'gatilho' | 'restaurar' | null>(null)
  // N-1: restaurou a única origem presente, que só tinha a marca: ela volta a «faltar» e, com o restaurar por enviar, a
  // retirada não vale; o bloco fica (com o texto de «sincronize») em vez de sumir com o foco.
  const [restaurou, setRestaurou] = useState(false)
  const gatilhoRef = useRef<HTMLButtonElement>(null)
  const textoRef = useRef<HTMLParagraphElement>(null)
  const cancelarRef = useRef<HTMLButtonElement>(null)
  const restaurarRef = useRef<HTMLButtonElement>(null)
  const excluidas = origens.length > 0 && origens.every((o) => o.excluido)
  useEffect(() => {
    // Sem botão depois de restaurar (N-1), o foco vai ao texto do bloco.
    const alvo =
      foco === 'cancelar' ? cancelarRef.current : foco === 'gatilho' ? (gatilhoRef.current ?? textoRef.current) : foco === 'restaurar' ? restaurarRef.current : null
    if (alvo) {
      alvo.focus()
      setFoco(null)
    }
  }, [foco, confirmando, excluidas, origens.length])

  // P5: a origem que só tem a marca (retirada aqui ou noutro aparelho) guarda neste aparelho o nome da entrada dos livros
  const soComMarca = origens.filter((o) => o.soMarca).map((o) => o.id).join('|')
  useEffect(() => {
    if (!nomeDoLivro || !soComMarca) return
    void guardarNomes(Object.fromEntries(soComMarca.split('|').map((o) => [o, nomeDoLivro]))).catch(() => undefined)
  }, [soComMarca, nomeDoLivro])

  const t = TEXTO[tipo]
  const g = t.g
  const faltam = Math.max(0, ids.length - origens.length)
  // §5: só com a sincronização em dia, que já rodou ao menos uma vez neste aparelho (`'sincronizado'` também é o estado
  // inicial), e nada por enviar; fora disso o bloco pede para sincronizar, como antes.
  const podeRetirar = faltam > 0 && estadoDaSync === 'sincronizado' && iniciado && ultimaEm !== null
  // Nenhuma origem chegou a este aparelho: o bloco só aparece se a retirada é possível (a única saída para uma origem perdida),
  // ou logo depois de restaurar a que só tinha a marca (N-1), enquanto ela faltar. `restaurou` é desta entrada: quem usa o
  // bloco o monta com `key={id}` (NB-1).
  const depoisDeRestaurar = restaurou && faltam > 0
  if (origens.length === 0 && !podeRetirar && !depoisDeRestaurar) return null
  const varias = origens.length > 1
  const nDe = (n: number) => (n === 1 ? `1 ${t.singular} ${g.seu}` : `${n} ${t.plural} ${g.seus}`)
  // Revisão 4 (m-M): uma origem já excluída (noutro aparelho, antes do pacote) não conta no botão nem na confirmação:
  // «Excluir» só exclui as vivas.
  const vivas = origens.filter((o) => !o.excluido)
  const jaExcluidas = origens.filter((o) => o.excluido)
  const nomesVivos = vivas.map((o) => o.nome)
  const variasVivas = vivas.length > 1
  const rotuloExcluir = variasVivas ? `Excluir ${g.os} ${g.seus} ${vivas.length} ${t.plural}` : `Excluir ${g.o} ${g.seu} ${t.singular}`
  // N-2: as que só têm a marca não têm nome visível: ««x» e 1 que não chegou», «1 verbete seu que não chegou».
  const comNome = (os: Origem[]) => os.filter((o) => !o.soMarca).map((o) => o.nome)
  const semNome = (os: Origem[]) => os.filter((o) => o.soMarca).length
  /** ««x», «y»» / ««x» e 1 verbete seu que não chegou» / «2 verbetes seus que não chegaram» */
  const quais = (os: Origem[]) => {
    const nomes = comNome(os)
    const n = semNome(os)
    const sem = n > 0 ? `${nDe(n)} ${queNaoChegou(n)}` : ''
    return nomes.length === 0 ? sem : sem ? `${lista(nomes)} e ${sem}` : lista(nomes)
  }
  const um = origens[0]
  // «do seu verbete «x»» / «do seu verbete que não chegou» / «de 2 verbetes seus («x», «y»)» / «de 2 verbetes seus («x» e 1 que não chegou)»
  const de = varias
    ? comNome(origens).length === 0
      ? `de ${nDe(origens.length)} ${queNaoChegou(origens.length)}`
      : `de ${nDe(origens.length)} (${lista(comNome(origens))}${semNome(origens) > 0 ? ` e ${semNome(origens)} ${queNaoChegou(semNome(origens))}` : ''})`
    : um?.soMarca
      ? `${g.do} ${g.seu} ${t.singular} ${queNaoChegou(1)}`
      : `${g.do} ${g.seu} ${t.singular} ${lista(comNome(origens))}`
  const quem = varias
    ? `${g.os} ${g.seus} ${origens.length} ${t.plural}`
    : um?.soMarca
      ? `${g.o} ${g.seu} ${t.singular} ${queNaoChegou(1)}`
      : `${g.o} ${g.seu} ${t.singular} ${lista(comNome(origens))}`
  const faltaTexto = `${faltam === 1 ? 'Falta' : 'Faltam'} neste aparelho ${nDe(faltam)} que ${faltam === 1 ? 'leva' : 'levam'} a esta entrada. Se ${faltam === 1 ? `${g.ele} não chegou` : `${g.eles} não chegaram`} depois de sincronizar, ${faltam === 1 ? 'pode' : 'podem'} ter se perdido. Você pode retirar a entrada dos livros mesmo assim: ${g.os} ${g.seus} ${t.plural} que levam a ela vão para Excluídos, e ela sai dos livros na próxima importação.`
  const ainda = faltam === 1 ? 'que ainda não chegou' : 'que ainda não chegaram'
  const aviso = !excluidas
    ? ''
    : faltam === 0
      ? (
          <>
            Você excluiu {quem}. <strong>Sai dos livros na próxima importação.</strong> Até lá, «Restaurar» fica aqui.
          </>
        )
      : podeRetirar
        ? faltaTexto
        : `Você excluiu ${quem}. Mais ${nDe(faltam)} ${faltam === 1 ? 'leva' : 'levam'} a ${t.este} e ainda não ${faltam === 1 ? 'chegou' : 'chegaram'} a este aparelho: enquanto ${faltam === 1 ? `${g.ele} existir` : `${g.um} existir`}, ${t.este} continua nos livros. Sincronize para ${faltam === 1 ? `vê-${g.lo}` : `vê-${g.los}`}.`
  const statusId = `veio-de-voce-status-${id}`

  // Excluir: as vivas que este aparelho tem. Retirar: todas as vivas, inclusive as que faltam (os ids vêm do pacote).
  const excluir = (retirando = false) => {
    setFalhou(null)
    setConfirmando(false)
    const alvos = retirando ? ids.filter((o) => !origens.some((x) => x.id === o && x.excluido)) : vivas.map((o) => o.id)
    registrarVarios(alvos.map((o) => ({ tipo, reg: o, op: 'excluir' as const, campos: {} }))).then(
      () => {
        setFoco('restaurar')
        // P5: a que faltava fica só com a marca (sem campos); o nome da entrada fica guardado neste aparelho
        const semRegistro = alvos.filter((o) => !origens.some((x) => x.id === o))
        if (retirando && nomeDoLivro) void guardarNomes(Object.fromEntries(semRegistro.map((o) => [o, nomeDoLivro]))).catch(() => undefined)
      },
      () => {
        setFalhou(retirando ? 'Não foi possível retirar; tente de novo.' : 'Não foi possível excluir; tente de novo.')
        setFoco('gatilho')
      },
    )
  }
  const restaurar = () => {
    setFalhou(null)
    registrarVarios(origens.filter((o) => o.excluido).map((o) => ({ tipo, reg: o.id, op: 'restaurar' as const, campos: {} }))).then(
      () => {
        setRestaurou(true)
        setFoco('gatilho')
      },
      () => setFalhou('Não foi possível restaurar; tente de novo.'),
    )
  }

  // A mesma confirmação da decisão 51, com «Retirar» no lugar de «Excluir» (2C, bloco 1, §5). No lugar, foco em Cancelar.
  const confirmacao = (rotuloDoGrupo: string, juntos: React.ReactNode, aoConfirmar: () => void, verbo: string) => (
    <div role="group" aria-label={rotuloDoGrupo} className="veio-de-voce-confirmar">
      <p>
        {juntos}
        <span className="veio-de-voce-id">{id}</span> fica reservado para {g.ele}. Nada se apaga: {t.ligado}, mas sem {g.ele} até você restaurar. Ao restaurar, {g.ele} volta com o mesmo{' '}
        <span className="veio-de-voce-id">{id}</span> e tudo volta a se ligar a {g.ele}.
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
        <button type="button" className="form-botao form-botao-forte" onClick={aoConfirmar}>
          {verbo}
        </button>
      </div>
    </div>
  )
  const gatilho = (modo: 'excluir' | 'retirar', rotulo: string) => (
    <button
      ref={gatilhoRef}
      type="button"
      className="form-botao"
      onClick={() => {
        setFalhou(null)
        setConfirmando(modo)
        setFoco('cancelar')
      }}
    >
      <Icon name="excluir" size={18} />
      {rotulo}
    </button>
  )
  const retirar = confirmando === 'retirar' ? confirmacao(`${ROTULO_RETIRAR}?`, null, () => excluir(true), 'Retirar') : gatilho('retirar', ROTULO_RETIRAR)

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
        <>
          <div className="veio-de-voce-excluido">
            <button ref={restaurarRef} type="button" className="form-botao" aria-describedby={statusId} onClick={restaurar}>
              <Icon name="desfazer" size={18} />
              Restaurar
            </button>
            {podeRetirar && confirmando !== 'retirar' && retirar}
          </div>
          {/* N-3: a confirmação abre embaixo de «Restaurar», não ao lado */}
          {podeRetirar && confirmando === 'retirar' && retirar}
        </>
      ) : podeRetirar ? (
        <>
          <p className="veio-de-voce-texto">{faltaTexto}</p>
          {retirar}
        </>
      ) : origens.length === 0 && depoisDeRestaurar ? (
        // N-1: só depois de restaurar a que só tinha a marca, com algo por enviar: pede para sincronizar
        <p ref={textoRef} tabIndex={-1} className="veio-de-voce-texto">
          {faltam === 1 ? 'Falta' : 'Faltam'} neste aparelho {nDe(faltam)} que {faltam === 1 ? 'leva' : 'levam'} a esta entrada. Sincronize para{' '}
          {faltam === 1 ? `vê-${g.lo}` : `vê-${g.los}`}; enquanto {faltam === 1 ? `${g.ele} existir` : `${g.um} existir`}, {t.este} continua nos livros.
        </p>
      ) : faltam > 0 ? (
        <p className="veio-de-voce-texto">
          {g.publicado} a partir {de} e de mais {nDe(faltam)} {ainda} a este aparelho. Sincronize para ver {g.todos}; enquanto {g.um} existir, {t.este} continua nos livros.
        </p>
      ) : (
        <>
          <p className="veio-de-voce-texto">
            {g.publicado} a partir {de}.{' '}
            {jaExcluidas.length > 0
              ? `Você já excluiu ${quais(jaExcluidas)}; se excluir ${variasVivas ? `${g.os} ${g.outros} ${vivas.length}` : lista(nomesVivos)}, ${g.ele} sai dos livros na próxima importação.`
              : `Se você ${varias ? g.os : g.o} excluir, ${g.ele} sai dos livros na próxima importação.`}
          </p>
          {confirmando === 'excluir'
            ? confirmacao(
                variasVivas ? `${rotuloExcluir}?` : `${rotuloExcluir} ${lista(nomesVivos)}?`,
                variasVivas && (
                  <>
                    {g.Os} {nDe(vivas.length)} ({lista(nomesVivos)}) são {g.juntos}: enquanto {g.um} existir, {t.este} continua nos livros.{' '}
                  </>
                ),
                () => excluir(),
                'Excluir',
              )
            : gatilho('excluir', rotuloExcluir)}
        </>
      )}
      {falhou && <p role="alert" className="veio-de-voce-falha">{falhou}</p>}
    </section>
  )
}
