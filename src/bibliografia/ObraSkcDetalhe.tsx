import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useObjetosSkc } from '../colecoes/objetosSkc'
import { useObjetosDaObraComLigados } from '../revisao/objetosLigados'
import { NotasDoAlvo } from '../notas/NotasDoAlvo'
import { CabecalhoDoDetalhe, MolduraDoDetalhe, NaoEncontrado, SecaoDeObjetos, useVoltarDoDetalhe } from '../telas/detalhe'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { AvisoDeCopia, useCopiar } from '../ui/useCopiar'
import { useLido } from '../usuario/useLido'
import { useObjetosSkcPorObra, useObraSkc, useObrasDaBibliografia } from './doUsuario'
import { chicagoDaObra, parecidas } from './formulario'
import { lerTroca } from './modelo'
import { excluirObra, restaurarObra, usosDaObra } from './operacoes'
import { lerRascunhoDaObra } from './rascunho'
import { textoDaVolta } from './textos'
import { ReferenciaChicago } from './ReferenciaChicago'
import '../glossario/Glossario.css'
import '../imagens-usuario/MarcaSkc.css'
import '../objetos-skc/Formulario.css'
import './NovaObra.css'

interface Props {
  id: string
  pagina: boolean
  voltarPara: string
  computador: boolean
}

/**
 * A página de uma obra do usuário (`BIB-<aparelho>-<n>`, ainda não publicada), no lugar da obra do pacote: a referência em
 * Chicago (a mesma da prévia), a marca SKC, a citação curta, os objetos SKC que a citam (e os dos livros cujas citações você
 * ligou a ela no app; revisão final, M3), «Editar a obra» e «Excluir a obra» (reversível: «Restaurar» aqui e em «Excluídos»). Uma «quase igual» a outra obra (a mesma citação curta, ano e
 * título; não entra nos livros até a pessoa decidir) tem o aviso, com o caminho para decidir.
 */
