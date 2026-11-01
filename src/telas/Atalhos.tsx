import { Fragment } from 'react'
import { CONTEXTOS, ROTULO_DO_CONTEXTO, declaracoesDoContexto, rotuloDaTecla, type Declaracao } from '../app/atalhos'
import { useAtalhos } from '../app/useAtalhos'
import { IconButton } from '../ui/IconButton'
import { TopoDoCelular } from '../ui/TopoDoCelular'
import { useBreakpoint } from '../ui/useBreakpoint'
import { useIrParaTras } from '../ui/useVoltar'
import './Estado.css'
import './Atalhos.css'

/** Uma tecla (ou "g" e depois a letra) em `<kbd>`: letras em maiúscula, setas e Esc como símbolos. */
function Tecla({ tecla }: { tecla: string }) {
  const partes = tecla.split(' ')
  return (
    <span className="atalho-tecla">
      {partes.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="atalho-depois"> depois </span>}
          <kbd>{rotuloDaTecla(p)}</kbd>
        </Fragment>
      ))}
    </span>
  )
}

function Teclas({ d }: { d: Declaracao }) {
  const mostradas = d.mostrar ?? d.teclas
  return (
    <span className="atalho-teclas">
      {mostradas.map((t, i) => (
        <Fragment key={t}>
          {i > 0 && !d.juntas && <span className="atalho-ou"> ou </span>}
          <Tecla tecla={t} />
        </Fragment>
      ))}
    </span>
  )
}

/** O que cada marca da tela quer dizer (sublinhados, imagem invertida, siglas). */
function Convencoes() {
  return (
    <section className="atalhos-secao" aria-labelledby="atalhos-convencoes">
      <h2 id="atalhos-convencoes">Convenções</h2>
      <dl className="convencoes">
        <div>
          <dt>
            <span className="amostra amostra-termo">Sublinhado fino e contínuo</span>
          </dt>
          <dd>Um termo do texto que tem verbete no Glossário; toque ou clique para abrir o verbete.</dd>
        </div>
        <div>
          <dt>
            <span className="amostra amostra-ancora">Sublinhado pontilhado</span>
          </dt>
          <dd>Uma hipótese ancorada naquele trecho do texto; toque ou clique para abrir a hipótese.</dd>
        </div>
        <div>
          <dt>
            <span className="amostra amostra-termo">Citações e números</span>
          </dt>
          <dd>As citações de obras e os números de outros objetos, quando levam à Bibliografia ou ao objeto, têm o mesmo sublinhado fino e contínuo dos termos.</dd>
        </div>
        <div>
          <dt>Imagem invertida</dt>
          <dd>Os desenhos de traço aparecem invertidos, claros sobre o fundo preto. Toque ou clique na imagem para ver o original; toque de novo para voltar.</dd>
        </div>
        <div>
          <dt>Número do objeto</dt>
          <dd>
            O número principal é o do banco (por exemplo <span className="codigo">CA00001</span>). A referência do livro, como <span className="codigo">IPIAO I, 60</span>, aparece só como origem.
          </dd>
        </div>
        <div>
          <dt>Rótulos das leituras</dt>
          <dd>
            O rótulo de cada leitura diz de onde ela vem. <span className="codigo">IPIAO</span>: Schroer e Keel, <i lang="de">Die Ikonographie Palästinas/Israels und der Alte Orient</i>. <span className="codigo">GGG</span>: Keel e Uehlinger,{' '}
            <i lang="de">Göttinnen, Götter und Gottessymbole</i>. <span className="codigo">SKC</span>: as suas próprias notas e leituras (as iniciais de quem usa o app).
          </dd>
        </div>
      </dl>
    </section>
  )
}

/**
 * Atalhos e convenções (`?`, ou "Atalhos e convenções" no Menu): a lista dos atalhos de teclado por
 * contexto, gerada do catálogo declarado em atalhos.ts (a mesma fonte do registro), e o que significam
 * as marcas da tela. No celular é uma página inteira com Voltar; no computador, uma página centrada
 * com Fechar. Esc volta à tela de antes.
 */
export function Atalhos() {
  const computador = useBreakpoint() === 'computador'
  const voltar = useIrParaTras('#/')
  useAtalhos({ Escape: voltar }, 'global')
  return (
    <div className="pagina-consulta">
      <TopoDoCelular voltar={{ href: '#/' }} busca={false} />
      <main className="pagina-consulta-corpo atalhos-corpo">
        <header className="atalhos-cabeca">
          <h1>Atalhos e convenções</h1>
          {computador && <IconButton icon="fechar" label="Fechar a lista de atalhos" shortcut="Escape" shortcutLabel="Esc" tipPosition="start" onClick={voltar} />}
        </header>
        <p className="pagina-consulta-apoio">
          As teclas não valem dentro de campos de texto, nem com Ctrl, ⌘ ou Alt (essas ficam com o navegador).
        </p>
        {CONTEXTOS.map((c) => (
          <section key={c} className="atalhos-secao" aria-labelledby={`atalhos-${c}`}>
            <h2 id={`atalhos-${c}`}>{ROTULO_DO_CONTEXTO[c]}</h2>
            <ul className="atalhos-lista">
              {declaracoesDoContexto(c).map((d) => (
                <li key={d.teclas.join('|')}>
                  <Teclas d={d} />
                  <span className="atalho-acao">{d.descricao}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <Convencoes />
      </main>
    </div>
  )
}
