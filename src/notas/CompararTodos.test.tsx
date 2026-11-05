/**
 * "Comparar todos" na folha de um intervalo citado (decisão 40; decisão 44, 3/11): TROCA o conteúdo da bandeja pelos objetos
 * citados (até 4, os 4 primeiros; os que ficarem de fora são ditos pelo número), num só evento, fecha a folha e abre Comparar
 * com a mensagem e o Desfazer. Sobre o pacote sintético.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { numerosDosObjetos } from '../banco/consultas'
import { lerBandeja, REG_DA_BANDEJA } from '../comparar/modelo'
import { acrescentarVariasABandeja, esvaziarBandeja } from '../comparar/operacoes'
import { todosEventos } from '../usuario/armazem'
import { definirFonteDosNumerosDoPacote, recarregarNumerosDoPacote } from '../objetos-skc/pacote'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { estadoAtual, registrar } from '../usuario/estado'
import { esquecerAlvos } from './alvos'
import { esquecerCitacoes } from './fontesCitadas'
import { TextoDaNota } from './TextoDaNota'

function Destino() {
  const { pathname, state } = useLocation()
  const s = state as { aviso?: string; desfazer?: unknown } | null
  return <output data-testid="destino">{JSON.stringify({ pathname, aviso: s?.aviso ?? null, desfazer: s?.desfazer ?? null })}</output>
}
const destino = () => JSON.parse(screen.getByTestId('destino').textContent!) as { pathname: string; aviso: string | null; desfazer: { previa: { ref: string; ordem: number }[]; entraram: string[]; hlc: string } | null }
const bandeja = () => lerBandeja(estadoAtual().registro('comparar', REG_DA_BANDEJA))

async function abrirFolha(texto: string, nome: string) {
  render(
    <MemoryRouter initialEntries={['/nota']}>
      <Routes>
        <Route path="/nota" element={<TextoDaNota texto={texto} />} />
        <Route path="*" element={null} />
      </Routes>
      <Destino />
    </MemoryRouter>,
  )
  fireEvent.click(await screen.findByRole('button', { name: nome }))
  return screen.findByRole('dialog')
}

beforeAll(async () => usarMotor(await bancoDeTeste()))
afterAll(() => usarMotor(null))
beforeEach(async () => {
  instalarMatchMedia(375)
  esquecerAlvos()
  esquecerCitacoes()
  definirFonteDosNumerosDoPacote(numerosDosObjetos)
  await recarregarNumerosDoPacote()
  await esvaziarBandeja()
  for (const r of estadoAtual().registros.get('objeto')?.values() ?? []) if (!r.excluido) await registrar('objeto', r.id, 'excluir')
})
afterEach(() => definirFonteDosNumerosDoPacote(null))

describe('Comparar todos (substitui a bandeja)', () => {
  const comparar = async (texto: string, nome: string) => {
    const folha = await abrirFolha(texto, nome)
    await userEvent.click(await within(folha).findByRole('button', { name: 'Comparar todos' }))
    await waitFor(() => expect(destino().pathname).toBe('/comparar'))
  }

  it('bandeja vazia: põe os objetos do intervalo, na ordem citada, fecha a folha e abre Comparar com a mensagem', async () => {
    await comparar('TESTE I: 1-3', 'TESTE I: 1–3, lista dos objetos')
    expect(bandeja().itens).toEqual(['CA00001', 'CA00002', 'CA00003'])
    expect(destino().aviso).toBe('3 objetos de TESTE I: 1–3 entraram na comparação.')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('bandeja cheia de outros objetos: ELES SAEM e os citados entram (nada se acrescenta), e o estado guarda a bandeja de antes para o Desfazer', async () => {
    await acrescentarVariasABandeja(['CA00002', 'CA00003', 'CA00004', 'BA00002'])
    const antes = bandeja().todos
    await comparar('TESTE I: 5-8', 'TESTE I: 5–8, lista dos objetos')
    expect(bandeja().itens).toEqual(['BA00001', 'BA00002'])
    expect(bandeja().excedentes).toEqual([])
    // BA00002 estava e fica: saíram 3, não 4
    expect(destino().aviso).toBe('2 objetos de TESTE I: 5–8 entraram na comparação, no lugar de 3 objetos que estavam.')
    // o hlc é o do evento da troca: o Desfazer só vale enquanto ele é o último do registro (T17-C-1)
    expect(destino().desfazer).toEqual({ previa: antes, entraram: ['BA00001', 'BA00002'], hlc: estadoAtual().registro('comparar', 'bandeja')!.alteradoEm })
  })

  it('o que já estava na bandeja e é citado fica, na ordem da citação', async () => {
    await acrescentarVariasABandeja(['CA00002', 'CA00004'])
    await comparar('TESTE I: 1-3', 'TESTE I: 1–3, lista dos objetos')
    expect(bandeja().itens).toEqual(['CA00001', 'CA00002', 'CA00003'])
    expect(bandeja().todos).toHaveLength(3)
  })

  it('mais de 4: entram os 4 primeiros e a mensagem diz quantos e quais ficaram de fora, sem prometer que entram depois', async () => {
    const folha = await abrirFolha('TESTE I: 1-8', 'TESTE I: 1–8, lista dos objetos')
    expect(await within(folha).findByText(/entram os 4 primeiros/)).toBeInTheDocument()
    await userEvent.click(within(folha).getByRole('button', { name: 'Comparar todos' }))
    await waitFor(() => expect(destino().pathname).toBe('/comparar'))
    expect(bandeja().itens).toEqual(['CA00001', 'CA00002', 'CA00003', 'CA00004'])
    expect(bandeja().todos).toHaveLength(4)
    expect(destino().aviso).toBe(
      '4 objetos de TESTE I: 1–8 entraram na comparação. 2 objetos ficaram de fora (a comparação leva até 4): BA00001, BA00002. Para comparar um deles, tire um objeto e use o + para escrever o número.',
    )
  })

  it('a troca é UM evento (nenhum estado intermediário: nem vazia, nem com os dois conjuntos)', async () => {
    await acrescentarVariasABandeja(['CA00002', 'CA00003', 'CA00004', 'BA00002'])
    const antes = (await todosEventos()).filter((e) => e.tipo === 'comparar').length
    await comparar('TESTE I: 1-3', 'TESTE I: 1–3, lista dos objetos')
    expect((await todosEventos()).filter((e) => e.tipo === 'comparar').length).toBe(antes + 1)
  })

  it('a mesma lista na mesma ordem não grava nada e a mensagem diz que já estava', async () => {
    await acrescentarVariasABandeja(['CA00001', 'CA00002', 'CA00003'])
    const antes = (await todosEventos()).filter((e) => e.tipo === 'comparar').length
    await comparar('TESTE I: 1-3', 'TESTE I: 1–3, lista dos objetos')
    expect((await todosEventos()).filter((e) => e.tipo === 'comparar').length).toBe(antes)
    expect(destino().aviso).toBe('Os 3 objetos de TESTE I: 1–3 já estavam na comparação, nesta ordem.')
    expect(destino().desfazer).toBeNull()
  })

  it('a folha diz, antes de apertar, que troca o que está na comparação', async () => {
    await acrescentarVariasABandeja(['CA00002'])
    const folha = await abrirFolha('TESTE I: 1-3', 'TESTE I: 1–3, lista dos objetos')
    expect(await within(folha).findByText(/Troca o que está na comparação por estes objetos/)).toBeInTheDocument()
  })

  it('os números que o pacote não tem ("?") ficam de fora sem aviso de erro; só os que existem entram', async () => {
    await comparar('TESTE I: 5-8', 'TESTE I: 5–8, lista dos objetos')
    expect(bandeja().itens).toEqual(['BA00001', 'BA00002'])
  })

  it('os objetos SKC citados entram pelo id (OB-…), não pelo número, que pode mudar', async () => {
    const ids = ['OB-citados1-1', 'OB-citados2-2']
    for (const id of ids) await registrar('objeto', id, 'criar', { origemTipo: 'achado', achado: 'x', periodo: 'CA', titulo: 'Selo' } as never)
    await comparar('SKC: 1-2', 'SKC: 1–2, lista dos objetos')
    expect(bandeja().itens).toEqual(ids)
  })

  it('sem nenhum objeto que exista, não há botão (e a folha diz o que acha)', async () => {
    const folha = await abrirFolha('TESTE I: 7-8', 'TESTE I: 7–8, lista dos objetos')
    await within(folha).findByText('0 de 2 encontrados')
    expect(within(folha).queryByRole('button', { name: 'Comparar todos' })).toBeNull()
  })
})

describe('a mensagem conta o que saiu da bandeja (N3)', () => {
  const comparar = async (texto: string, nome: string) => {
    const folha = await abrirFolha(texto, nome)
    await userEvent.click(await within(folha).findByRole('button', { name: 'Comparar todos' }))
    await waitFor(() => expect(destino().pathname).toBe('/comparar'))
  }

  it('bandeja vazia: ninguém saiu, a mensagem não fala de «no lugar de»', async () => {
    await comparar('TESTE I: 1-2', 'TESTE I: 1–2, lista dos objetos')
    expect(destino().aviso).toBe('2 objetos de TESTE I: 1–2 entraram na comparação.')
  })

  it('sobreposição parcial: quem ficou não conta como tirado', async () => {
    await acrescentarVariasABandeja(['CA00002', 'CA00004'])
    await comparar('TESTE I: 1-3', 'TESTE I: 1–3, lista dos objetos')
    expect(bandeja().itens).toEqual(['CA00001', 'CA00002', 'CA00003'])
    expect(destino().aviso).toBe('3 objetos de TESTE I: 1–3 entraram na comparação, no lugar de 1 objeto que estava.')
  })

  it('troca total: saem todos os que estavam', async () => {
    await acrescentarVariasABandeja(['CA00003', 'CA00004'])
    await comparar('TESTE I: 1-2', 'TESTE I: 1–2, lista dos objetos')
    expect(destino().aviso).toBe('2 objetos de TESTE I: 1–2 entraram na comparação, no lugar de 2 objetos que estavam.')
  })

  it('o citado já estava e só ele: nada saiu (a bandeja só ganha os outros)', async () => {
    await acrescentarVariasABandeja(['CA00002'])
    await comparar('TESTE I: 1-2', 'TESTE I: 1–2, lista dos objetos')
    expect(destino().aviso).toBe('2 objetos de TESTE I: 1–2 entraram na comparação.')
  })

  it('mais de 4 citados: conta o que saiu e nomeia os de fora', async () => {
    await acrescentarVariasABandeja(['CA00001', 'BA00001', 'BA00002'])
    await comparar('TESTE I: 1-8', 'TESTE I: 1–8, lista dos objetos')
    expect(bandeja().itens).toEqual(['CA00001', 'CA00002', 'CA00003', 'CA00004'])
    expect(destino().aviso).toBe(
      '4 objetos de TESTE I: 1–8 entraram na comparação, no lugar de 2 objetos que estavam. 2 objetos ficaram de fora (a comparação leva até 4): BA00001, BA00002. Para comparar um deles, tire um objeto e use o + para escrever o número.',
    )
  })
})

describe('«Dá para desfazer» na folha (item 6)', () => {
  it('bandeja vazia: nada a desfazer, a folha não promete', async () => {
    const folha = await abrirFolha('TESTE I: 1-3', 'TESTE I: 1–3, lista dos objetos')
    expect(await within(folha).findByText('Põe estes objetos na comparação.')).toBeInTheDocument()
    expect(folha.textContent).not.toMatch(/desfazer/i)
  })
  it('com objetos na bandeja: promete o Desfazer', async () => {
    await acrescentarVariasABandeja(['CA00004'])
    const folha = await abrirFolha('TESTE I: 1-3', 'TESTE I: 1–3, lista dos objetos')
    expect(await within(folha).findByText(/Dá para desfazer/)).toBeInTheDocument()
  })
})
