import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RegiaoNova } from './RegiaoNova'

const pontos: [number, number][] = [
  [0.1, 0.1],
  [0.4, 0.1],
  [0.3, 0.4],
]
const base = { objeto: 'CA00001', imagem: 'IM-TESTE-1', pontos, aoSalva: () => undefined, aoDescartar: () => undefined }
const elementos = [{ id: 'EL-TESTE-1', rotulo: 'cabeça de leão' }]

describe('T17-B-20: o elemento que vem da Revisão é escolhido mesmo se a lista de elementos chega depois', () => {
  it('a lista chega depois de o formulário abrir: «Ou é mais uma região de» fica com o elemento e o nome trava', () => {
    const { rerender } = render(<RegiaoNova {...base} elementos={[]} elementoInicial="EL-TESTE-1" />)
    expect(screen.queryByLabelText('Ou é mais uma região de')).toBeNull()
    rerender(<RegiaoNova {...base} elementos={elementos} elementoInicial="EL-TESTE-1" />)
    expect(screen.getByLabelText('Ou é mais uma região de')).toHaveValue('EL-TESTE-1')
    expect(screen.getByLabelText('Nomear o elemento da região nova')).toBeDisabled()
  })

  it('quem já escolheu «nenhum (elemento novo)» à mão não é desfeito por uma lista que chega de novo', async () => {
    const { rerender } = render(<RegiaoNova {...base} elementos={elementos} elementoInicial="EL-TESTE-1" />)
    await userEvent.selectOptions(screen.getByLabelText('Ou é mais uma região de'), '')
    rerender(<RegiaoNova {...base} elementos={[...elementos]} elementoInicial="EL-TESTE-1" />)
    expect(screen.getByLabelText('Ou é mais uma região de')).toHaveValue('')
  })
})
