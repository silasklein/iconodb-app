import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './fixtures'
import { escreverNota } from './notasNaTela'

/**
 * A camada do usuário na busca, no navegador de verdade (worker, sqlite-wasm, IndexedDB): a nota é escrita pela tela,
 * como a pessoa faz (e excluída do mesmo jeito); os objetos, coleções e sítios que ainda não têm tela de criação vêm
 * de eventos de outro aparelho já gravados no IndexedDB. Todos entram no índice em memória e aparecem com o pacote.
 * Com SHOTS_DIR definido, guarda capturas da tela nessa pasta.
 */
const AP = 'e2eaaaaa'
const TEXTO_DA_NOTA = 'Anotação solta sobre o sítio Maḥteṣ.'
let seq = 0
const evento = (tipo: string, reg: string, campos: Record<string, unknown>) => {
  seq++
  return {
    id: `${AP}-${seq}-0`,
    aparelho: AP,
    seq,
    n: 0,
    enviado: 1,
    evento: { v: 1, id: `${AP}-${seq}-0`, hlc: `${String(1_790_000_000_000 + seq * 1000)}-0000-${AP}`, aparelho: AP, tipo, reg, op: 'criar', campos },
  }
}

test('notas, objetos SKC e coleções do usuário aparecem na busca, com a marca SKC', async ({ page, dropbox }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Entrar com o Dropbox' }).click()
  await page.getByRole('button', { name: 'Abrir o app' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Iconografia do Levante antigo' })).toBeVisible()
  expect(dropbox.autorizacoes).toBe(1)

  // A nota, pela tela: num verbete (o que não é um objeto aparece no grupo "Na sua camada").
  await page.goto('#/verbete/GL-900001')
  await expect(page.getByRole('region', { name: 'Notas SKC' })).toBeVisible()
  await escreverNota(page, TEXTO_DA_NOTA)
  await expect(page.getByRole('region', { name: 'Notas SKC' }).getByText(TEXTO_DA_NOTA)).toBeVisible()

  const linhas = [
    evento('objeto', 'OB-e2eaaaaa-1', { numero: 'CA00005', titulo: 'Escaraveu.', obraRotulo: 'Autor 1999', figura: '3', leitura: 'Um íbex de Maḥteṣ.' }),
    evento('colecao', 'CO-e2eaaaaa-1', { nome: 'Maḥteṣ: minhas anotações', membros: ['CA00001'] }),
    evento('sitio', 'SI-e2eaaaaa-1', { nome: 'Tell Maḥteṣ Novo' }),
  ]
  await page.evaluate(
    (rows) =>
      new Promise<void>((ok, falha) => {
        const abrir = indexedDB.open('iconodb-usuario')
        abrir.onerror = () => falha(abrir.error)
        abrir.onsuccess = () => {
          const db = abrir.result
          const tx = db.transaction('eventos', 'readwrite')
          for (const r of rows) tx.objectStore('eventos').put(r)
          tx.oncomplete = () => {
            db.close()
            ok()
          }
          tx.onerror = () => falha(tx.error)
        }
      }),
    linhas,
  )
  await page.reload()

  await page.goto('#/busca?q=mahtes')
  const resultados = page.getByRole('region', { name: 'Resultados' })
  // objetos do pacote + o objeto SKC (leitura com "Maḥteṣ") + o objeto CA00001 também por estar na coleção
  await expect(resultados.getByRole('link', { name: /CA00002/ })).toBeVisible()
  const cartaoSkc = resultados.getByRole('link', { name: /CA00005/ })
  await expect(cartaoSkc).toContainText('SKC')
  const grupo = page.getByRole('region', { name: 'Na sua camada (SKC)' })
  const linhaDaNota = grupo.getByRole('link', { name: TEXTO_DA_NOTA })
  await expect(linhaDaNota).toBeVisible()
  await expect(linhaDaNota).toHaveAttribute('href', /#\/nota\/NT-/)
  await expect(grupo.getByText('Maḥteṣ: minhas anotações')).toBeVisible()
  await expect(grupo.getByText('Tell Maḥteṣ Novo')).toBeVisible()
  await expect(page.getByText(/Nada encontrado/)).toHaveCount(0)
  const { scroll, janela } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, janela: window.innerWidth }))
  expect(scroll).toBeLessThanOrEqual(janela)

  const pasta = process.env.SHOTS_DIR
  if (pasta) {
    mkdirSync(pasta, { recursive: true })
    const largura = page.viewportSize()?.width ?? 0
    // Sem `fullPage`: no Chromium com emulação de celular, a captura da página inteira faz os passos seguintes se comportarem como se houvesse mouse (README, «Limites conhecidos»).
    await page.screenshot({ path: join(pasta, `busca-camada-usuario-${largura}.png`), fullPage: false })
    // só acertos do usuário (sem objetos)
    await page.goto('#/busca?q=anota%C3%A7%C3%A3o+solta')
    await expect(linhaDaNota).toBeVisible()
    await page.screenshot({ path: join(pasta, `busca-so-usuario-${largura}.png`), fullPage: false })
  }

  // Abrir a nota pelo resultado e excluí-la pela tela: some da busca (o índice acompanha o evento de exclusão).
  await linhaDaNota.click()
  await expect(page).toHaveURL(/#\/nota\/NT-/)
  // a nota abre para ler; o texto é o mesmo (sem links, sem código)
  await expect(page.getByRole('group', { name: /^Nota \[1\]/ })).toHaveText(TEXTO_DA_NOTA)
  await page.getByRole('button', { name: 'Excluir nota' }).click()
  await expect(page.getByText('Nota excluída.')).toBeVisible()

  await page.goto('#/busca?q=mahtes')
  await expect(page.getByRole('region', { name: 'Na sua camada (SKC)' }).getByText('Tell Maḥteṣ Novo')).toBeVisible()
  await expect(page.getByText(TEXTO_DA_NOTA)).toHaveCount(0)
})
