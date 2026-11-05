# IconoDB (app)

App do IconoDB (consulta do pacote, só leitura; e a sua camada SKC, que o app escreve em `usuario/` no Dropbox): uma base iconográfica pessoal e fechada. Mostra a literatura de referência em português, com as traduções à mão e busca rápida. É um PWA (Vite, React e TypeScript) que roda no navegador, instalado na Tela de Início do iPhone ou no Dock do Mac, e também no Chrome.

## O que este repositório contém, e o que não contém

Só código. **O conteúdo dos livros não está aqui**: nem textos, nem imagens, nem bancos de dados. O conteúdo fica no Dropbox do próprio usuário, na pasta do app, e o app o baixa depois do login.

Os testes usam um pacote sintético (`tests/fixtures/pacote/`), sem nada dos livros. Nenhum teste acessa a rede.

## Como rodar

Requer Node 22.18 ou mais novo (o `npm run icones` roda TypeScript direto no Node).

```sh
npm ci          # instala as dependências nas versões fixadas
npm run dev     # servidor de desenvolvimento
npm test        # testes (Vitest)
npm run build   # confere os tipos e gera dist/ (com o service worker)
npm run preview # serve dist/ localmente
npm run e2e     # testes de ponta a ponta (Playwright, Chromium), sobre o build e com o Dropbox simulado
npm run icones  # gera de novo os PNG de public/ a partir do logo (ver "Ícones")
```

`npm run e2e` constrói o app, serve `dist/` com `vite preview` e usa o Chromium já instalado (`PLAYWRIGHT_BROWSERS_PATH`); em uma máquina nova, rode antes `npx playwright install chromium`. O Dropbox é simulado com `page.route` (`e2e/dropboxSimulado.ts`: login, token com as três permissões, download servindo `tests/fixtures/pacote/`; com `usuarioReal`, a pasta `usuario/` como no Dropbox: listagem em páginas com `list_folder/continue`, um rev novo a cada escrita, o modo `update` só com o rev atual e o 401 `missing_scope` quando falta uma permissão); qualquer pedido a outro servidor externo, ou qualquer violação da Content-Security-Policy, derruba o teste. `e2e/dois-aparelhos.spec.ts` liga dois contextos do navegador (dois aparelhos, cada um com o seu IndexedDB) ao mesmo Dropbox simulado: o que um cria o outro vê (a foto também), os dois editam a mesma nota e a mesma coleção sem internet e convergem (a versão que perdeu fica no histórico), os dois criam um objeto CA sem internet e consolidam ao mesmo tempo sem número repetido, e a rede que cai no meio de um envio não perde nem duplica nada. **A e2e roda só localmente** (`npm run e2e`), não no GitHub Actions: rode-a antes de mandar para a `main`.

O app é publicado em `https://silasklein.github.io/iconodb-app/`. Esse endereço é **uma só configuração**, `VITE_ENDERECO` (padrão em `src/app/endereco.ts`): dele saem o `base` do Vite (`/iconodb-app/` no build; `/` no `npm run dev`, que serve em `http://localhost:5173/`), o `id`, o `start_url` e o `scope` do manifesto, o redirect do Dropbox em produção e a base da e2e. As rotas usam `HashRouter`, porque o GitHub Pages não reescreve caminhos.

O `index.html` publicado traz uma Content-Security-Policy (`scripts/csp.ts`, só no build): nada por padrão; scripts, workers, estilos e fontes do próprio app; o `.wasm` do sqlite (`'wasm-unsafe-eval'`); conexões só com o app e as APIs do Dropbox; imagens do app, `blob:` e `data:`.

## Instalar no iPhone e no Mac

O app é um PWA: depois de instalado, abre em tela cheia, guarda os dados no aparelho e funciona sem internet.

**iPhone (Safari)**

1. Abra `https://silasklein.github.io/iconodb-app/` no Safari.
2. Toque em **Compartilhar** e em **Adicionar à Tela de Início**; confirme o nome "IconoDB".
3. Feche o Safari e abra o IconoDB **pela Tela de Início**.
4. **Entre no Dropbox de dentro do app instalado**, não da aba do Safari. O app da Tela de Início guarda os dados separados do Safari: se o login for feito na aba, o app instalado não o enxerga. Se o Dropbox terminar o login no Safari em vez de voltar ao app, use **Entrar com código**: o Dropbox mostra um código, que se cola na tela do app.
5. **Mantenha o app aberto durante o primeiro download** (tela "Preparando este aparelho"). O iPhone suspende apps em segundo plano; se isso acontecer, abra o app de novo: o download continua de onde parou, sem baixar outra vez o que já foi conferido.

**Mac (Safari)**

1. Abra `https://silasklein.github.io/iconodb-app/` no Safari.
2. No menu, **Arquivo → Adicionar ao Dock**.
3. Abra o IconoDB pelo Dock e entre com o Dropbox (ou com **Entrar com código**).

No Chrome do Mac o app também funciona (menu **Instalar IconoDB**, no ícone da barra de endereço).

