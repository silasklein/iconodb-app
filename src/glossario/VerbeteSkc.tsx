import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { caminhoDaBusca } from '../busca/url'
import { NotasDoAlvo } from '../notas/NotasDoAlvo'
import { CabecalhoDoDetalhe, Linha, MolduraDoDetalhe, NaoEncontrado } from '../telas/detalhe'
import { Contagem } from '../ui/Contagem'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { AvisoDeCopia, useCopiar } from '../ui/useCopiar'
import { estadoAtual } from '../usuario/estado'
import { AvisoDeDuplicado } from './AvisoDeDuplicado'
import { useDuplicadosDoGlossario, useHipotesesDoVerbete, useVerbeteSkc, usosDoVerbete } from './doUsuario'
import { EditorDaForma } from './EditorDaForma'
import { LinhasDeHipoteseSkc } from './LinhasDeHipoteseSkc'
import { ROTULO_DO_STATUS } from './modelo'
import { excluirVerbete, restaurarVerbete } from './operacoes'
import '../telas/Lista.css'
import '../imagens-usuario/MarcaSkc.css'
import './Glossario.css'

interface Props {
  id: string
  pagina: boolean
  voltarPara: string
  /** Como o Verbete do pacote (a página não muda entre celular e computador: não há grade de objetos). */
  computador?: boolean
}

/** O que a exclusão deixa para trás: quantas hipóteses e notas (ou textos com link) usam o termo, e que seguem mostrando o nome dele. */
function textoDosUsos(hipoteses: number, usos: number, nome: string): string {
  const outros = Math.max(0, usos - hipoteses)
  const partes = [hipoteses > 0 ? `${hipoteses} ${hipoteses === 1 ? 'hipótese' : 'hipóteses'}` : null, outros > 0 ? `${outros} ${outros === 1 ? 'nota ou texto com link' : 'notas ou textos com link'}` : null].filter(Boolean)
  return partes.length === 0 ? 'Nenhuma hipótese nem nota usa este termo.' : `Este termo é usado em ${partes.join(' e ')}, que continuam mostrando o nome «${nome}».`
}

const dataDoHlc = (hlc: string) => {
  const ms = Number(hlc.slice(0, 13))
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toLocaleDateString('pt-BR') : null
}

/**
 * A página de um verbete do usuário (decisão 41; `GL-<aparelho>-<n>`), no lugar do Verbete do pacote: a forma, a marca
 * SKC, o estado ("a revisar" ou "aprovado"), quando foi criado e as hipóteses SKC que o usam. As seções que só os
 * verbetes dos livros têm (alemão, inglês, Iconclass, SSSL, definição, objetos com miniatura) não aparecem: não ficam
 * vazias. Tarefa 11: a forma se edita no lugar, como a de um verbete do livro (EditorDaForma, com a forma criada como
 * proposta original); "Excluir o verbete" (reversível, com a confirmação nomeada); e o aviso de "possível duplicado" quando
 * dois aparelhos criaram o mesmo termo sem internet.
 */
export function VerbeteSkc({ id, pagina, voltarPara }: Props) {
  const v = useVerbeteSkc(id)
  const hipoteses = useHipotesesDoVerbete(id)
  const nomeRef = useRef<HTMLHeadingElement>(null)
  const { aviso, copiar } = useCopiar(nomeRef)
  const [falhou, setFalhou] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const duplicados = useDuplicadosDoGlossario().get(id) ?? []
  const navegar = useNavigate()
  // O foco (revisão 1, M4): vai a "Cancelar" quando a confirmação abre e volta ao botão quando ela fecha sem excluir.
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
  const voltar = { href: `#${voltarPara}`, rotulo: 'Voltar ao glossário' }

  if (!v) return <NaoEncontrado pagina={pagina} voltar={voltar} titulo="Verbete não encontrado" destino="/glossario" rotuloDoDestino="Ver o glossário" />

  const nome = v.emUso
  const acoes = (
    <>
      <IconButton icon="buscar" label="Buscar objetos com este termo" href={`#${caminhoDaBusca(nome, { escopo: 'termo' })}`} />
      <IconButton icon="copiar" label="Copiar referência" onClick={() => void copiar(`${nome} (${v.id})`)} />
    </>
  )
  const criadoEm = dataDoHlc(v.criadoEm)

  return (
    <MolduraDoDetalhe pagina={pagina} voltar={voltar} acoes={acoes}>
      <div className="verbete-skc">
        <CabecalhoDoDetalhe pagina={pagina} etiqueta={`Verbete do SKC · ${ROTULO_DO_STATUS[v.status]}`} titulo={nome} codigo={v.id} acoes={acoes} tituloRef={nomeRef} />
        <AvisoDeCopia aviso={aviso} />

        {v.excluido && (
          <div className="detalhe-aviso" role="status">
            <p>
              Este verbete foi excluído.{' '}
              <button
                type="button"
                className="hit verbete-skc-restaurar"
                onClick={() => {
                  setFalhou(false)
                  restaurarVerbete(v.id).catch(() => setFalhou(true))
                }}
              >
                Restaurar o verbete
              </button>
            </p>
            {falhou && <p role="alert">Não foi possível restaurar; tente de novo.</p>}
          </div>
        )}

        <section className="detalhe-bloco" aria-label="Forma em português">
          <EditorDaForma key={id} id={id} original={v.forma} emUso={nome} status={v.status} aprovacaoDesatualizada={v.aprovacaoDesatualizada} statusDoPacote="proposed" doPacote={false} />
          <AvisoDeDuplicado parecidos={duplicados} doUsuario />
          <dl className="detalhe-dl detalhe-dl-depois-do-editor">
            <Linha rotulo="Fonte">
              <span className="marca-skc">SKC</span> sua, criada numa hipótese (não publicada)
            </Linha>
            <Linha rotulo="Criado em" vazio={criadoEm === null}>
              {criadoEm}
            </Linha>
          </dl>
        </section>

        <section className="detalhe-secao" aria-label="Hipóteses com este termo">
          <div className="detalhe-secao-topo">
            <h2>Hipóteses</h2>
            <Contagem n={hipoteses.length} um="hipótese" varios="hipóteses" className="codigo" />
          </div>
          {hipoteses.length === 0 && <p className="detalhe-vazio">Nenhuma hipótese com este termo.</p>}
          <LinhasDeHipoteseSkc hipoteses={hipoteses} />
        </section>

        {!v.excluido && (
          <div className="verbete-skc-excluir">
            {excluindo ? (
              <div role="group" aria-label={`Excluir o verbete «${nome}»?`} className="verbete-skc-confirmar">
                <p>{textoDosUsos(hipoteses.length, usosDoVerbete(estadoAtual(), id), nome)} Dá para restaurar depois.</p>
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
                      // Excluído, o verbete sai da lista: vai para ela, onde o aviso oferece "Restaurar" (revisão 1, M4).
                      excluirVerbete(v.id).then(
                        () => navegar(voltarPara, { state: { verbeteExcluido: { id: v.id, nome } } }),
                        () => setFalhou(true),
                      )
                    }}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            ) : (
              <button ref={gatilhoRef} type="button" className="form-botao" onClick={() => setExcluindo(true)}>
                <Icon name="excluir" size={18} />
                Excluir o verbete
              </button>
            )}
          </div>
        )}

        <NotasDoAlvo tipo="verbete" ref_={v.id} variante="secao" />
      </div>
    </MolduraDoDetalhe>
  )
}
