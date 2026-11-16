import { render } from '@testing-library/react'
import { htmlComItalico } from '../item/Secoes'
import { chicagoHtml } from './chicago'

/** `chicagoHtml` não escapa o texto (como o Python): a tela o desenha só com `htmlComItalico`, sem innerHTML. */
describe('chicagoHtml na tela', () => {
  it('um <script> ou <img> no título não vira elemento; só o itálico sai', () => {
    const html = chicagoHtml({
      type: 'book', title: 'Selos <script>alert(1)</script> <img src=x onerror=alert(2)>', publisher: 'Editora A&B',
      author: [{ family: 'Amostra', given: 'Ana' }], issued: { 'date-parts': [[2000]] },
    })
    expect(html).toContain('<script>') // o texto cru, igual ao do processamento
    const { container } = render(<p>{htmlComItalico(html)}</p>)
    expect(container.querySelector('script, img')).toBeNull()
    expect([...container.querySelectorAll('*')].map((e) => e.tagName)).toEqual(['P', 'I'])
    expect(container.querySelector('i')?.textContent).toBe('Selos alert(1) ')
    expect(container.textContent).toContain('Editora A&B')
  })
})