Depois da primeira sincronização o app abre direto no Início, mesmo em modo avião: a busca funciona e as imagens já vistas aparecem. Uma imagem que nunca foi aberta mostra "Imagem disponível quando houver internet".

**Versão nova do app:** aparece "Nova versão disponível". **Feche as outras abas e janelas do app antes de tocar em Recarregar**: a versão nova só assume quando nenhuma janela usa mais a antiga.

## Onde fica o pacote no Dropbox

O pacote (gerado com `app-export`, no repositório privado) vai na **raiz** da pasta do app, `Aplicativos/IconoDB-Silas/`, com estas duas pastas:

```text
Aplicativos/IconoDB-Silas/
  nucleo/     manifest.json, os bancos .sqlite e as tabelas de busca
  imagens/    miniaturas e imagens de tela, por publicação
```

A pasta `usuario/` é a do que você escreve no app (notas, coleções, objetos SKC). O próprio app a cria e a mantém; não ponha nada nela à mão:

```text
Aplicativos/IconoDB-Silas/
  usuario/
    diario/<aparelho>/000001.jsonl   as mudanças de cada aparelho, em segmentos que nunca são reescritos
    estado.json                      a consolidação (tudo fundido) e os números SKC confirmados (`numeros`: o número
                                     do sistema, o número SKC, "SKC: 12", e o número novo de um objeto
                                     cujo número um livro tomou), regravada uma vez por dia, a cada 20 segmentos novos
                                     e sempre que um objeto SKC tem número provisório (é ela que o confirma)
    aparelhos/<aparelho>.json        o nome de cada aparelho ("iPhone", "Mac")
    imagens/<IM-…>/                  as imagens que você acrescenta a um objeto: original.<ext> (como veio),
                                     tela.webp (1600 px) e miniatura.webp (320 px); .jpg no lugar de .webp
                                     quando o navegador não grava WebP
```

### O pacote e a camada do usuário (Tarefa 16)

O pipeline (repositório privado) lê a camada do usuário com `python -m iconodb user-import`: a pasta `usuario/` copiada do Dropbox, ou a **cópia de segurança** baixada em Exportar (`--copia iconodb-copia-….json`). Ele publica no pacote seguinte o que tem lugar nos livros: as formas aprovadas do glossário, as coordenadas corrigidas de sítios sem grade, os seus **verbetes** e **sítios** novos (com um id do livro) e reserva os números SKC confirmados para que nenhum livro novo os receba. O resto (notas, coleções, hipóteses, regiões…) continua só na camada do usuário.

Um verbete ou sítio seu publicado vira um do livro, e o pacote (schema **6**) traz a tabela `redirecionamento` (`GL-<aparelho>-<n>` → `GL-<dígitos>`, `SI-<aparelho>-<n>` → `<SIGLA>-<n>`). O app então mostra só o do livro: o seu some do Glossário, dos Sítios, das sugestões e da busca, e tudo o que apontava para ele (as suas hipóteses, os `[[…]]`, o sítio dos seus objetos, os endereços antigos `/verbete/GL-…` e `/sitio/SI-…`) leva ao do livro. Nada da camada é reescrito. Um pacote do schema 5 (sem a tabela) continua abrindo, sem redirecionamentos (`src/pacote/redirecionamentos.ts`); uma linha cujo destino o pacote não tem é ignorada.

O que você ligou ao seu verbete ou sítio continua com o do livro: na página do sítio do livro aparecem os objetos SKC e os objetos trocados para o `SI-…`, as notas feitas nele ou que o citam, e as outras grafias, a região e o país que você lhe deu (o pipeline não os guarda; o que você escrever no sítio do livro vence); na do verbete, as hipóteses e as notas do `GL-<aparelho>-<n>`. As contagens, as sugestões e a Revisão usam o nome e o id do livro, e as exportações (MEDIATION e regiões) levam o id do livro (no MEDIATION, `termoDoUsuario: false` e `publicadoDe`, o id do app). Um verbete ou sítio publicado que você exclui sai dos livros no pacote seguinte (decisão 47); então o app volta a mostrá-lo como seu, excluído e restaurável, e restaurar o publica de novo com o mesmo id. Para tirar dos livros um verbete ou sítio seu já publicado, use «Excluir o seu verbete» ou «Excluir o seu sítio» no bloco «Este verbete veio de você» («Este sítio veio de você») da página do livro (decisão 50; a coluna `criado` da tabela diz que ele veio de um registro seu): até a próxima importação a página mostra «Sai dos livros na próxima importação» e «Restaurar». Se mais de um registro seu gerou a mesma entrada, o botão os exclui juntos («Excluir os seus 2 verbetes»; decisão 51). Se um deles ainda não chegou a este aparelho, o bloco pede para sincronizar antes de excluir, porque a entrada só sai dos livros quando todos forem excluídos.

**Número SKC tomado por um livro novo** (decisão 48). Se um volume novo dá a um objeto do livro o número já confirmado de um objeto SKC, o livro fica com ele, o objeto SKC recebe o seguinte (o aviso diz qual era) e a sincronização seguinte o torna definitivo: a consolidação grava o número novo no `estado.json` (a chave `LIVRO:<id>` do mapa `numeros`, na mesma escrita condicional) e escreve no diário a testemunha nova (`numero`, com `numeroTomadoPeloLivro`). Todos os aparelhos chegam ao mesmo número, que não muda mais.

