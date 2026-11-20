/**
 * Tarefa 6 (revisão da Tarefa 25, 8): as peças comuns da página do § e da leitura, no que a revisão pediu de acessibilidade e
 * de tokens. O resto delas é coberto por Paragrafo.test.tsx e Leitura.test.tsx.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import pecasCss from './pecas.css?raw'
import { AbasDasLinguas, Trilho, type Lingua } from './pecas'

describe('as peças do § e da leitura', () => {
  it('o trilho tem no nome acessível o texto que mostra (WCAG 2.5.3): «Abrir o Alemão · TESTEG 2021»', () => {
    render(<Trilho lingua="de" fonte="TESTEG 2021" linhas={2} aoAbrir={() => undefined} />)
    expect(screen.getByRole('button', { name: 'Abrir o Alemão · TESTEG 2021' })).toBeInTheDocument()
  })

  it('as abas: Home vai à primeira, End à última, com o foco', async () => {
    function Abas() {
      const [atual, setAtual] = useState<Lingua>('de')
      return <AbasDasLinguas linguas={['pt', 'de', 'en']} atual={atual} aoEscolher={setAtual} id="t" />
    }
    render(<Abas />)
    screen.getByRole('tab', { name: 'DE' }).focus()
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'EN' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'EN' })).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: 'PT' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'PT' })).toHaveFocus()
  })

  it('o CSS das peças não tem cor literal: só os tokens', () => {
    const semComentarios = pecasCss.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(semComentarios.match(/#[0-9a-f]{3,8}\b/gi) ?? []).toEqual([])
  })
})