export function ObraSkcDetalhe({ id, pagina, voltarPara, computador }: Props) {
  const o = useObraSkc(id)
  const chicagoRef = useRef<HTMLParagraphElement>(null)
  const { aviso, copiar } = useCopiar(chicagoRef)
  const [excluindo, setExcluindo] = useState(false)
  const [falhou, setFalhou] = useState(false)
  const gatilhoRef = useRef<HTMLButtonElement>(null)
  const cancelarRef = useRef<HTMLButtonElement>(null)
  const jaAbriu = useRef(false)
  useEffect(() => {
    if (excluindo) {
      jaAbriu.current = true
      cancelarRef.current?.focus()
    } else if (jaAbriu.current) {
      jaAbriu.current = false
      gatilhoRef.current?.focus()
    }
  }, [excluindo])
  const idsDosObjetos = useObjetosSkcPorObra().get(id)
  const todosOsSkc = useObjetosSkc()
  const objetos = useMemo(() => todosOsSkc.filter((x) => idsDosObjetos?.includes(x.itemId)), [todosOsSkc, idsDosObjetos])
  // M3 (revisão final): os objetos dos livros cujas citações você ligou a ela no app (a Bibliografia os conta também)
  const dosLivros = useObjetosDaObraComLigados(id)
  const carga = useObrasDaBibliografia()
  const quase = useMemo(() => {
    if (!o || carga.fase !== 'ok') return []
    return parecidas({ csl: o.csl, curta: o.curta }, carga.dados.filter((x) => x.id !== id)).filter((p) => p.motivo === 'quase')
  }, [o, carga, id])
  // Aberta da Revisão (a obra ligada a uma citação; Tarefa 14), «‹ Revisão» volta a ela (decisão 85)
  const { voltar, deOnde } = useVoltarDoDetalhe({ href: `#${voltarPara}`, rotulo: 'Voltar à bibliografia' })
  // As ligações que voltam a «não resolvida» ao excluir: lidas do estado, atualizadas a cada sincronização (N5).
  const ligacoes = useLido(['citacao', 'objeto'], `usos-da-obra:${id}`, (e) => usosDaObra(e, id).ligacoes.length)
  const troca = useLido(['obra'], `troca-da-obra:${id}`, (e) => {
    const r = e.registro('obra', id)
    return r ? lerTroca(r) : null
  })
  // Uma edição não salva desta obra (o rascunho de «Editar a obra», fix round 1): o caminho para retomá-la.
  const [comRascunho] = useState(() => lerRascunhoDaObra(id) !== null)

  if (!o) return <NaoEncontrado pagina={pagina} voltar={voltar} titulo="Obra não encontrada" destino="/bibliografia" rotuloDoDestino="Ver a bibliografia" />

  const nome = o.curta || o.csl.title
  const texto = chicagoDaObra(o.csl)?.texto ?? o.csl.title
  const acoes = <IconButton icon="copiar" label="Copiar referência completa" onClick={() => void copiar(texto)} />

  return (
    <MolduraDoDetalhe pagina={pagina} voltar={voltar} deOnde={deOnde} acoes={acoes} origem={`Obra: ${nome}`}>
      <div className="verbete-skc obra-skc">
        <CabecalhoDoDetalhe pagina={pagina} etiqueta="Obra do SKC" titulo={nome} codigo={o.id} acoes={acoes} />

        {o.excluido && (
          <div className="detalhe-aviso" role="status">
            <p>
              {troca ? `Esta obra foi trocada por «${troca.rotulo}» (É esta). ${textoDaVolta(troca)} ` : 'Esta obra foi excluída. '}
              <button
                type="button"
                className="hit verbete-skc-restaurar"
                onClick={() => {
                  setFalhou(false)
                  restaurarObra(o.id).catch(() => setFalhou(true))
                }}
              >
                Restaurar a obra
              </button>
            </p>
            {falhou && <p role="alert">Não foi possível restaurar; tente de novo.</p>}
          </div>
        )}

        <p className="obra-chicago" ref={chicagoRef}>
          <ReferenciaChicago csl={o.csl} semChicago={o.csl.title} />
        </p>
        <AvisoDeCopia aviso={aviso} />
        <p className="obra-citada">
          <span className="marca-skc">SKC</span> sua, ainda não publicada{o.curta ? ` · citação curta «${o.curta}»` : ''}
        </p>
        {!o.excluido && comRascunho && (
          <p className="obra-citada" role="status">
            Há mudanças desta obra ainda não salvas neste aparelho. <Link to={`/obra/${encodeURIComponent(o.id)}/editar`}>Continuar a edição</Link>
          </p>
        )}

        {!o.excluido && quase.length > 0 && (
          <aside className="nova-obra-quase obra-skc-quase" aria-label="Obra quase igual">
            <h3>
              <Icon name="aviso" size={16} />
              Quase igual a {quase.map((p) => `«${p.obra.curta ?? p.obra.titulo ?? p.obra.id}»`).join(', ')}
            </h3>
            <p>
              A mesma citação curta, o mesmo ano e o mesmo título: ela não entra nos livros até você decidir. Em «Editar a obra», use «É esta» se é a mesma, ou
              distinga a citação curta (por exemplo, «1993b»).
            </p>
          </aside>
        )}

        <SecaoDeObjetos rotulo="Objetos SKC que citam esta obra" titulo="Objetos que a citam" objetos={objetos} computador={computador} />
        {dosLivros && dosLivros.length > 0 && (
          <SecaoDeObjetos rotulo="Objetos dos livros que citam esta obra" titulo="Objetos dos livros ligados por você" objetos={dosLivros} computador={computador} />
        )}

        {!o.excluido && (
          <div className="verbete-skc-excluir obra-skc-acoes">
            {excluindo ? (
              <div role="group" aria-label={`Excluir a obra «${nome}»?`} className="verbete-skc-confirmar">
                <p>
                  {ligacoes > 0
                    ? `${ligacoes === 1 ? 'A citação ligada a ela volta' : `As ${ligacoes} ligações de citação voltam`} a «não resolvida». `
                    : ''}
                  Dá para restaurar depois.
                </p>
                <div className="verbete-skc-confirmar-botoes">
                  <button ref={cancelarRef} type="button" className="form-botao" onClick={() => setExcluindo(false)}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="form-botao form-botao-forte"
                    onClick={() => {
                      setFalhou(false)
                      jaAbriu.current = false
                      setExcluindo(false)
                      excluirObra(o.id).catch(() => setFalhou(true))
                    }}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            ) : (
              <div className="obra-skc-botoes">
                <Link className="form-botao" to={`/obra/${encodeURIComponent(o.id)}/editar`}>
                  <Icon name="escrever" size={18} />
                  Editar a obra
                </Link>
                <button ref={gatilhoRef} type="button" className="form-botao" onClick={() => setExcluindo(true)}>
                  <Icon name="excluir" size={18} />
                  Excluir a obra
                </button>
              </div>
            )}
            {falhou && !o.excluido && <p role="alert">Não foi possível excluir; tente de novo.</p>}
          </div>
        )}

        <NotasDoAlvo tipo="obra" ref_={o.id} variante="secao" />
      </div>
    </MolduraDoDetalhe>
  )
}