## Sincronização

Cada mudança fica gravada na hora no aparelho e sobe sozinha quando há internet: ao abrir o app, alguns segundos depois de cada mudança e quando a rede volta. O botão **Salvar e sincronizar** (no Menu, na tela Sincronização e no ícone da barra do computador) e o atalho **Ctrl+S** (⌘S no Mac) enviam e recebem na hora. Sem internet, nada se perde: as mudanças esperam no aparelho. Se o mesmo campo for editado nos dois aparelhos, vale a mudança mais recente e a outra fica no histórico do registro (está na cópia de segurança, em `estado`); o Histórico recente da tela Sincronização diz qual valeu («Mesmo campo nos dois aparelhos: Nota em CA00001: valeu a deste aparelho…»). «Vai subir» lista cada registro pelo que ele é («Nota em CA00001», «Coleção «Selos»», «Hipótese sobre «leão» em CA00002», «Objeto SKC CA00005»), com o link para a tela dele. Se o Dropbox responder com um erro que o app não reconhece, a tela diz «Nada se perdeu: …» e o que fazer («Toque em «Salvar e sincronizar» para tentar de novo»); o texto técnico do erro não fica na tela: o botão **Copiar detalhes** o copia para quem for ajudar, e o histórico mostra só «Não foi possível sincronizar».

Um `estado.json` que este aparelho lê só em parte (registros de um tipo que só uma versão mais nova do app conhece, ou registros ilegíveis) entra só com a base que ele pode ler, e **nunca é regravado** por ele: regravá-lo apagaria o resto para todos os aparelhos. A cobertura do arquivo (até onde ele diz ter lido os diários de cada aparelho) também não vale para esta versão: ela lê os diários sozinha, e um diário com linhas que ela não entende fica fora da cobertura de qualquer `estado.json` que ela grave depois, para que os aparelhos instalados mais tarde ainda o leiam. A tela Sincronização mostra um aviso próprio: «O usuario/estado.json do Dropbox foi lido só em parte…», que pede para atualizar o app neste aparelho (ou no que gravou o arquivo) e para **não** apagar o `estado.json`, que guarda registros que só a versão nova lê. Se o arquivo só tem registros **ilegíveis** (danificados; nenhum de tipo desconhecido), o aviso diz isso e o texto muda: pode apagar o `estado.json` no Dropbox, porque o que pôde ser lido entrou e o app o recria a partir dos diários. Quando o arquivo volta a ser lido inteiro, a consolidação volta. Só um `estado.json` que este aparelho não lê de jeito nenhum (versão mais nova do formato, malformado, grande demais) leva a outra sugestão: se atualizar o app não resolver, apagá-lo no Dropbox não perde nada, porque nada dele foi usado e o app o recria a partir dos diários.

As imagens que você acrescenta a um objeto ("Adicionar imagem", tecla A) são reduzidas no próprio aparelho e ficam guardadas nele (OPFS) até o Dropbox confirmar o envio; sobem com a sincronização: a tela e a miniatura antes dos eventos; o original depois, sem segurar a sincronização (acima de 8 MB, em partes de 4 MB que retomam de onde pararam). Uma imagem que não consegue subir por um motivo que não passa sozinho aparece na tela Sincronização, com "Tentar de novo". Confirmado o envio, o original sai do aparelho e a tela e a miniatura ficam no Cache Storage `iconodb-usuario-imagens`. No outro aparelho a imagem aparece depois de sincronizar; se o registro chegar antes do arquivo, o lugar diz "Imagem ainda não enviada pelo outro aparelho" e o app tenta de novo sozinho.

Hipóteses SKC (Tarefa 10): selecione um trecho de uma leitura (do livro, em português ou no original, ou a leitura SKC) e toque em **Registrar hipótese** (Shift+H; sem seleção, a hipótese fica sem trecho). A âncora guarda o trecho em code points e o SHA-256 do texto; se o texto mudar, o painel avisa e "Já conferi" grava o de agora. Uma região nova é desenhada na imagem (no computador, na própria coluna da imagem; no celular, no visualizador; tecla E no visualizador) e guardada como `<polygon points="x,y …"/>` de 0 a 1, ligada a um elemento novo ou existente. No painel de uma hipótese dos livros fica **Sua posição** (concordo, discordo, em aberto, com justificativa opcional). O formato dos campos (para o porte em Python) está no cabeçalho de `src/hipoteses/modelo.ts`.

