import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { trechosDoObjeto } from '../banco/consultas'
import { IconButton } from '../ui/IconButton'
import { useIrParaTras, useVoltar } from '../ui/useVoltar'
import { registrar } from '../usuario/estado'
import { descreverAlvo, rotaDoAlvo } from './alvos'
import { ancorasDe } from './ancora'
import { EditorDeNota } from './EditorDeNota'
import { rotuloDaNotaNova, rotuloDoCampo } from './formato'
import { ehTipoDeAlvo, type TipoDeAlvo } from './indiceDeNotas'
import { chaveDoAlvo } from './links'
import { LigacoesDaNota } from './LigacoesDaNota'
import { useAlvosDe } from './useAlvos'
import { useIndiceDeNotas } from './useIndiceDeNotas'
import './Notas.css'

interface Props {
  /** O id da nota, ou "nova" (o alvo vem no endereço: `?alvoTipo=…&alvo=…`). */
  id: string
  /** Celular: a tela da nota (escura, com o Fechar e voltar no topo). Computador: o painel ao lado da lista. */
  pagina: boolean
}

/** O título dos avisos: a tela do celular tem o seu h1; no computador a lista ao lado já tem o h1 de Minhas notas. */
function Titulo({ pagina, children }: { pagina: boolean; children: string }) {
  const Nivel = pagina ? 'h1' : 'h2'
  return <Nivel className="nota-aviso-titulo">{children}</Nivel>
}

interface Reservada {
  reg: string
  alvo: { tipo: TipoDeAlvo; ref: string }
  rotulo: string
}

/**
 * Uma nota aberta para escrever (Nota.dc.html no celular, o painel de PC-Notas.dc.html no computador): rótulo visível,
 * o lugar da nota, o campo e, abaixo, a que a nota se liga e onde aparece. As ações ficam numa barra no alto.
 * Uma nota nova (`/nota/nova`) vira `/nota/<id>` no instante em que o primeiro texto reserva o id, SEM recriar o campo.
 */
export function NotaPainel({ id, pagina }: Props) {
  const indice = useIndiceDeNotas()
  const [params] = useSearchParams()
  const navegar = useNavigate()
  const [reservada, setReservada] = useState<Reservada | null>(null)
  const [barra, setBarra] = useState<HTMLElement | null>(null)

  const nova = id === 'nova'
  const alvoNovo = (() => {
    const tipo = params.get('alvoTipo')
    const ref = params.get('alvo')
    return ehTipoDeAlvo(tipo) && ref && ref.trim() ? { tipo, ref: ref.trim() } : null
  })()
  const [rotuloNovo] = useState(() => (alvoNovo ? rotuloDaNotaNova(indice.quantasDoAlvo(alvoNovo.tipo, alvoNovo.ref) + 1) : ''))

  const continuando = !nova && reservada?.reg === id ? reservada : null
  // A nota deste endereço no índice, também a que acabou de ser criada aqui: é dela que se sabe se foi excluída.
  const registrada = nova ? null : (indice.porId.get(id) ?? null)
  const existente = continuando ? null : registrada

  const lugar = continuando?.alvo ?? (nova ? alvoNovo : existente?.alvoTipo && existente.alvo ? { tipo: existente.alvoTipo, ref: existente.alvo } : null)
  const resolvidos = useAlvosDe(lugar ? [lugar] : [])
  const rotaDoLugar = lugar ? ((resolvidos.get(chaveDoAlvo(lugar.tipo, lugar.ref))?.rota ?? rotaDoAlvo(lugar.tipo, lugar.ref)) as string | null) : null
  const destinoDoVoltar = rotaDoLugar ?? '/notas'
  const irParaTras = useIrParaTras(`#${destinoDoVoltar}`)
  const aoFechar = useVoltar(`#${destinoDoVoltar}`)
  // Computador: fechar é deixar a nota (a lista fica); celular: voltar de onde veio.
  const sair = () => (pagina ? irParaTras() : void navegar('/notas'))

  if (nova && !alvoNovo) {
    return (
      <div className="nota-aviso-tela" role="status">
        <Titulo pagina={pagina}>Esta nota não tem um lugar.</Titulo>
        <p>Abra um objeto, um verbete, uma obra, um sítio ou um grupo e toque em «Escrever nota».</p>
        <p>
          <Link to="/notas">Ver minhas notas</Link>
        </p>
      </div>
    )
  }
  if (!nova && !continuando && !registrada) {
    return (
      <div className="nota-aviso-tela" role="status">
        <Titulo pagina={pagina}>Nota não encontrada.</Titulo>
        <p>
          <Link to="/notas">Ver minhas notas</Link>
        </p>
      </div>
    )
  }
  if (registrada?.excluida) {
    return (
      <div className="nota-aviso-tela" role="status">
        <Titulo pagina={pagina}>Nota excluída.</Titulo>
        <p>
          <button type="button" className="nota-botao" onClick={() => void registrar('nota', registrada.id, 'restaurar')}>
            Restaurar nota
          </button>
        </p>
        <p>
          <Link to="/notas">Ver minhas notas</Link>
        </p>
      </div>
    )
  }

  const nota = registrada
  const rotulo = continuando?.rotulo ?? (nota ? rotuloDoCampo(nota) : rotuloNovo)
  const doEditor = continuando?.alvo ?? (nova ? alvoNovo! : undefined)
  const nomeDoLugar = lugar ? descreverAlvo(lugar.tipo, lugar.ref, resolvidos.get(chaveDoAlvo(lugar.tipo, lugar.ref))) : null

  return (
    <div className={`nota-painel${pagina ? ' nota-painel-pagina' : ''}`}>
      <div className="nota-barra">
        {pagina && <IconButton icon="fechar" label="Fechar e voltar" shortcut="Escape" shortcutLabel="Esc" href={`#${destinoDoVoltar}`} onClick={aoFechar} tipPosition="start" />}
        <div className="nota-barra-acoes" role="toolbar" aria-label="Ações da nota" ref={setBarra} />
      </div>
      <div className="nota-painel-corpo">
        {pagina && <h1 className="so-leitor">Nota</h1>}
        <EditorDeNota
          key={continuando || nova ? 'editor-novo' : `editor-${id}`}
          nota={nota}
          alvo={doEditor}
          ancorar={doEditor?.tipo === 'objeto' ? () => trechosDoObjeto(doEditor.ref).then(ancorasDe) : undefined}
          rotulo={rotulo}
          autoFoco={nova || pagina}
          iniciarLendo={!nova && !continuando}
          grande={pagina}
          acoesEm={barra}
          aoCriar={(reg) => {
            if (!nova || !alvoNovo) return
            setReservada({ reg, alvo: alvoNovo, rotulo })
            void navegar(`/nota/${encodeURIComponent(reg)}`, { replace: true })
          }}
          aoSalvar={pagina ? irParaTras : undefined}
          aoFechar={sair}
          abaixoDoRotulo={
            lugar && (
              <p className="nota-em">
                em{' '}
                {rotaDoLugar ? (
                  <Link className="nota-link" to={rotaDoLugar}>
                    {nomeDoLugar}
                  </Link>
                ) : (
                  nomeDoLugar
                )}
              </p>
            )
          }
        />
        {nota && <LigacoesDaNota nota={nota} />}
      </div>
    </div>
  )
}