Comparar (Tarefa 14): em um objeto, **Comparar (n/4)** (Shift+C) põe o objeto na bandeja de comparação (até 4, do livro ou SKC); o **Menu** tem Comparar com o mesmo contador, e numa citação como «TESTE I: 1–3» a folha do intervalo tem **Comparar todos**. No computador os objetos ficam lado a lado, com a imagem, a ficha e as leituras em linhas alinhadas e "≠" no que difere; no celular, um por vez (deslizar, ou os botões, com a posição "2 de 3"). A bandeja é sincronizada: um registro `comparar` com `reg` = `bandeja`, no formato de campos das coleções (`m:<ref>` a presença, `i:<ref>` a ordem), então dois aparelhos que acrescentam objetos diferentes sem internet ficam os dois; o limite de 4 é da leitura, e o que não coube aparece em "Não couberam" (nada some em silêncio). O formato (para o porte em Python) está no cabeçalho de `src/comparar/modelo.ts`.

## Exportar (cópia de segurança, regiões e hipóteses)

No **Menu**, **Exportar** (também pelo link «Cópia de segurança e exportações» da tela Sincronização) gera três arquivos **no próprio aparelho**, sem internet e sem login, com o que está gravado nele. O arquivo é baixado por um link (Blob), também no app instalado no Mac (o do Dock). No app instalado num aparelho de toque (iPhone, iPad), onde esse download não é confiável, abre a folha de compartilhar ("Salvar em Arquivos"); se o navegador a recusa porque o toque já não é recente (o arquivo demorou a ser montado), a tela diz que o arquivo está pronto e oferece **Salvar o arquivo**, que entrega o mesmo arquivo num toque novo (a tela só diz «foi baixado» quando o link saiu). Se o navegador recusa também esse segundo toque, a mensagem ganha, como último recurso, o link simples **Baixar o arquivo** (um download comum do mesmo arquivo, com uma frase que explica). Os nomes levam a data e a hora locais. Enquanto gera, o botão diz «Gerando…». Os montadores (puros) estão em `src/usuario/exportar.ts`; a leitura do IndexedDB, numa só transação, em `src/usuario/instantaneo.ts`.

**Cópia de segurança**, `iconodb-copia-AAAA-MM-DD-HHMM.json` (formato `iconodb-copia`, versão 1). Um objeto JSON com:

| Campo | O quê |
|---|---|
| `formato` | `"iconodb-copia"` |
| `versao` | `1` |
| `geradoEm` | data e hora (ISO 8601, UTC) |
| `aparelho` | `{id, nome}` do aparelho que gerou |
| `aparelhos` | `{id: nome}`: os nomes conhecidos (este e os outros) |
| `eventos` | todos os eventos que o aparelho guarda (enviados e por enviar, de todos os aparelhos), cada um com as 8 chaves do evento (`v, id, hlc, aparelho, tipo, reg, op, campos`), em ordem de (aparelho, seq, n) |
| `naoEnviados` | os ids dos eventos deste aparelho que ainda não subiram |
| `base` | a base consolidada guardada (a do `estado.json`, `{v: 1, registros}`), ou `null`. Cobre os eventos deste aparelho já podados depois de uma consolidação |
| `estado` | o estado fundido sem perda, no formato da base: cada campo com todas as escritas (`{evento, hlc, valor}`, a última é a atual), `criadoEm`, `alteradoEm`, `exclusao`. O formato (de `estado` e de `base`, o mesmo do `estado.json`) está documentado no cabeçalho de `src/usuario/fusao.ts` |
| `marcas` | `{aparelho: {seq, segmento}}`: o maior seq de evento conhecido de cada aparelho e o último segmento do diário lido em sequência |
| `numerosConfirmados` | os números de objeto SKC confirmados (o mapa `numeros` do `estado.json`) |
| `imagens` | `[{id, alvo, excluida, enviada, arquivos}]`: as imagens **não** vão dentro do arquivo; ficam na pasta `usuario/imagens/` do Dropbox, e `arquivos` dá os caminhos. `enviada: false`: a imagem ainda está na fila de envio do aparelho que gerou a cópia (algum arquivo ainda não está no Dropbox); a tela diz quantas estão «ainda só neste aparelho». `enviada: true` numa imagem de **outro** aparelho só quer dizer que ela não está na fila deste (não que este aparelho viu os arquivos no Dropbox) |
| `observacoes` | textos para quem abrir o arquivo |

Regra: fundir `eventos` sobre `base` (a fusão de `src/usuario/fusao.ts`, em qualquer ordem e com repetições) dá exatamente `estado`. Nenhum dado de login (token, código, verificador) entra. **Restaurar a partir da cópia ainda não existe** (fica para um passo posterior); o formato acima é o que essa restauração e o porte em Python (Tarefa 16) leem.

**Regiões**, `iconodb-regioes-….jsonld`: uma `AnnotationCollection` do [W3C Web Annotation](https://www.w3.org/TR/annotation-model/) (`@context` `http://www.w3.org/ns/anno.jsonld`; a página `first` com `partOf` = o id da coleção), com uma `Annotation` (motivation `tagging`) por região viva:
- ids: as suas regiões `urn:iconodb:regiao:RG-…`; as desenhadas nos livros `urn:iconodb:regiao-do-livro:<EL-…>:<IMG-…>` (o par elemento + imagem, único e estável entre versões do núcleo). Os `urn:iconodb:` são um espaço de nomes informal, não registrado: basta para uso pessoal; se um dia houver troca de arquivos, o formal seria um `tag:` (RFC 4151);
- **quem afirma o quê** (`creator`, decisão 46): a região de um **livro** é dos autores do livro (um `Person` por autor; sem autores, a `Organization` `urn:iconodb:autores:<SIGLA>` «Autores de <obra>») e o corpo leva só o rótulo e os verbetes do livro, sem `creator` próprio (herdam o da anotação); nunca um termo das suas hipóteses. A **sua** região é sua (`urn:iconodb:usuario`, `Person` "SKC"), e **todo corpo** dela diz de quem é: sobre um elemento do livro, o rótulo e os verbetes das hipóteses do livro levam os autores do livro como `creator` (se o pacote não pôde ser lido, o rótulo guardado na região, com a `Organization` `urn:iconodb:autores-do-livro`); os verbetes das suas hipóteses SKC vivas sobre o elemento, e o rótulo de um elemento seu, levam você;
- a coleção: `id` `urn:iconodb:exportacao:regioes:<geradoEm ISO>`, `label` «IconoDB: regiões das imagens», `total` (o número de anotações); sem nenhuma região, a coleção vem sem `first`; a página `first` tem `id` `<id da coleção>:pagina:1`, `partOf` e `startIndex` 0. `created` e `modified` (ISO 8601, UTC, do hlc) só nas suas regiões;
- `body`: o rótulo (`TextualBody` com `format` `text/plain` e `purpose` `tagging`; do livro em português e na língua da obra, `publication.language`; sem língua conhecida, sem `language`) e os verbetes (`SpecificResource` `urn:iconodb:verbete:GL-…`, purpose `identifying`), nesta ordem: o rótulo em português, o rótulo na língua da obra, os verbetes do livro, os verbetes SKC. O rótulo em português de um elemento do livro é o `label_pt` do pacote: a tradução do pipeline do rótulo do livro, creditada aos autores do livro (não a você);
- `target`: `SpecificResource` com `source` = `urn:iconodb:imagem:<id da imagem>` (`IMG-…` do pacote ou `IM-…` sua; caracteres fora de um IRI vão codificados com `%`) e um `SvgSelector` com um só `<polygon>`;
- coordenadas, em pixels da imagem sempre que o tamanho é conhecido (`viewBox="0 0 <largura> <altura>"`): numa imagem do livro, `width_px` × `height_px` do pacote, que é o tamanho de `original-<n>.png` (o quadro da figura antes do giro do livro; `screen-<n>.webp` é o mesmo quadro reduzido); numa imagem sua, o original **já orientado** (`originalLargura` × `originalAltura` do registro: quem abrir `original.<ext>` aplica o EXIF antes), senão a versão de tela (o mesmo quadro reduzido). Só quando nenhum tamanho é conhecido (uma imagem de outro aparelho que ainda não chegou, ou o pacote não lido), `viewBox="0 0 1 1"` e os pontos de 0 a 1, como guardados. Arredondamento: 2 casas em pixels, 4 casas no quadro de 0 a 1; um ponto fora de 0 a 1 é trazido para a borda. Regiões excluídas ficam de fora.

**Hipóteses para o MEDIATION**, `iconodb-hipoteses-mediation-….json` (`formato` `iconodb-mediation`, `alvoEsquema` `MEDIATION v0.6`, `versao` 1, `geradoEm`, `observacoes`, `hipoteses`). Só as suas hipóteses (SKC) vivas, cada uma com `id`, `alvo` (`{tipo: "item" | "element", id, objeto, rotulo}`: os códigos do pacote, como `hypothesis.target_type`; em `item`, `id` é o número do objeto, CA… ou OB-…), `identificacao` (os termos: `{id, rotulo, termoDoUsuario}`; um termo que você criou leva também `forma`, a de agora, e `formaOriginal`), `nivel`, `modalidade`, `autores` (`[{nome: "SKC", papel: "author"}]`), `fonte: "own_unpublished"`, `publicado: false`, `localizador` (legível como o `hypothesis.locator` do pacote: a obra e o número de cada item do objeto, «TESTE I, Nr. 3», vários separados por «; »; «SKC OB-…» para um objeto SKC; o número do objeto se o pacote não pôde ser lido), `trecho` (o trecho marcado, `{texto, fonte, lingua, inicio, fim}`, com o id `PA-…`/`OB-…` em `fonte` e o intervalo em code points, ou `null`), `supersedes_id` (sempre `null`: o app ainda não registra substituição), `verificacao: "recorded"`, `religiosidade` e `estrategias` (`null`), `justificativa`, `criadoEm` e `alteradoEm` (ISO 8601, UTC, do hlc). Em `alvo`, `rotulo` é vazio num `item`, e `id`/`objeto` podem ser `null` (a hipótese sem objeto legível). As suas posições sobre hipóteses dos livros não são exportadas. **O mapeamento é provisório**: segue a tabela de hipóteses da especificação (§4.2), e a Fase 5 (especificação, §11) o fecha contra o esquema real do MEDIATION.

## Limites conhecidos (Parte 2B)

- **Restaurar a partir da cópia de segurança** ainda não existe: a cópia é para guardar e para o `user-import`.
- **Tema escuro**: não há; o app usa sempre o tema claro.
- **Desenhar uma região só pelo teclado** não é possível: o polígono é marcado com o dedo ou o mouse.
- **Retirar dos livros uma entrada cujo registro se perdeu** (o diário da origem sumiu): o `user-import` avisa, mas o jeito de retirá-la fica para a Parte 2C.
- **Capturas de tela nos e2e (só quem tira capturas)**: no Chromium com emulação de celular, uma captura `fullPage: true` faz a página perder `pointer: coarse` até o fim do teste (os ícones passam de 44 para 40 px e o layout vira o do mouse). Os passos seguintes não mostram o celular de verdade. Por isso as capturas dos e2e usam `fullPage: false`; se uma precisar da página inteira, que seja o último passo do teste.
- **Nota excluída**: ela só volta pelo **Desfazer** (até a próxima ação) ou pelo endereço dela; ainda não existe uma lista das notas excluídas.
- **Conta do Dropbox**: a sua camada não fica amarrada a uma conta. **Sair** mantém neste aparelho o que você criou; se você entrar de novo com **outra** conta do Dropbox, o que está no aparelho é enviado para essa conta.
- **Movimento reduzido**: o CSS desliga as transições (`transition: none`), não as encurta. Uma transição de 0,01 ms ainda cria o estado intermediário, e o código que muda um estilo e mede na hora lê o valor antigo. Os projetos `*-movimento-reduzido` do Playwright rodam as telas que medem logo após mudar um estilo.

## Login com o Dropbox (passo manual, uma vez)

O app entra no Dropbox por OAuth 2 com PKCE: só a app key (`erkchv20ri1l2at`, pública por natureza), **nunca** o App secret. No console do Dropbox (https://www.dropbox.com/developers/apps, app do IconoDB):

O tipo de acesso **App folder** (os arquivos ficam na raiz da pasta do app, `/nucleo/…`, `/imagens/…`) é escolhido **ao criar o app** no console e não muda depois.

1. Em **Settings → OAuth 2 → Redirect URIs**, registre e adicione:
   - o endereço publicado, `https://silasklein.github.io/iconodb-app/` (produção; o mesmo de `VITE_ENDERECO`);
   - `http://localhost:5173/` (só se for rodar `npm run dev` e entrar por ele).
2. Em **Settings → OAuth 2**, deixe ligada a opção **Allow public clients (Implicit Grant & PKCE)**.
3. Na aba **Permissions**, marque as três permissões e clique em **Submit** no fim da página:
   - **`files.content.read`**: baixar o pacote e ler o que você escreveu em outro aparelho;
   - **`files.content.write`**: enviar as suas notas, coleções e imagens;
   - **`files.metadata.read`**: listar os arquivos e conferir se um envio já está lá.

   **Depois de marcar, entre de novo no app** (o token antigo não ganha permissões novas): na tela de erro de permissão, toque em "Entrar de novo". É feito uma vez por aparelho.

O app **só escreve em `usuario/`**, dentro da pasta do app (`usuario/diario/…`, `usuario/estado.json`, `usuario/imagens/…`); o pacote (`nucleo/`, `imagens/`) é só leitura e o app nunca apaga nada no Dropbox. Um caminho fora de `usuario/` é recusado antes de qualquer chamada à rede.

Sem o item 1, o Dropbox recusa o login com "redirect_uri mismatch". Sem o item 2, o login falha antes de começar. Sem o item 3 (ou sem o **Submit**), o login funciona mas o download ou o envio falha por falta de permissão; depois de mudar as permissões, entre de novo no app.

Os segredos do OAuth (o código, o `code_verifier` e o refresh token) vão sempre no corpo do POST, nunca na URL. Ao sair, o app revoga o token no Dropbox (se houver rede).

O login alternativo "Entrar com código" não usa redirect URI: o Dropbox mostra um código que se cola no app. Serve para o iPhone, onde o retorno do Dropbox pode abrir no Safari em vez do app instalado (os dois guardam dados separados).

O token (refresh token, access token e validade) fica no IndexedDB, nunca no `localStorage`. Se o Dropbox revogar o acesso, o app continua abrindo e consultando o que já está no aparelho, e a próxima sincronização pede para entrar de novo, sem apagar dados locais.

## Estrutura

- `src/app/`: `App.tsx` (roteador), `routes.tsx` (as telas) e `endereco.ts` (o endereço publicado, `VITE_ENDERECO`).
- `scripts/csp.ts`: a Content-Security-Policy do build.
- `src/dropbox/`: login do Dropbox.
  - `auth.ts`: `iniciarLogin`, `concluirLoginDetalhado`, `iniciarLoginComCodigo`, `tentarLoginComCodigo`, `cliente()` (renova o access token), `estadoLogin()` (`sem-login`, `ativo` ou `expirado`) e `sair()` (revoga e limpa).
  - `prazo.ts`: prazo de inatividade nas chamadas ao Dropbox (conexão pendurada vira "sem conexão").
  - `tokenStore.ts`: token e login em andamento (`code_verifier` e `state`) no IndexedDB `iconodb-login`.
  - `retorno.ts`: trata o `?code=…&state=…` na abertura do app (a query, e não o hash, porque o app usa `HashRouter`).
- `src/telas/`: telas (por ora, `Entrar.tsx`).
- `src/pwa/`: o app instalável.
  - `atualizacao.ts`: registra o service worker (só no build publicado) e guarda se há versão nova esperando.
  - `AvisoDeAtualizacao.tsx`: a faixa "Nova versão disponível", com o botão Recarregar. O app só recarrega quando o usuário toca nele, e a faixa fica escondida durante o primeiro download.
  - `icones.test.ts`: confere, pixel a pixel, os PNG de `public/`.
- `public/`: ícones do app (PNG), gerados por `scripts/gerar-icones.ts`.
- `scripts/gerar-icones.ts`: desenha os ícones direto em pixels a partir da grade 19 × 11 de `src/ui/Logo.tsx`.
- `scripts/gerar-mapa.ts`: gera `src/sitios/mapa-base.json` (o mapa dos sítios) a partir do `world-atlas` e do `ne_10m_lakes`; veja «O mapa dos sítios».
- `e2e/`: testes de ponta a ponta (`fluxo.spec.ts`) e o Dropbox simulado (`dropboxSimulado.ts`).
- `src/ui/`: elementos de interface compartilhados.
  - `tokens.css`: cores, fontes e medidas. Telas de consulta têm fundo claro (padrão); item e imagem usam o tema escuro.
  - `useTema.ts`: `useTema("item")` vai no componente de cada tela de item e de imagem. Ele põe a classe `tema-item` em `<html>` enquanto a tela está montada, para o fundo escuro cobrir o `<body>` e a rolagem elástica do iOS. Telas de consulta não chamam nada. Para pintar só um contêiner, use a classe `tema-item` nele (ela define fundo e texto).
  - `Logo.tsx`: logo SKC na grade 19 × 11, só em escalas inteiras (1 a 4).
  - `Icon.tsx`: todos os glifos do design, um por conceito.
  - `IconButton.tsx`: botão de ícone, sem rótulo visível, com `aria-label`, dica ao passar o mouse e ao receber foco (`data-tip`) e `aria-keyshortcuts`.
  - `useBreakpoint.ts`: `"celular"` abaixo de 768 px, `"computador"` de 768 px em diante.

## O mapa dos sítios (decisão 36)

O mapa de **Sítios** é vetorial e **offline**: o desenho (terra, lagos e fronteiras atuais, recortados à região dos sítios e simplificados) está em `src/sitios/mapa-base.json` (cerca de 115 KB; o teste confere o limite de 400 KB), sem servidor de mapas e sem nenhum pedido de rede em tempo de execução; a Content-Security-Policy não mudou. O mapa e o JSON formam um pacote à parte (`Mapa-*.js`), baixado só quando o mapa aparece na tela Sítios; o pacote principal não cresce.

**Origem dos dados e licenças** (o JSON é versionado; para refazê-lo, `node scripts/gerar-mapa.ts <ne_10m_lakes.geojson>`, um script de desenvolvimento rodado à mão):

| Camada | Fonte | Versão | Licença |
| --- | --- | --- | --- |
| Terra e fronteiras atuais | pacote npm [`world-atlas`](https://www.npmjs.com/package/world-atlas) (`land-10m.json`, `countries-10m.json`, escala 1:10 milhões), dependência só de desenvolvimento, de `https://registry.npmjs.org/world-atlas/-/world-atlas-2.0.2.tgz` (integridade `sha512-IXfV0qwlKXpckz1FhwXVwKRjiIhOnWttOskm5CtxMsjgE/MXAYRHWJqgXOpM8IkcPBoXnyTU5lFHcYa5ChG0LQ==`, no `package-lock.json`); SHA-256 de `land-10m.json` `9b9f5847…71a8` e de `countries-10m.json` `3bc6f1d3…5f79` (o script `scripts/gerar-mapa.ts` confere os dois e para se forem outros) | 2.0.2 (fixada) | ISC (o pacote); dados do Natural Earth, domínio público |
| Lagos (Mar Morto, Kinneret e os demais da área) | [Natural Earth](https://www.naturalearthdata.com/) `ne_10m_lakes`, do repositório [nvkelso/natural-earth-vector](https://github.com/nvkelso/natural-earth-vector): `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/f1890d9f152c896d250a77557a5751a93d494776/geojson/ne_10m_lakes.geojson` | tag v5.1.2, commit `f1890d9f152c896d250a77557a5751a93d494776`; SHA-256 do arquivo `2d036f53dedec578001c5c30c2959ee7d4eebc1306900fa4367c49929ec8f2d9` | domínio público |

Baixe o arquivo dos lagos da URL acima (por exemplo com `curl -o /tmp/ne_10m_lakes.geojson <URL>`) e passe o caminho ao script. O script confere o SHA-256 do arquivo dos lagos e para se ele não bater (nunca se inventa geometria). A tela mostra «Mapa offline · Natural Earth, domínio público». As regiões do filtro (`src/sitios/regioes.ts`) são polígonos simples sobre a mesma projeção, balizas para filtrar e não fronteiras políticas.

## Offline e ícones

O service worker (`vite-plugin-pwa`, gerado no `npm run build`) guarda no aparelho só o **app**: o shell (HTML, JS e CSS), o worker do banco, o `.wasm` do sqlite e as fontes (woff2). Ele **não** guarda nada do Dropbox: o pacote mora no OPFS (`blobs/` e `estado.json`) e as imagens no Cache Storage `iconodb-imagens` (ver `src/pacote/`). O manifesto chama-se "IconoDB", com `theme_color` `#111111`, `display: standalone` e `id`/`start_url`/`scope` iguais à base do endereço publicado (`/iconodb-app/`). Do sqlite-wasm ficam fora do precache o worker da API "Worker1" e o proxy da VFS "opfs", que o app não usa (o banco usa a VFS `opfs-sahpool`).

Versão nova do app: o service worker novo espera; aparece "Nova versão disponível" e o app recarrega só quando o usuário toca em Recarregar (feche antes as outras abas do app).

Os ícones (192, 512, 512 "maskable" e o `apple-touch-icon` de 180) são o logo SKC, preto sobre quadrado branco, em escala inteira e com margens iguais (decisão 21: pixel perfeito). Para refazê-los: `npm run icones`.

## Publicação

No GitHub, em **Settings → Pages**, a fonte (**Source**) deve ser **GitHub Actions**. O fluxo `.github/workflows/pages.yml` roda `npm ci --ignore-scripts`, `npm test` e `npm run build` (também em pull requests) e publica `dist/` no GitHub Pages só a cada push em `main`. O token do fluxo só lê o repositório; só o job que publica recebe `pages: write` e `id-token: write`.

### Mudar para o domínio próprio

Para publicar em `https://icono.silasklein.com/` (ou outro endereço):

0. **Antes de mexer no DNS ou no Pages, envie tudo o que está no app atual.** Faça em cada aparelho o que o passo 7 descreve. Depois disso, até o fim da troca, não crie nem edite nada no app antigo. Quando o passo 3 liga o domínio próprio, o endereço antigo passa a levar ao novo, e o app antigo só continua abrindo pelo que ficou guardado no aparelho.
1. **DNS (Locaweb)**: na zona de `silasklein.com`, crie um registro **CNAME** `icono` → `silasklein.github.io`.
2. **Verificar o domínio no GitHub** (evita que outra conta o tome): no seu perfil, **Settings → Pages → Add a domain**, `silasklein.com`, e crie na Locaweb o registro TXT que o GitHub pedir.
3. **Pages do repositório**: **Settings → Pages → Custom domain** = `icono.silasklein.com`, **Save**; quando o certificado sair, marque **Enforce HTTPS**.
4. **O endereço do app**: em **Settings → Secrets and variables → Actions → Variables**, crie a variável `VITE_ENDERECO` = `https://icono.silasklein.com/` (ou troque `ENDERECO_PADRAO` em `src/app/endereco.ts`). Rode o fluxo de novo (push na `main` ou **Run workflow**): a base passa a ser `/`, e o manifesto e o redirect do Dropbox acompanham. Para a e2e local no novo endereço: `VITE_ENDERECO=https://icono.silasklein.com/ npm run e2e`.
5. **Dropbox**: em **Settings → OAuth 2 → Redirect URIs**, adicione `https://icono.silasklein.com/` (o antigo pode ficar até a troca terminar).
6. **Instale o app de novo em cada aparelho**, pelo endereço novo, e entre no Dropbox: o armazenamento (login, pacote, imagens e a sua camada) é por endereço, então o app novo começa vazio e baixa tudo outra vez do Dropbox. Para o Dropbox, o app novo é um **aparelho novo**. Na tela Sincronização, em **Chegou do outro aparelho**, o que veio do app antigo aparece como **do iPhone** (ou do iPad, ou do Mac), com o mesmo nome deste aparelho. Isso é normal, não é erro.
7. **Antes de apagar o app antigo, confira que tudo o que estava nele subiu** (é a mesma conferência do passo 0). Em cada aparelho, abra o app **antigo**:
   - se algum formulário ficou pela metade (Novo objeto, Novo sítio, Nova hipótese ou a correção da coordenada de um sítio), termine-o ou descarte-o: esses formulários pela metade ficam só no app antigo e não sobem com a sincronização;
   - toque em **Salvar e sincronizar** e espere a tela Sincronização dizer **Sincronizado** com **Nada por enviar.**, sem a seção **Imagens que não subiram**. Se essa seção aparecer, resolva cada foto ali antes de seguir;
   - se quiser uma cópia a mais, baixe-a em Exportar.

   As notas, as coleções, os rascunhos de nota e as fotos que ainda não subiram só existem no site antigo; apagá-lo antes disso perde tudo isso.
8. **Apague o app antigo** (o da Tela de Início ou do Dock que abre `silasklein.github.io`) e, no Safari, os dados do site antigo, para liberar o espaço.
