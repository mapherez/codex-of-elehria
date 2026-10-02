# Levantamento do sistema visual do Nox Wiki

Data: 2026-10-02. Base analisada: worktree de `D:\Projects_2\nox-wiki-codex`, commit `dc074e2fa50b340db7097afd0babe4dbbd069e86`, sem alterações locais no início da análise.

## Resultado

A aplicação já tem uma linguagem visual coerente: fundo escuro, texto quente, accent dourado, links azuis e três categorias tipográficas. O problema principal é a distribuição dessa linguagem entre variáveis do leitor, literais do header/search e cores próprias do Canvas.

Foram encontrados **73 valores hexadecimais distintos: 56 opacos e 17 com alpha**, mais **uma expressão RGB dinâmica**, `transparent` e `currentColor`. São **76 entradas** no inventário abaixo. A contagem inclui definições e estilos residuais, não apenas cores que aparecem simultaneamente no ecrã. Cores herdadas e cores compostas por transparência não são novas entradas literais.

Recomendo **13 tokens de cor partilhados e 3 categorias de fonte**, acompanhados por receitas locais dos componentes que têm valores realmente particulares. Isto evita criar uma variável global para cada hexadecimal. **Os 13 tokens, sozinhos, não substituem sem perda os 73 hexadecimais.** A reprodução exacta inclui os valores/alphas locais indicados nas receitas. Trocar quatro RGB próximos por um único RGB pode ser uma decisão de redesign, mas não é uma normalização sem mudança visual.

## Âmbito e método

Foram varridos 74 ficheiros de código em `apps/web`, `apps/server/src`, `packages` e `src`. O frontend contém 48 desses ficheiros e **7 CSS**, todos analisados por declaração, selector, propriedade e linha. Também foram examinados os pontos de composição Svelte, mutações de estilo em TypeScript, desenho Canvas, HTML de entrada e geração de HTML Markdown no servidor.

A análise considera Public e Admin. Os estilos de leitura, header, pesquisa, drawer de navegação e relações são comuns; os de edição, histórico e NoX Sync entram através de Admin. Não foram encontrados blocos `<style>` em Svelte, folhas SCSS/LESS, SVG próprios, gradientes, fontes locais ou `@font-face` nesse âmbito. O servidor gera HTML/classes, não uma paleta adicional de SVG ou estilos inline. A propriedade `html: false` do parser Markdown impede que HTML livre das notas acrescente estilos a esse rendering.

Os ícones Phosphor foram confirmados no wrapper e na biblioteca instalada: a app escolhe `weight="regular"`, sem fornecer `color`; o SVG utiliza `currentColor`, com elementos `fill="none"` que não pintam. A variante duotone da biblioteca não está seleccionada. Imagens das notas e o logo configurável são assets de conteúdo, com cores arbitrárias; não pertencem à paleta de interface. `dist/`, `state/`, bundles de `build/` e screenshots não foram tratados como fonte de verdade do design.

Este é um levantamento estático do código, com análise da utilização e da cascata. Não é uma medição de pixels, contraste ou fontes efectivamente instaladas num browser/SO, nem uma certificação de igualdade de rendering entre plataformas. Não se alterou o frontend nem se executaram builds ou testes de aplicação para esta análise.

### Referências usadas no inventário

| Sigla | Ficheiro | Principais componentes afectados |
|---|---|---|
| R | [reader.css](../apps/web/src/lib/reader/reader.css) | CodexReader, Article/MarkdownContent, NavigationTree, TableOfContents; previews Admin |
| S | [standalone.css](../apps/web/src/app/standalone.css) | AppShell, marca, header, skip-link |
| D | [drawer.css](../apps/web/src/lib/drawer.css) | Drawer: navegação e acções Admin |
| A | [admin.css](../apps/web/src/admin/admin.css) | AdminApp, MarkdownEditor, HistoryView, PageAction, DeletedPages, PublishPending; Modal residual |
| N | [nox-sync.css](../apps/web/src/admin/nox-sync.css) | NoxSyncPanel e ImportTree |
| Q | [search.css](../apps/web/src/lib/search/search.css) | HeaderSearch, SearchPage, SearchResultRow |
| G | [relationships.css](../apps/web/src/lib/relationships/relationships.css) | RelationshipsPanel |
| C | [graph-canvas.ts](../apps/web/src/lib/relationships/graph-canvas.ts) | GraphCanvas: nós, linhas e setas |

A coluna “Onde” inclui **todas as linhas CSS/programáticas** em que o valor aparece directamente ou através de uma das variáveis de cor actuais. As tabelas usam as siglas acima. Uma linha compacta de CSS pode conter várias propriedades/ocorrências. O apêndice de ocorrências identifica cada selector e propriedade.

## Inventário de cores

“Token” significa um conceito partilhado recomendado. “Receita” significa um estilo local com papéis/estados e valores conservados, sem exigir novas variáveis CSS globais. Agrupar um conceito não implica tornar iguais valores diferentes.

### Backgrounds / superfícies

| Valor actual | Onde | Função visual | Conceitos relacionados | Decisão proposta |
|---|---|---|---|---|
| `#101214` | A:74; N:39; S:1,20; D:13,18; R:2,11; C:160 | Fundo raiz, leitor, drawer e rodapés sticky; halo do indicador Admin; contorno normal dos nós Canvas. | Mesma base repetida no shell, leitor e Canvas. O contorno do graph é separação sobre a superfície, não border/default. | Token background; reutilizar o valor em receitas de halo/contorno. Não fundir com surface. |
| `#15181c` | R:3; G:7; Q:8,14,29 | Campo de pesquisa, painel de resultados e fundo do graph; definição de --codex-panel. | As três superfícies activas usam exactamente o mesmo valor; --codex-panel tem zero referências var(). | Token surface; absorve os literais e substitui conceptualmente o panel hoje não utilizado. |
| `#14181e` | A:12 | Campos Admin: inputs, textarea e select, incluindo editor, NoX Sync e formulários de acções. | Papel de campo semelhante ao search (#15181c), mas contexto e valor diferem. | Token surfaceField, preservando a variante de pesquisa em surface. |
| `#161a20` | R:271 | Fundo dos blocos pre em conteúdo Markdown. | Próximo de #171c22, mas pertence à leitura de código publicado, não à comparação administrativa. | Receita code/block; manter valor. Sem novo token global. |
| `#171c22` | A:37 | Source preview do histórico e pre da resolução de conflito no editor. | Dois usos do mesmo papel administrativo; próximo de code/block. | Agrupar em receita source/preview; manter separado de code/block. |
| `#191c20` | R:255 | Fundo dos blockquotes Markdown. | Semelhante às superfícies de comparação, mas sublinha uma citação no conteúdo. | Receita quote; manter, sem o promover a superfície elevada universal. |
| `#191e24` | A:17,31 | Compare form do histórico e modal administrativo residual. | Valor partilhado, mas só compare form está ligado ao fluxo actual; não há import de Modal.svelte. | Receita history/compare. Conservar a referência residual no inventário, não criar surfaceRaised global só por ela. |
| `#1b2026` | R:59,155,295 | Botões de base, hover da árvore de páginas e cabeçalhos de tabelas Markdown. | Mesma cor em três aplicações de uma superfície discreta preenchida. | Token surfaceControl; os componentes conservam a função de cada uso. |
| `#232830` | R:261 | Fundo de código inline Markdown. | Mais claro que pre para destacar fragmentos curtos no meio do texto. | Receita code/inline; não fundir com code/block. |
| `#242018` | S:5 | Fundo do monograma da marca no header. | Tom castanho de identidade, próximo das selecções douradas mas sem função de selecção. | Receita brand/mark; manter independente. |

### Texto

| Valor actual | Onde | Função visual | Conceitos relacionados | Decisão proposta |
|---|---|---|---|---|
| `#e7e6e2` | A:12,17; S:1; R:4,10,60,154; C:158; G:16; Q:10,14,16,22,29,35 | Texto principal, controlos e resultados de pesquisa; nó não central em hover no Canvas. | É o mesmo branco quente em CSS, root e Canvas. Não é o branco mais luminoso do h1. | Token text; receita graph/nodeHover reutiliza o valor. |
| `#a0a6ae` | A:7,15,28,30,36,40,49,52,57,59; N:2,5,27,54,68; R:5,39,90,104,136,149,174,190,340,375,449; G:5,11,14,17,24; Q:20,21,23,32 | Texto secundário, navegação, TOC, detalhes, caminhos/snippets e ícones secundários. | Mesmo papel repetido em cinco dos sete CSS; subtitle usa #9a9fa6. | Token textMuted; absorver repetições exactas. Manter subtitle como variante local. |
| `#f4f0e8` | R:224 | Título h1 do conteúdo .prose, incluindo previews renderizados. | Mais luminoso que text e diferente do título da marca (#ede7dc). Não cobre todos os headings. | Receita prose/title; não trocar por text sem aceitar mudança visual. |
| `#bbc0c6` | R:245 | Parágrafo imediatamente a seguir ao h1 da .prose. | Texto introdutório; próximo do texto de citação #b9bdc3, mas diferente contexto. | Receita prose/lead; conservar a pequena distinção de citação. |
| `#b9bdc3` | R:256 | Texto de blockquote. | Nível intermédio semelhante ao lead, mas faz par com o fundo próprio da citação. | Receita quote/text; não assumir que é textMuted. |
| `#dbd6c7` | R:264 | Texto de code inline e de code dentro de pre Markdown. | Branco quente próprio do conteúdo técnico, distinto de text e de display. | Receita code/text; comum às duas formas de código Markdown. |
| `#ede7dc` | S:4 | Nome da marca no header. | Semelhante ao título principal, mas identidade e hierarquia próprias. | Receita brand/text; manter fora de prose/title. |
| `#9a9fa6` | S:6 | Subtitle da marca no header. | Mesmo conceito amplo de texto secundário que #a0a6ae, com luminosidade ligeiramente diferente. | Agrupar semanticamente em textMuted, mas conservar este override local para fidelidade exacta; fusão de RGB seria mudança. |
| `#d7bc8e` | S:5 | Letra do monograma da marca. | Dourado de marca, diferente do accent #cfb991 e do texto da selecção #e3cfaa. | Receita brand/markText; não usar automaticamente como accent. |
| `#191713` | R:74 | Texto dos botões primary preenchidos. | Texto escuro sobre accent; não é o fundo geral da app. | Token textOnAccent para os primary; não absorve o skip-link diferente. |
| `#151515` | S:22 | Texto do skip-link sobre accent. | Mesmo papel de textOnAccent, mas RGB distinto. | Receita skipLink/text ligada ao conceito textOnAccent, com override conservado; unificação só com mudança aprovada. |

### Bordas

| Valor actual | Onde | Função visual | Conceitos relacionados | Decisão proposta |
|---|---|---|---|---|
| `#2b3037` | A:6,24,25,34,37,42,52,54,60,71; N:6,13,22,31,39,45,53,58; S:3; D:14,17; R:6,87,97,119,171,269,291,299,334,398; G:7,13,22; Q:24,34 | Separadores, estruturas das árvores, TOC, tabelas, código, drawers, listas e cards; borda do header/search footer. | 33 declarações CSS referenciam --codex-line, além dos literais no shell/search; um papel dominante de estrutura. | Token border; absorver todos os usos exactos. |
| `#65707f` | A:12; Q:8,29 | Borda dos campos Admin e dos campos de pesquisa. | Borda de controlo, repetida em CSS Admin e search; semelhante à borda de botão #626b78. | Token borderControl para os campos; conservar variante button/border. |
| `#626b78` | R:57 | Borda dos botões de base. | Mesmo conceito amplo de controlo que #65707f, mas RGB diferente; não é edge do graph. | Receita button/border do conceito borderControl; não fundir agora. |
| `#4b535e` | Q:14 | Borda do painel flutuante de resultados. | Contorno de superfície flutuante, mais forte que border; diferente de inputs. | Receita search/panelBorder; não derivar automaticamente de borderControl. |
| `#56606d` | A:17 | Borda do modal administrativo residual. | Próximo de search/panelBorder, mas Modal.svelte não é importado pelas entradas actuais. | Manter documentado como legado; não criar token global adicional. |
| `#343941` | S:6 | Separador vertical entre marca e subtitle. | Separador estrutural próximo de border, exclusivamente no header. | Receita brand/divider; fusão com border seria mudança pequena mas real. |
| `#95815f` | S:5 | Borda do monograma. | Contorno de marca; semelhante aos tons de warning mas não transmite aviso. | Receita brand/markBorder; manter separado de warning. |

### Accent / links

| Valor actual | Onde | Função visual | Conceitos relacionados | Decisão proposta |
|---|---|---|---|---|
| `#cfb991` | A:8,26,50,61,62; N:7,8,11,21,38,41,44,49,50,68; S:7,9,20,22; R:7,40,47,73,75,160,195,254,347,350,371,457,464; C:158,161; G:6,25,27; Q:8,9,18,24 | Accent: acções, focus, selecção, breadcrumb, avisos, pending, controlos nativos e nó central/anel hover do graph. | Um mesmo valor suporta marca/interacção e alguns avisos. Warning não tem hoje uma cor de texto global independente. | Token accent. Slots warning/pending podem referenciá-lo nas receitas; não criar duplicações por componente. |
| `#a9c7ec` | R:8,42 | Links de conteúdo e links de relações existentes. | Azul de navegação real, diferente de graph/node (#9aaec5) e do accent de TOC/breadcrumb. | Token link; não fundir com accent nem com os nós do Canvas. |

### Estados de interacção / tratamento de superfícies

| Valor actual | Onde | Função visual | Conceitos relacionados | Decisão proposta |
|---|---|---|---|---|
| `#29313a` | R:66 | Hover dos botões genéricos. | Surge onde o preenchimento de base é surfaceControl; outros hovers usam transparência ou selecção. | Receita button/hover; não transformar todos os hovers neste fundo. |
| `#24241f` | S:8; R:158 | Página activa na árvore; hover e aria-expanded do controlo do header. | Uso exacto comum de destaque quente, apesar de estados distintos. | Receita selection/surface comum aos dois usos; não confundir com alpha de accent. |
| `#24251f` | A:26 | Versão seleccionada no histórico. | Mesmo conceito de selecção que #24241f, mas canal verde difere por 1. | Agrupar no conceito selection/surface conservando a variante history; uniformizar seria alteração, não refactor sem perda. |
| `#e3cfaa` | R:159 | Texto da página activa na árvore. | Realce quente mais claro que accent. | Receita selection/text; manter, pois accent reduz a luminosidade actual. |
| `#494332` | S:8 | Borda do controlo de header em hover/expandido. | Borda do destaque quente; semelhante a borders de aviso mas sem semântica de warning. | Receita header/activeBorder; não fundir com warning. |
| `#ffffff02` | N:45 | Fundo dos cards de review/import. | Branco a 2/255 (0,78%); mesmo conceito de leve elevação que #ffffff03, mas intensidade diferente. | Receita neutralWash com intensidade review; manter alpha exacto. |
| `#ffffff03` | A:6; N:68 | Grupo Markdown/Rendered e detalhes do estado NoX. | Branco a 3/255 (1,18%), partilhado entre dois fundos discretos. | Mesma receita neutralWash, intensidade detail; dois usos exactos agrupáveis. |
| `#ffffff07` | A:60; N:21,67; R:40 | Hover de expand/collapse, linhas de acções e indicadores NoX abertos/em hover. | Branco a 7/255 (2,75%); funcionalmente muito próximo de #ffffff08. | Receita neutralWash, intensidade actionHover; não arredondar alpha na passagem a tokens. |
| `#ffffff08` | G:6; Q:17 | Hover/focus de resultado de pesquisa e hover de controlo do graph. | Branco a 8/255 (3,14%); mesmo papel amplo do anterior em outros contextos. | Receita neutralWash, intensidade resultHover; fusão futura opcional, com diferença visual. |
| `#cfb99112` | N:49; Q:25 | Hover de Show all e fundo de import-status. | Accent a 18/255 (7,06%); realce suave, sem equivaler a uma superfície opaca. | Receita accentWash/soft; absorve ambos os usos exactos. |
| `#cfb99116` | A:8,61 | Botão primary do drawer e tab activa Markdown/Rendered. | Accent a 22/255 (8,63%); mesmo par background/border nos dois componentes. | Receita accentWash/selected comum aos dois, preservando a cor base accent. |
| `#cfb9911a` | N:8 | Fundo do número do step actual de import. | Accent a 26/255 (10,20%); passo corrente, não o mesmo fundo de tab. | Receita accentWash/step; conservar intensidade. |
| `#cfb99126` | A:63 | Hover da linha primary de acções. | Accent a 38/255 (14,90%); hover mais forte que o estado base. | Receita accentWash/hover; manter hierarquia. |
| `#cfb99138` | A:8,61 | Borda da linha primary e tab activa. | Accent a 56/255 (21,96%); uso de borda, não fundo. | Receita accentStroke/selected; não fundir com accentWash apesar da base comum. |
| `#cfb99170` | A:63 | Borda do hover da linha primary. | Accent a 112/255 (43,92%); reforço da borda seleccionada. | Receita accentStroke/hover; manter hierarquia. |

### Estados semânticos: success, warning, danger, error e diff

| Valor actual | Onde | Função visual | Conceitos relacionados | Decisão proposta |
|---|---|---|---|---|
| `#a7d3b5` | A:16; N:56 | Feedback de Save e de import bem sucedido. | Mesmo success de texto em Admin e NoX; diferente do texto de adição no diff. | Token success; absorve os dois usos exactos. |
| `#dcc15b` | N:25 | Dot Unchanged da lista/legenda NoX. | Amarelo de estado unchanged; não significa warning. Uma nota sem mudanças não é um problema. | Receita import/unchanged; manter independente dos avisos. |
| `#ed8181` | N:26 | Dot Problem de import: conflict ou blocked. | Estado de problema compacto; diferente do perigo de uma acção destrutiva. | Receita import/problem; manter cor e significado. |
| `#ffb8b8` | R:82 | Texto do botão danger genérico, usado em Delete e Disconnect. | Vermelho claro de acção destrutiva; diferente da linha danger no drawer. | Receita danger/buttonText; não impor um único vermelho a texto, borda, dot e diff. |
| `#ba6c6c` | R:83 | Borda do botão danger genérico. | Mesmo estado que o texto acima, intensidade apropriada a contorno. | Receita danger/buttonBorder; manter separado de texto. |
| `#e2a4a4` | A:64 | Texto e ícone herdado de action-row danger. | Mesmo conceito danger, com estilo discreto de linha de acções. | Receita danger/actionText; conservar variante. |
| `#d06d6d10` | A:66 | Fundo hover de action-row danger. | Base vermelha #d06d6d com alpha 16/255 (6,27%). Não aparece como cor opaca no código. | Receita dangerWash/hover; partilhar base com a borda, não com os textos de vermelho claro. |
| `#d06d6d40` | A:66 | Borda hover de action-row danger. | Mesma base do fundo com alpha 64/255 (25,10%). | Receita dangerStroke/hover; conservar alpha e função. |
| `#26231d` | R:358 | Fundo da notice: reconexão, conteúdo alterado e outros avisos informativos. | Superfície de atenção quente, não selecção; também utilizada em mensagens que não são erro. | Receita notice/background; não chamar success nem equiparar a import/unchanged. |
| `#6a604c` | R:357 | Borda da notice. | Faz par com #26231d; não é borda de controlo. | Receita notice/border; manter. |
| `#301f23` | R:364 | Fundo de .notice.error. | Superfície de erro de operação/rendering. | Receita error/background; distinta do diff removed e do perigo de botão. |
| `#976262` | R:363 | Borda de .notice.error. | Contorno de erro; diferente de danger/buttonBorder e import/problem. | Receita error/border; manter, com texto herdado de text. |
| `#99783c` | A:38 | Borda do conflito de edição no MarkdownEditor. | Conflito local de revisão, com conteúdo e acção de rebase; próximo de import/conflictBorder. | Receita editor/conflictBorder; conservar variante mais saturada. |
| `#8d7750` | N:46 | Borda do card de review em conflito NoX. | Mesmo conceito amplo de conflito, outro componente e intensidade. | Receita import/conflictBorder; não fundir só pela proximidade. |
| `#153e2a` | A:44 | Fundo de linha adicionada no diff. | Representa alteração positiva no histórico, não confirmação de Save. | Receita diff/addedBackground; manter independente de success. |
| `#bee7ca` | A:44 | Texto de linha adicionada no diff. | Par de contraste do fundo acima; mais claro que success. | Receita diff/addedText; manter. |
| `#44252b` | A:45 | Fundo de linha removida no diff. | Remoção histórica, não necessariamente erro ou perigo. | Receita diff/removedBackground; manter independente de error. |
| `#f2c7cc` | A:45 | Texto de linha removida no diff. | Par de contraste do fundo acima, diferente dos textos danger. | Receita diff/removedText; manter. |

### Overlays / sombras / transparência do header

| Valor actual | Onde | Função visual | Conceitos relacionados | Decisão proposta |
|---|---|---|---|---|
| `#101214f5` | S:3 | Fundo sticky do header. | RGB de background, alpha 245/255 (96,08%); deixa aparecer subtilmente o conteúdo por baixo. | Receita header/background = background com alpha exacto. Não substituir por background opaco. |
| `#0003` | N:52 | Fundo do pre de comparação no review NoX. | Preto a 3/15 (20%); escurece a superfície composta do card. | Receita source/inset com base scrim; não substituir por uma superfície opaca. |
| `#0004` | D:14 | Sombra do drawer: -12px 0 40px. | Preto a 4/15 (26,67%), usado em elevação lateral, não como overlay. | Receita shadow/drawer com scrim e geometria actual. |
| `#0008` | Q:14 | Sombra do painel de pesquisa: 0 16px 50px. | Preto a 8/15 (53,33%); elevação de popover, diferente do drawer. | Receita shadow/search com scrim; não unificar geometria/intensidade com drawer. |
| `#000b` | A:18 | Backdrop do modal administrativo residual. | Preto a 11/15 (73,33%), com blur(3px). Não participa no fluxo actual porque Modal não é importado. | Receita modal/backdrop residual; não aplicar este escurecimento ao drawer. |
| `rgb(0 0 0 / calc(.6 * var(--drawer-fade, 1)))` | D:9 | Backdrop do drawer modal (mobile e drawer de navegação alwaysModal). | Preto com alpha dinâmico 0–60%, calculado a partir do progresso do swipe; drawer Admin desktop é não modal. | Receita drawer/backdrop com scrim e factor dinâmico existente; nunca fixar a 60% durante toda a animação. |

### Graph / Canvas — cores exclusivas

| Valor actual | Onde | Função visual | Conceitos relacionados | Decisão proposta |
|---|---|---|---|---|
| `#9aaec5` | C:158 | Preenchimento normal dos nós não centrais. | Azul acinzentado dos nós, menos luminoso/saturado que link #a9c7ec. | Receita graph/node; manter independente de link. |
| `#66717e` | C:147 | Linhas/setas normais do graph. | Cor próxima de borderControl #65707f, mas liga entidades sobre surface, não delimita campos. | Receita graph/edge; manter independente de borderControl. |
| `#bec9d4` | C:147 | Linhas/setas incidentes no ponto em hover. | Realce do edge, próximo de prose/lead mas com outra função. | Receita graph/edgeHover; não fundir com texto. |
| `#c5a273` | C:147,160 | Linhas pendentes tracejadas e contorno de pontos por resolver. | Warning do graph; diferente de accent e import/unchanged. | Receita graph/unresolved; preservar legibilidade e a distinção dos nós centrais. |

### Outros / herança

| Valor actual | Onde | Função visual | Conceitos relacionados | Decisão proposta |
|---|---|---|---|---|
| `#3b424d` | R:101 | Thumb da scrollbar da sidebar. | Cor intermédia de scrollbar, distinta da borda ou preenchimento de botão. | Receita scrollbar/thumb; manter, sem globalizar um valor usado só aqui. |
| `transparent` | A:7,9,58; N:4,20,66; S:7; D:4; R:39,86,101,151,342; G:5; Q:10,24 | Fundos de controlos sem preenchimento, bordas reservadas, track da scrollbar e dialog exterior. | Ausência de pintura: deixa ver a superfície por baixo. Não equivale a background nem a preto opaco. | Manter como instrução de composição; não criar token de cor para ausência de pintura. |
| `currentColor` | R:165 | Borda de page-dot; fill dos SVG Phosphor herdado do elemento/contexto. | Herança do texto/contexto: muda com hover, active, warning ou danger. | Manter herança. Ícones não precisam de uma paleta nem de tokens por ícone. |

## Proposta mínima de linguagem visual

### Tokens de cor partilhados

Este é o conjunto mínimo **recomendado para partilha entre os componentes actuais**, não uma prova de mínimo matemático nem uma proposta de 73 variáveis renomeadas. Os nomes são conceptuais; este relatório não implementa CSS variables.

| Token | Valor / valores actuais absorvidos sem alteração | Âmbito e limite |
|---|---|---|
| background | `#101214` | Raiz, leitor, drawers e fundos sticky. A receita de header aplica alpha `f5/255`; o halo Admin e o contorno Canvas reutilizam a base. |
| surface | `#15181c` | Search e graph, mais a definição actual de panel. Não absorve outros fundos de pre/citação. |
| surfaceControl | `#1b2026` | Botão de base, hover da árvore e th: todos já iguais. O estado hover de botão continua local. |
| surfaceField | `#14181e` | Campos Admin. Pesquisa conserva surface como variante local de campo. |
| text | `#e7e6e2` | Texto principal e referências exactas no search/Canvas. Display/brand/code mantêm os seus valores. |
| textMuted | `#a0a6ae` | Texto e ícones secundários. Subtitle `#9a9fa6` pertence à mesma categoria, mas não é absorvido no RGB base sem perda. |
| textOnAccent | `#191713` | Primary preenchido. Skip-link `#151515` conserva override local. |
| border | `#2b3037` | Bordas e separadores estruturais já iguais. Não confundir com bordas fortes de controlo/aviso. |
| borderControl | `#65707f` | Campos Admin e pesquisa. Borda de botão `#626b78` permanece variante local da mesma categoria. |
| accent | `#cfb991` | Acções, focus, selecção e os usos actuais de warning/pending. Receitas conservam todos os alphas dourados. |
| link | `#a9c7ec` | Navegação em texto e relações. Links auxiliares de TOC/breadcrumb mantêm textMuted/accent. |
| success | `#a7d3b5` | Save e import concluídos. Não absorve o par de cores de diff/added. |
| scrim | Preto `#000000`, base extraída de `#0003`, `#0004`, `#0008`, `#000b` e do RGB dinâmico | A base é comum; alpha e geometria pertencem às receitas. Não há hoje um literal preto opaco independente na interface. |

As sete variáveis existentes são um bom ponto de partida, mas estão confinadas a `.codex`. O header e a pesquisa rápida vivem fora desse scope; o Canvas usa valores próprios. Uma eventual implementação terá de partilhar a mesma fonte de valores com esses três contextos. Apenas definir variáveis novas em `.codex` não normalizaria a aplicação toda.

Não criaria agora tokens globais separados `warningText`, `pendingText` ou `focusColor`: os três já usam accent e não há uma necessidade actual de variar as suas cores independentemente. As receitas conservam esses papéis para que a semântica não se perca. Também não criaria um único `danger` vermelho para substituir textos, dots, bordas e backgrounds: o código actual contém papéis e contrastes diferentes.

### Receitas locais necessárias para fidelidade

Estas receitas constituem a parte complementar da proposta. Os valores exclusivos continuam definidos localmente; só se promove um slot a token partilhado quando outro contexto necessitar do mesmo contrato. **Receitas são agrupamentos de regras de componente, não uma forma de esconder dezenas de variáveis globais num objecto.** A aplicação pode conservá-las no CSS actual enquanto centraliza apenas os valores partilhados.

| Receita | Valores actuais que conserva ou deriva | Motivo de independência |
|---|---|---|
| Marca | `#242018`, `#95815f`, `#d7bc8e`, `#ede7dc`, `#9a9fa6`, `#343941` | Identidade/monograma; separador e texto secundário do header. Não é selecção ou warning. |
| Conteúdo | title `#f4f0e8`; lead `#bbc0c6`; quote `#191c20` / `#b9bdc3`; code inline `#232830`, bloco `#161a20`, texto `#dbd6c7` | Diferentes elementos de leitura. H2–H6 conservam text, não a cor do h1. |
| Controlos e selecção | button border `#626b78`, hover `#29313a`; selected `#24241f` / `#e3cfaa`, história `#24251f`; header active border `#494332`; skip-link text `#151515` | Preserva a distinção actual entre hover, active, campo e acção preenchida. |
| Lavagens neutras | Branco com alpha `02/255`, `03/255`, `07/255`, `08/255` | Review, detail, action-hover e result-hover. Branco é uma constante de composição; não representa text. |
| Lavagens/contornos accent | Base accent com alpha `12/255`, `16/255`, `1a/255`, `26/255`, `38/255`, `70/255` | Preserva preenchimento, contorno, step e hover sem seis tokens de “dourado por componente”. |
| Notices/conflito | notice `#26231d` / `#6a604c`; error `#301f23` / `#976262`; editor conflict border `#99783c`; import conflict border `#8d7750` | Mensagem de atenção, erro e conflito têm funções e pares de contraste distintos. |
| Acções danger | generic text `#ffb8b8`, border `#ba6c6c`; action text `#e2a4a4`; hover usa base `#d06d6d` com alpha `10/255` e `40/255` | Variantes de apresentação da mesma acção destrutiva. O vermelho base é extraído dos dois hexadecimais com alpha. |
| Estados de import | unchanged `#dcc15b`, problem `#ed8181` | São estados do processo, não warning e danger genéricos. Available mantém ausência de dot. |
| Histórico/source/diff | compare `#191e24`; source `#171c22`; added `#153e2a` / `#bee7ca`; removed `#44252b` / `#f2c7cc` | Contexto técnico e representação de diferenças; não confundir added com success e removed com error. |
| Graph | node `#9aaec5`, edge `#66717e`, edgeHover `#bec9d4`, unresolved `#c5a273`; center/hoverRing = accent, nodeHover = text, normal stroke = background | Canvas tem necessidades de densidade, realce e direcção próprias. CSS do container usa surface/border. |
| Elevação/composição | header = background com alpha `f5/255`; NoX pre inset = scrim a 20%; drawer shadow = scrim a 26,67%, `-12px 0 40px`; search shadow = scrim a 53,33%, `0 16px 50px`; drawer backdrop = scrim a `0.6 × fade` | Alpha, geometria e substrato fazem parte da aparência. O halo `0 0 0 2px background` do indicador não é uma sombra de elevação. |
| Auxiliares/legado | scrollbar `#3b424d` sobre transparent; modal border `#56606d`, background `#191e24`, scrim a 73,33% e blur(3px) | Scrollbar tem um único contexto; modal não está importado. Legado documentado não justifica expandir o vocabulário global. |

Todas as 76 entradas estão atribuídas a um token, receita, herança ou ausência de pintura. Os valores de recipes não são fundidos com o token mais próximo apenas para reduzir a contagem. Não seria honesto afirmar que a paleta passa de 73 literais para 13 cores mantendo exactamente a mesma imagem.

### O que se pode agrupar já, sem perda

As repetições exactas de background, surface, text, textMuted, border, accent, link, success e borderControl podem partilhar valores. A tab activa e a action-row primary já partilham o mesmo par de accent com alpha. Search e graph já partilham o preenchimento da superfície. Os dois success já são iguais. O preto das sombras/backdrops pode ser uma única base, conservando os alphas.

Uma simples troca de `#cfb99116` por “accent a 9%” não seria exacta: o valor actual é 22/255, aproximadamente 8,62745%. As receitas devem guardar a precisão dos bytes originais, incluindo a distinção entre `#0003` (3/15) e os formatos de 8 dígitos (byte/255).

### Fusões que não recomendo nesta normalização

| Comparação | Leitura do código | Decisão |
|---|---|---|
| `#15181c`, `#161a20`, `#171c22`, `#191e24` | Respectivamente painel de pesquisa/graph, código Markdown, source/conflito administrativo e compare form (também modal residual). Não há uma escala de elevação demonstrada. | Preservar como surface + receitas locais. Chamar-lhes quatro níveis elevados seria inventar um sistema que não existe. |
| `#bbc0c6` / `#b9bdc3` | Lead e citação, dois textos intermédios. | Mesmo nível conceptual amplo; manter os RGB até existir decisão visual de os uniformizar. |
| `#a0a6ae` / `#9a9fa6` | Texto secundário geral e subtitle da marca. | Mesma categoria; override de marca conservado. |
| `#24241f` / `#24251f` | Selecção geral e histórica; diferença mínima num canal. | Forte candidato a uniformização futura, mas nenhuma é feita neste relatório. |
| `#ffffff07` / `#ffffff08` | Hover discreto em componentes distintos. | Mesmo tratamento; conservar intensidades numa receita. |
| `#65707f` / `#626b78` / `#66717e` | Campos, botões e ligações do graph. | Campos e botões podem partilhar categoria com variantes; graph mantém papel próprio. |
| `#cfb991` / `#dcc15b` / `#c5a273` | Accent geral, unchanged de import, referência não resolvida do graph. | Não fundir: igualdade de “tom quente” não é igualdade de significado. |
| `#a9c7ec` / `#9aaec5` | Link de texto e nó do graph. | Não fundir: o graph não é uma lista de links azuis pintada em Canvas. |
| Vermelhos de danger, problem, error e removed | Acção destrutiva, estado de import, falha de operação e mudança histórica. | Conservar variantes/pares semânticos. Um único vermelho não descreve esta interface. |

## Typography

### Famílias e stacks actuais

Há **cinco stacks explícitas distintas**, contando cadeias equivalentes com diferenças só de espaço como a mesma stack. Não são cinco famílias visuais carregadas: são alternativas de fallback que se organizam em **três categorias**. Não há fonte web carregada pelo frontend nem fonte de ícones.

| Categoria / stack exacta | Onde | Utilização / decisão |
|---|---|---|
| Body: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` | S:1; R:12–18 | Root, leitor, interface; controlos em .codex usam font:inherit. Propor font/body com esta stack exacta. |
| Sans abreviada: `ui-sans-serif, system-ui, sans-serif` | R:306 | Heading-anchor; o conteúdo actual é um SVG Phosphor montado, não texto. Pertence a body; conservar fallback abreviado local para igualdade do estado actual. |
| Display: `ui-serif, Georgia, Cambria, "Times New Roman", serif` | R:218 | Só h1 dentro de .prose, incluindo preview/histórico renderizado. Propor font/display com esta stack. |
| Display abreviada: `ui-serif, Georgia, serif` | S:4 | Marca e monograma herdado. Mesma categoria display, mas fallback diferente; conservar variante local de marca. |
| Mono: `ui-monospace, SFMono-Regular, Consolas, monospace` | R:259; A:14,37,43 | Código Markdown, textarea do editor, source/conflict preview e pre do diff. Propor font/mono com esta stack exacta. |

O código fora de .prose — hashes/path em HistoryView e o pre do review NoX — também pode receber a regra `monospace` do stylesheet do browser, pois nem todos esses elementos têm font-family explicitamente definido na app. O pre do diff tem a stack explícita, mas o code filho pode ter a declaração genérica do browser. Não assumir que já existe uma stack de monospace uniforme em todos os contextos.

A fusão das duas stacks serif ou das duas sans abreviadas numa única string é conceptualmente razoável, mas não garante fidelidade de fallback em todas as plataformas. O conjunto mínimo de **categorias** é três; a reprodução exacta conserva as duas variantes locais e os defaults do browser. Se a implementação futura passar todos os pre/code à stack mono explícita, isso deve ser tratado como uma melhoria visual deliberada.

“Heading font” seria um nome enganador para a serif: h2/h3 e títulos da interface são sans. Recomendo “display”, reservado à marca e ao título principal do conteúdo.

### Escala e pesos efectivamente declarados

| Contexto | Tamanho e tratamento actual | Observação para normalização |
|---|---|---|
| Leitor/interface dentro de .codex | `0.9375rem`, line-height `1.65`; body sans | 15px apenas com root de 16px. Root não fixa font-size e respeita a configuração do browser. |
| Marca | `1.25rem`; monograma `1.35rem`; mobile clamp(`.9rem, 3vw, 1.15rem`) | Papel display/brand próprio; não usar o tamanho do h1. |
| H1 .prose | clamp(`2.5rem, 4vw, 2.8rem`); mobile ≤720: `2.5rem`; peso `450`, line-height `1.12`, tracking `-.045em` | Fonte serif do sistema; peso pode ser aproximado/sintetizado pelo browser conforme a fonte disponível. |
| H2 / H3 .prose | H2 `1.4rem`, peso `600`, tracking `-.02em`; H3 `1.1rem` | H3 não define peso explicitamente; h4–h6 também dependem dos defaults de heading do browser. |
| Parágrafo lead | `1.08rem`, line-height `1.8` | Usa texto e dimensão intermédios próprios. |
| Código Markdown | `.85em` (relativo ao contexto) | Não trocar por `.85rem`: a unidade é parte da aparência. |
| Editor / source / diff | Editor `.86rem/1.8`; source/conflict `.85rem/1.7`; diff `.8rem/1.7`; mobile editor `1rem` | Três apresentações técnicas, não três famílias de fonte. |
| Navegação / TOC | Summary `.83rem` peso600; page `.82rem`; TOC `.8rem`; mobile/tablet `.9rem` | Sidebar label `.75rem`, peso700, uppercase, tracking `.15em`; footer `.7rem`. |
| Drawer / workspace | Drawer title `1rem` peso600; workspace title `1.8rem` peso550 e tracking `-.03em`, variante em drawer `1.1rem` | Os workspace-heading no drawer são ocultados pelo CSS; não criar um novo heading family. |
| Search | H1 de resultados `2rem` sans; nome quick `.9rem` peso650, full `1rem`; snippet `.8rem`, path/status `.75rem`; strong do match peso750 | Campo de pesquisa `1rem`. Bold existe nos resultados, não um highlight de cor injectado na nota. |
| NoX / graph / labels | NoX panel `.9rem`; states/steps `.75rem`; graph labels/listas `.75–.8rem`; labels Admin `.8rem` peso600 | Valores locais de hierarquia/legibilidade; campos NoX `1rem`, labels peso550. |

Pesos explícitos encontrados: `450, 550, 600, 650, 700, 750`, além dos pesos de browser/herança de headings e strong. Não há um peso base explicitamente fixado em .codex. Não reduzir estes pesos arbitrariamente a “normal/bold” numa passagem de tokens.

Para esta primeira normalização, manteria apenas **font/body, font/display e font/mono** como contratos partilhados. Tamanho, peso, tracking e line-height podem continuar em receitas do contexto. Introduzir uma variável para cada tamanho de label existente não tornaria a linguagem mais simples. O apêndice inclui todas as 131 declarações de font/font-*, line-height, letter-spacing e text-transform, para que o levantamento não dependa só desta tabela resumida.

## Estados, composição e rendering que não cabem num hexadecimal

- **Focus:** outline dourado de 2px e offset 4px no leitor/header; resultados/Show all têm offset -3px. O campo do header retira o outline do input e realça a borda do form em focus-within. Não padronizar só a cor perdendo estas geometrias.
- **Primary hover:** `filter: brightness(1.1)` pertence à regra genérica `.codex button.primary:hover` e também pode afectar a action-row primary. O aspecto final resulta da receita mais o filtro, não apenas do background declarado.
- **Disabled:** `.codex button:disabled` aplica opacity 0.5 e cursor wait; NoX step-back troca o cursor para default. A regra genérica button:hover não exclui disabled, ao contrário de várias regras específicas. Não foi criado um novo tom “disabled”; o estado compõe a cor existente com o fundo.
- **Selected/expanded:** árvore, TOC, tabs e header expressam estados por background, cor, borda ou combinações distintas. Não são todos um “active background” universal.
- **Transparência:** alphas de branco/dourado/vermelho/preto são compostos sobre superfícies diferentes. Usar a cor resultante de uma composição específica como token opaco perderia o comportamento noutro substrato.
- **Ícones:** herdam a cor de texto/controlo; action-row danger usa explicitamente color:inherit no SVG. O monograma é texto serif; as restantes acções são SVG, sem icon font.
- **Canvas:** sete literais no total. Quatro são exclusivos (tabela Graph); accent, text e background são partilhados. Pontos por resolver não são preenchidos: têm contorno e edge tracejado. As setas seguem a cor da ligação. Não há desenho de labels por ctx.font/fillText; a identificação vive em HTML na caption/lista.
- **Canvas em movimento:** posições, dimensões, stroke widths e tamanhos variam com simulação/zoom, mas a paleta não. A simulação no Worker não acrescenta cores. Anti-aliasing gera pixels intermédios, que não são tokens de cor de origem.
- **SVG não pintado / none:** `fill="none"` em Phosphor e `background: none` em pre code significam ausência de pintura; não são cores para adicionar ao inventário.
- **Browser/SO:** placeholders, foco nativo não abrangido pelas regras, selecção de texto, scrollbar fora da sidebar e aparência interna de checkbox/radio/progress não têm paleta explícita completa. Root usa `color-scheme: dark`; NoX fornece accent-color dourado. Não inventar RGB para estes valores de sistema.
- **Startup:** o fallback de bootstrap cria apenas um p com role=alert; não injecta CSS ou cor de erro. Herda o root, sem necessariamente a receita .notice.error.
- **Inline/programático:** TableOfContents define só `--heading-depth`; HeaderSearch define `--search-available-height`; Drawer controla overflow, transform e `--drawer-fade`. Este último altera o alpha do backdrop e é parte da receita de overlay. GraphCanvas muda o cursor. Não foram encontradas cores inline escondidas nestes componentes.
- **Responsive:** os breakpoints mudam disposição, visibilidade, dimensões e alguns tamanhos de texto, não introduzem uma segunda paleta. A coluna do graph desaparece ≤1120px e com o drawer Admin desktop aberto; drawer Admin mobile é modal. Reduced motion altera animação, não cores.

## Elementos existentes sem utilização actual

`--codex-panel` é declarado em R:3, mas nenhuma declaração utiliza `var(--codex-panel)`. O mesmo RGB aparece activo como literal no search/graph; por isso não é uma cor inútil, apenas uma variável não utilizada.

`Modal.svelte` existe e possui `.admin-dialog`, mas não é importado por outro ficheiro de código. As entradas Public/Admin usam Drawer. Os valores exclusivos `#56606d` e `#000b`, assim como blur(3px), devem ser classificados como residuais, não como requisitos de um sistema modal actualmente visível. O fundo `#191e24` continua activo no compare form.

A toolbar do leitor é um slot reutilizável, mesmo quando não é preenchido pelo shell actual. Não se deve classificar automaticamente todas as regras que um screenshot não mostra como código morto. Este relatório não remove variáveis, componentes ou estilos.

## Sequência recomendada para uma eventual implementação

1. Centralizar só os valores partilhados exactos, preservando scope do shell/leitor e consumo pelo Canvas.
2. Reutilizar as três categorias de fonte, conservando inicialmente as variantes de fallback e defaults que influenciam o aspecto.
3. Descrever tratamentos de componentes como receitas (normal/hover/focus/disabled/selected), mantendo os RGB, alphas, filtros e sombras actuais.
4. Separar a decisão de uniformizar variantes próximas numa revisão visual posterior. Essa revisão poderá reduzir a paleta literal, mas deve assumir explicitamente a mudança de aparência.
5. Só então considerar remoção do modal residual/variável não usada. A limpeza é independente deste levantamento e não foi executada.

O relatório descreve a linguagem mínima partilhável e identifica as excepções exactas; não inventa uma escala de superfícies nem impõe a mesma cor a estados que têm significados distintos.

## Apêndice A — ocorrências exactas e usos das variáveis

Os números indicam linhas do código-fonte. Incluem a definição da variável e cada declaração que a referencia; não representam contagem de pixels nem de instâncias renderizadas. Um selector combinado é uma única declaração CSS. “source” significa atribuição no Canvas, cujo contexto completo se encontra na linha indicada.

### `#0003`

- **N:52** — `.codex .import-review pre — background: #0003`

### `#0004`

- **D:14** — `.side-drawer .drawer-sheet — box-shadow: -12px 0 40px #0004`

### `#0008`

- **Q:14** — `.quick-search-panel — box-shadow: 0 16px 50px #0008`

### `#000b`

- **A:18** — `.codex .admin-dialog::backdrop — background: #000b`

### `#101214`

- **A:74** — `.codex .publish-pending-controls — background: var(--codex-bg)`
- **N:39** — `.codex .import-footer — background: var(--codex-bg)`
- **S:1** — `:root — background: #101214`
- **S:20** — `.actions-pending — box-shadow: 0 0 0 2px #101214`
- **D:13** — `.side-drawer .drawer-sheet — background: var(--codex-bg)`
- **D:18** — `.side-drawer .drawer-heading — background: var(--codex-bg)`
- **R:2** — `.codex — --codex-bg: #101214`
- **R:11** — `.codex — background: var(--codex-bg)`
- **C:160** — `ctx.strokeStyle = point.warning ? '#c5a273' : '#101214'; ctx.lineWidth = 1.2 / camera.k; ctx.stroke();`

### `#101214f5`

- **S:3** — `.app-header — background: #101214f5`

### `#14181e`

- **A:12** — `.codex :where(input,textarea,select) — background: #14181e`

### `#151515`

- **S:22** — `.skip-link — color: #151515`

### `#15181c`

- **R:3** — `.codex — --codex-panel: #15181c`
- **G:7** — `.codex .relationship-graph — background: #15181c`
- **Q:8** — `.header-search-form — background: #15181c`
- **Q:14** — `.quick-search-panel — background: #15181c`
- **Q:29** — `.codex .search-page-form input — background: #15181c`

### `#153e2a`

- **A:44** — `.codex .diff-view .added — background: #153e2a`

### `#161a20`

- **R:271** — `.codex .prose pre — background: #161a20`

### `#171c22`

- **A:37** — `.codex .source-preview, .codex .conflict-panel pre — background: #171c22`

### `#191713`

- **R:74** — `.codex button.primary — color: #191713`

### `#191c20`

- **R:255** — `.codex .prose blockquote — background: #191c20`

### `#191e24`

- **A:17** — `.codex .admin-dialog — background: #191e24`
- **A:31** — `.codex .compare-form — background: #191e24`

### `#1b2026`

- **R:59** — `.codex button — background: #1b2026`
- **R:155** — `.codex .tree-list a:hover — background: #1b2026`
- **R:295** — `.codex .prose th — background: #1b2026`

### `#232830`

- **R:261** — `.codex .prose code — background: #232830`

### `#242018`

- **S:5** — `.brand-mark — background: #242018`

### `#24241f`

- **S:8** — `.header-control:hover, .header-control[aria-expanded="true"] — background: #24241f`
- **R:158** — `.codex .tree-list a.active — background: #24241f`

### `#24251f`

- **A:26** — `.codex .history-list li.selected — background: #24251f`

### `#26231d`

- **R:358** — `.codex .notice — background: #26231d`

### `#29313a`

- **R:66** — `.codex button:hover — background: #29313a`

### `#2b3037`

- **A:6** — `.codex .editor-view-controls — border: 1px solid var(--codex-line)`
- **A:24** — `.codex .history-list li — border: 1px solid var(--codex-line)`
- **A:25** — `.codex .history-list li:last-child — border-bottom: 1px solid var(--codex-line)`
- **A:34** — `.codex .version-controls — border-top: 1px solid var(--codex-line)`
- **A:37** — `.codex .source-preview, .codex .conflict-panel pre — border: 1px solid var(--codex-line)`
- **A:42** — `.codex .diff-view — border: 1px solid var(--codex-line)`
- **A:52** — `.codex .drawer-page-context — border-bottom: 1px solid var(--codex-line)`
- **A:54** — `.codex .drawer-action-group + .drawer-action-group — border-top: 1px solid var(--codex-line)`
- **A:60** — `.codex button.action-row:hover:not(:disabled) — border-color: var(--codex-line)`
- **A:71** — `.codex .pending-pages li — border-bottom: 1px solid var(--codex-line)`
- **N:6** — `.codex .import-steps span — border: 1px solid var(--codex-line)`
- **N:13** — `.codex .select-all — border-bottom: 1px solid var(--codex-line)`
- **N:22** — `.codex .import-list-controls — border-bottom: 1px solid var(--codex-line)`
- **N:31** — `.codex .import-tree .import-tree — border-inline-start: 1px solid var(--codex-line)`
- **N:39** — `.codex .import-footer — border-top: 1px solid var(--codex-line)`
- **N:45** — `.codex .import-review — border: 1px solid var(--codex-line)`
- **N:53** — `.codex .import-review fieldset — border: 1px solid var(--codex-line)`
- **N:58** — `.codex .import-results li — border-bottom: 1px solid var(--codex-line)`
- **S:3** — `.app-header — border-bottom: 1px solid #2b3037`
- **D:14** — `.side-drawer .drawer-sheet — border-inline-start: 1px solid var(--codex-line)`
- **D:17** — `.side-drawer.left .drawer-sheet — border-inline-end: 1px solid var(--codex-line)`
- **R:6** — `.codex — --codex-line: #2b3037`
- **R:87** — `.codex button.quiet — border-color: var(--codex-line)`
- **R:97** — `.codex .sidebar — border-right: 1px solid var(--codex-line)`
- **R:119** — `.codex .tree-list .tree-list — border-left: 1px solid var(--codex-line)`
- **R:171** — `.codex .sidebar-footer — border-top: 1px solid var(--codex-line)`
- **R:269** — `.codex .prose pre — border: 1px solid var(--codex-line)`
- **R:291** — `.codex .prose :where(td, th) — border: 1px solid var(--codex-line)`
- **R:299** — `.codex .prose hr — border-top: 1px solid var(--codex-line)`
- **R:334** — `.codex .toc-links ul — border-left: 1px solid var(--codex-line)`
- **R:398** — `.codex .mobile-toc — border: 1px solid var(--codex-line)`
- **G:7** — `.codex .relationship-graph — border: 1px solid var(--codex-line)`
- **G:13** — `.codex .relationship-details — border-top: 1px solid var(--codex-line)`
- **G:22** — `.codex .relationship-headings — border-left: 1px solid var(--codex-line)`
- **Q:24** — `.search-show-all — border-top: 1px solid #2b3037`
- **Q:34** — `.codex .search-page-list li — border-bottom: 1px solid var(--codex-line)`

### `#301f23`

- **R:364** — `.codex .error — background: #301f23`

### `#343941`

- **S:6** — `.brand-subtitle — border-left: 1px solid #343941`

### `#3b424d`

- **R:101** — `.codex .sidebar — scrollbar-color: #3b424d transparent`

### `#44252b`

- **A:45** — `.codex .diff-view .removed — background: #44252b`

### `#494332`

- **S:8** — `.header-control:hover, .header-control[aria-expanded="true"] — border-color: #494332`

### `#4b535e`

- **Q:14** — `.quick-search-panel — border: 1px solid #4b535e`

### `#56606d`

- **A:17** — `.codex .admin-dialog — border: 1px solid #56606d`

### `#626b78`

- **R:57** — `.codex button — border: 1px solid #626b78`

### `#65707f`

- **A:12** — `.codex :where(input,textarea,select) — border: 1px solid #65707f`
- **Q:8** — `.header-search-form — border: 1px solid #65707f`
- **Q:29** — `.codex .search-page-form input — border: 1px solid #65707f`

### `#66717e`

- **C:147** — `ctx.strokeStyle = line.pending ? '#c5a273' : highlighted ? '#bec9d4' : '#66717e';`

### `#6a604c`

- **R:357** — `.codex .notice — border: 1px solid #6a604c`

### `#8d7750`

- **N:46** — `.codex .import-review.conflict — border-color: #8d7750`

### `#95815f`

- **S:5** — `.brand-mark — border: 1px solid #95815f`

### `#976262`

- **R:363** — `.codex .error — border-color: #976262`

### `#99783c`

- **A:38** — `.codex .conflict-panel — border: 1px solid #99783c`

### `#9a9fa6`

- **S:6** — `.brand-subtitle — color: #9a9fa6`

### `#9aaec5`

- **C:158** — `ctx.fillStyle = point.id === this.center ? '#cfb991' : this.hovered?.id === point.id ? '#e7e6e2' : '#9aaec5';`

### `#a0a6ae`

- **A:7** — `.codex .editor-view-controls button — color: var(--codex-muted)`
- **A:15** — `.codex .field-hint — color: var(--codex-muted)`
- **A:28** — `.codex .history-list small — color: var(--codex-muted)`
- **A:30** — `.codex .history-summary — color: var(--codex-muted)`
- **A:36** — `.codex .version-controls code — color: var(--codex-muted)`
- **A:40** — `.codex .conflict-panel p — color: var(--codex-muted)`
- **A:49** — `.codex .publication-status — color: var(--codex-muted)`
- **A:52** — `.codex .drawer-page-context — color: var(--codex-muted)`
- **A:57** — `.codex .drawer-action-group h3 — color: var(--codex-muted)`
- **A:59** — `.codex button.action-row svg — color: var(--codex-muted)`
- **N:2** — `.codex .nox-intro — color: var(--codex-muted)`
- **N:5** — `.codex .import-steps li — color: var(--codex-muted)`
- **N:27** — `.codex .import-state-legend — color: var(--codex-muted)`
- **N:54** — `.codex .import-review legend — color: var(--codex-muted)`
- **N:68** — `.codex .import-state-detail — color: var(--codex-muted)`
- **R:5** — `.codex — --codex-muted: #a0a6ae`
- **R:39** — `.codex button.navigation-expand — color: var(--codex-muted)`
- **R:90** — `.codex .muted — color: var(--codex-muted)`
- **R:104** — `.codex .sidebar-label — color: var(--codex-muted)`
- **R:136** — `.codex .tree-chevron — color: var(--codex-muted)`
- **R:149** — `.codex .tree-list a — color: var(--codex-muted)`
- **R:174** — `.codex .sidebar-footer — color: var(--codex-muted)`
- **R:190** — `.codex .page-context — color: var(--codex-muted)`
- **R:340** — `.codex .toc-links a — color: var(--codex-muted)`
- **R:375** — `.codex .empty-state p — color: var(--codex-muted)`
- **R:449** — `.codex .image-unresolved — color: var(--codex-muted)`
- **G:5** — `.codex .graph-controls button — color: var(--codex-muted)`
- **G:11** — `.codex .graph-caption — color: var(--codex-muted)`
- **G:14** — `.codex .relationship-details summary — color: var(--codex-muted)`
- **G:17** — `.codex .relationship-count, .codex .relationship-empty — color: var(--codex-muted)`
- **G:24** — `.codex .relationship-headings a — color: var(--codex-muted)`
- **Q:20** — `.search-result-path — color: #a0a6ae`
- **Q:21** — `.search-result-excerpt — color: #a0a6ae`
- **Q:23** — `.search-status — color: #a0a6ae`
- **Q:32** — `.codex .search-summary — color: var(--codex-muted)`

### `#a7d3b5`

- **A:16** — `.codex .save-notice — color: #a7d3b5`
- **N:56** — `.codex .import-success — color: #a7d3b5`

### `#a9c7ec`

- **R:8** — `.codex — --codex-link: #a9c7ec`
- **R:42** — `.codex a — color: var(--codex-link)`

### `#b9bdc3`

- **R:256** — `.codex .prose blockquote — color: #b9bdc3`

### `#ba6c6c`

- **R:83** — `.codex button.danger — border-color: #ba6c6c`

### `#bbc0c6`

- **R:245** — `.codex .prose > h1 + p — color: #bbc0c6`

### `#bec9d4`

- **C:147** — `ctx.strokeStyle = line.pending ? '#c5a273' : highlighted ? '#bec9d4' : '#66717e';`

### `#bee7ca`

- **A:44** — `.codex .diff-view .added — color: #bee7ca`

### `#c5a273`

- **C:147** — `ctx.strokeStyle = line.pending ? '#c5a273' : highlighted ? '#bec9d4' : '#66717e';`
- **C:160** — `ctx.strokeStyle = point.warning ? '#c5a273' : '#101214'; ctx.lineWidth = 1.2 / camera.k; ctx.stroke();`

### `#cfb991`

- **A:8** — `.codex .editor-view-controls button.active — color: var(--codex-accent)`
- **A:26** — `.codex .history-list li.selected — border-left: 2px solid var(--codex-accent)`
- **A:50** — `.codex .publication-status.pending — color: var(--codex-accent)`
- **A:61** — `.codex button.action-row.primary — color: var(--codex-accent)`
- **A:62** — `.codex button.action-row.primary svg — color: var(--codex-accent)`
- **N:7** — `.codex .import-steps .current — color: var(--codex-accent)`
- **N:8** — `.codex .import-steps .current span — border-color: var(--codex-accent)`
- **N:11** — `.codex .nox-panel input:is([type=checkbox],[type=radio]) — accent-color: var(--codex-accent)`
- **N:21** — `.codex button.expand-folders:hover:not(:disabled) — color: var(--codex-accent)`
- **N:38** — `.codex .import-tree label:hover — color: var(--codex-accent)`
- **N:41** — `.codex .vault-context — color: var(--codex-accent)`
- **N:44** — `.codex .import-progress progress — accent-color: var(--codex-accent)`
- **N:49** — `.codex .import-status — color: var(--codex-accent)`
- **N:50** — `.codex .import-warning — color: var(--codex-accent)`
- **N:68** — `.codex .import-state-detail — border-inline-start: 2px solid var(--codex-accent)`
- **S:7** — `.header-control — color: #cfb991`
- **S:9** — `.header-control:focus-visible, .brand:focus-visible — outline: 2px solid #cfb991`
- **S:20** — `.actions-pending — background: #cfb991`
- **S:22** — `.skip-link — background: #cfb991`
- **R:7** — `.codex — --codex-accent: #cfb991`
- **R:40** — `.codex button.navigation-expand:hover:not(:disabled) — color: var(--codex-accent)`
- **R:47** — `.codex :where(a, button, summary, input, textarea, select):focus-visible — outline: 2px solid var(--codex-accent)`
- **R:73** — `.codex button.primary — background: var(--codex-accent)`
- **R:75** — `.codex button.primary — border-color: var(--codex-accent)`
- **R:160** — `.codex .tree-list a.active — border-left-color: var(--codex-accent)`
- **R:195** — `.codex .page-context a — color: var(--codex-accent)`
- **R:254** — `.codex .prose blockquote — border-left: 2px solid var(--codex-accent)`
- **R:347** — `.codex .toc-links a:hover, .codex .toc-links a.active — color: var(--codex-accent)`
- **R:350** — `.codex .toc-links a.active — border-left-color: var(--codex-accent)`
- **R:371** — `.codex .empty-mark — color: var(--codex-accent)`
- **R:457** — `.codex .image-repair — color: var(--codex-accent)`
- **R:464** — `.codex.show-link-warnings .note-warning — color: var(--codex-accent)`
- **C:158** — `ctx.fillStyle = point.id === this.center ? '#cfb991' : this.hovered?.id === point.id ? '#e7e6e2' : '#9aaec5';`
- **C:161** — `if (this.hovered?.id === point.id) { ctx.beginPath(); ctx.arc(point.x, point.y, radius(point) + 3 / camera.k, 0, Math.PI * 2); ctx.strokeStyle = '#cfb991'; ctx.stroke(); }`
- **G:6** — `.codex .graph-controls button:hover:not(:disabled) — color: var(--codex-accent)`
- **G:25** — `.codex .relationship-warnings li — color: var(--codex-accent)`
- **G:27** — `.codex .relationship-error — color: var(--codex-accent)`
- **Q:8** — `.header-search-form — color: #cfb991`
- **Q:9** — `.header-search-form:focus-within — border-color: #cfb991`
- **Q:18** — `.search-result:focus-visible, .search-show-all:focus-visible — outline: 2px solid #cfb991`
- **Q:24** — `.search-show-all — color: #cfb991`

### `#cfb99112`

- **N:49** — `.codex .import-status — background: #cfb99112`
- **Q:25** — `.search-show-all:hover — background: #cfb99112`

### `#cfb99116`

- **A:8** — `.codex .editor-view-controls button.active — background: #cfb99116`
- **A:61** — `.codex button.action-row.primary — background: #cfb99116`

### `#cfb9911a`

- **N:8** — `.codex .import-steps .current span — background: #cfb9911a`

### `#cfb99126`

- **A:63** — `.codex button.action-row.primary:hover:not(:disabled) — background: #cfb99126`

### `#cfb99138`

- **A:8** — `.codex .editor-view-controls button.active — border-color: #cfb99138`
- **A:61** — `.codex button.action-row.primary — border-color: #cfb99138`

### `#cfb99170`

- **A:63** — `.codex button.action-row.primary:hover:not(:disabled) — border-color: #cfb99170`

### `#d06d6d10`

- **A:66** — `.codex button.action-row.danger:hover:not(:disabled) — background: #d06d6d10`

### `#d06d6d40`

- **A:66** — `.codex button.action-row.danger:hover:not(:disabled) — border-color: #d06d6d40`

### `#d7bc8e`

- **S:5** — `.brand-mark — color: #d7bc8e`

### `#dbd6c7`

- **R:264** — `.codex .prose code — color: #dbd6c7`

### `#dcc15b`

- **N:25** — `.codex .import-state-dot.unchanged — background: #dcc15b`

### `#e2a4a4`

- **A:64** — `.codex button.action-row.danger — color: #e2a4a4`

### `#e3cfaa`

- **R:159** — `.codex .tree-list a.active — color: #e3cfaa`

### `#e7e6e2`

- **A:12** — `.codex :where(input,textarea,select) — color: var(--codex-text)`
- **A:17** — `.codex .admin-dialog — color: var(--codex-text)`
- **S:1** — `:root — color: #e7e6e2`
- **R:4** — `.codex — --codex-text: #e7e6e2`
- **R:10** — `.codex — color: var(--codex-text)`
- **R:60** — `.codex button — color: var(--codex-text)`
- **R:154** — `.codex .tree-list a:hover — color: var(--codex-text)`
- **C:158** — `ctx.fillStyle = point.id === this.center ? '#cfb991' : this.hovered?.id === point.id ? '#e7e6e2' : '#9aaec5';`
- **G:16** — `.codex .relationship-details h3 — color: var(--codex-text)`
- **Q:10** — `.header-search-form input — color: #e7e6e2`
- **Q:14** — `.quick-search-panel — color: #e7e6e2`
- **Q:16** — `.search-result — color: #e7e6e2`
- **Q:22** — `.search-result-excerpt strong — color: #e7e6e2`
- **Q:29** — `.codex .search-page-form input — color: var(--codex-text)`
- **Q:35** — `.codex .search-page-list .search-result — color: var(--codex-text)`

### `#ed8181`

- **N:26** — `.codex .import-state-dot.problem — background: #ed8181`

### `#ede7dc`

- **S:4** — `.brand — color: #ede7dc`

### `#f2c7cc`

- **A:45** — `.codex .diff-view .removed — color: #f2c7cc`

### `#f4f0e8`

- **R:224** — `.codex .prose h1 — color: #f4f0e8`

### `#ffb8b8`

- **R:82** — `.codex button.danger — color: #ffb8b8`

### `#ffffff02`

- **N:45** — `.codex .import-review — background: #ffffff02`

### `#ffffff03`

- **A:6** — `.codex .editor-view-controls — background: #ffffff03`
- **N:68** — `.codex .import-state-detail — background: #ffffff03`

### `#ffffff07`

- **A:60** — `.codex button.action-row:hover:not(:disabled) — background: #ffffff07`
- **N:21** — `.codex button.expand-folders:hover:not(:disabled) — background: #ffffff07`
- **N:67** — `.codex button.import-state-trigger:hover, .codex button.import-state-trigger[aria-expanded="true"] — background: #ffffff07`
- **R:40** — `.codex button.navigation-expand:hover:not(:disabled) — background: #ffffff07`

### `#ffffff08`

- **G:6** — `.codex .graph-controls button:hover:not(:disabled) — background: #ffffff08`
- **Q:17** — `.search-result:hover, .search-result:focus-visible — background: #ffffff08`

### `currentColor`

- **R:165** — `.codex .page-dot — border: 1px solid currentColor`

### `rgb(0 0 0 / calc(.6 * var(--drawer-fade, 1)))`

- **D:9** — `.codex.side-drawer::backdrop — background: rgb(0 0 0 / calc(.6 * var(--drawer-fade, 1)))`

### `transparent`

- **A:7** — `.codex .editor-view-controls button — border-color: transparent`
- **A:7** — `.codex .editor-view-controls button — background: transparent`
- **A:9** — `.codex .editor-preview — background: transparent`
- **A:58** — `.codex button.action-row — background: transparent`
- **A:58** — `.codex button.action-row — border: 1px solid transparent`
- **N:4** — `.codex .import-steps button — background: transparent`
- **N:20** — `.codex button.expand-folders, .codex button.expand-folders:hover — background: transparent`
- **N:66** — `.codex button.import-state-trigger — background: transparent`
- **S:7** — `.header-control — border: 1px solid transparent`
- **S:7** — `.header-control — background: transparent`
- **D:4** — `.codex.side-drawer — background: transparent`
- **R:39** — `.codex button.navigation-expand — background: transparent`
- **R:86** — `.codex button.quiet — background: transparent`
- **R:101** — `.codex .sidebar — scrollbar-color: #3b424d transparent`
- **R:151** — `.codex .tree-list a — border-left: 2px solid transparent`
- **R:342** — `.codex .toc-links a — border-left: 2px solid transparent`
- **G:5** — `.codex .graph-controls button — background: transparent`
- **Q:10** — `.header-search-form input — background: transparent`
- **Q:24** — `.search-show-all — background: transparent`

## Apêndice B — declarações tipográficas completas

Inclui font/font-*, line-height, letter-spacing e text-transform nos sete CSS. O shorthand font:inherit é deliberadamente preservado no levantamento. Selectores dentro de media queries mantêm aqui a localização no ficheiro; o contexto responsive encontra-se na fonte nessa linha.

| Onde | Selector | Propriedade | Valor |
|---|---|---|---|
| A:1 | `.codex .workspace-title` | `font-size` | `1.8rem` |
| A:1 | `.codex .workspace-title` | `font-weight` | `550` |
| A:1 | `.codex .workspace-title` | `letter-spacing` | `-.03em` |
| A:5 | `.codex .editor-state` | `font-size` | `.75rem` |
| A:11 | `.codex :where(.editor,.admin-dialog,.compare-form) label` | `font-size` | `.8rem` |
| A:11 | `.codex :where(.editor,.admin-dialog,.compare-form) label` | `font-weight` | `600` |
| A:14 | `.codex .editor textarea` | `font-family` | `ui-monospace, SFMono-Regular, Consolas, monospace` |
| A:14 | `.codex .editor textarea` | `font-size` | `.86rem` |
| A:14 | `.codex .editor textarea` | `line-height` | `1.8` |
| A:15 | `.codex .field-hint` | `font-size` | `.75rem` |
| A:16 | `.codex .save-notice` | `font-size` | `.8rem` |
| A:20 | `.codex .dialog-heading h2` | `font-size` | `1.2rem` |
| A:21 | `.codex .dialog-heading button` | `font-size` | `1.3rem` |
| A:27 | `.codex .history-list strong` | `font-size` | `.85rem` |
| A:27 | `.codex .history-list strong` | `font-weight` | `550` |
| A:28 | `.codex .history-list small` | `font-size` | `.72rem` |
| A:29 | `.codex .history-list button` | `font-size` | `.75rem` |
| A:30 | `.codex .history-summary` | `font-size` | `.8rem` |
| A:33 | `.codex .compare-form select` | `font-size` | `.78rem` |
| A:36 | `.codex .version-controls code` | `font-size` | `.8rem` |
| A:37 | `.codex .source-preview, .codex .conflict-panel pre` | `font` | `.85rem/1.7 ui-monospace, SFMono-Regular, Consolas, monospace` |
| A:39 | `.codex .conflict-panel h2` | `font-size` | `1rem` |
| A:40 | `.codex .conflict-panel p` | `font-size` | `.8rem` |
| A:43 | `.codex .diff-view pre` | `font` | `.8rem/1.7 ui-monospace, SFMono-Regular, Consolas, monospace` |
| A:49 | `.codex .publication-status` | `font-size` | `.8rem` |
| A:52 | `.codex .drawer-page-context` | `font-size` | `.85rem` |
| A:57 | `.codex .drawer-action-group h3` | `font-size` | `.7rem` |
| A:57 | `.codex .drawer-action-group h3` | `text-transform` | `uppercase` |
| A:57 | `.codex .drawer-action-group h3` | `letter-spacing` | `.1em` |
| A:57 | `.codex .drawer-action-group h3` | `font-weight` | `550` |
| A:58 | `.codex button.action-row` | `font-size` | `.9rem` |
| A:68 | `.codex.side-drawer .workspace-title` | `font-size` | `1.1rem` |
| A:71 | `.codex .pending-pages li` | `font-size` | `.85rem` |
| A:73 | `.codex .pending-pages .publication-status` | `font-size` | `.7rem` |
| A:80 | `.codex .editor :is(input, textarea), .codex .compare-form select` | `font-size` | `1rem` |
| A:81 | `.codex .field-hint, .codex .publication-status, .codex .history-list small, .codex .pending-pages .publication-status` | `font-size` | `.8rem` |
| N:1 | `.codex .nox-panel` | `font-size` | `.9rem` |
| N:2 | `.codex .nox-intro` | `line-height` | `1.6` |
| N:4 | `.codex .import-steps button` | `font-size` | `inherit` |
| N:5 | `.codex .import-steps li` | `font-size` | `.75rem` |
| N:6 | `.codex .import-steps span` | `font-size` | `.75rem` |
| N:9 | `.codex .drawer-form input, .codex .nox-panel > input` | `font-size` | `1rem` |
| N:10 | `.codex .drawer-form label, .codex .filter-label` | `font-weight` | `550` |
| N:16 | `.codex .nox-step-heading h3` | `font-size` | `.9rem` |
| N:16 | `.codex .nox-step-heading h3` | `font-weight` | `550` |
| N:27 | `.codex .import-state-legend` | `font-size` | `.75rem` |
| N:40 | `.codex .import-footer p` | `font-size` | `.8rem` |
| N:48 | `.codex .import-review strong` | `font-size` | `.85rem` |
| N:49 | `.codex .import-status` | `font-size` | `.75rem` |
| N:50 | `.codex .import-warning` | `font-size` | `.8rem` |
| N:52 | `.codex .import-review pre` | `font-size` | `.75rem` |
| N:54 | `.codex .import-review legend` | `font-size` | `.75rem` |
| N:55 | `.codex .replacement-confirm` | `font-size` | `.85rem` |
| N:55 | `.codex .replacement-confirm` | `line-height` | `1.6` |
| N:68 | `.codex .import-state-detail` | `font-size` | `.8rem` |
| S:1 | `:root` | `font-family` | `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` |
| S:4 | `.brand` | `font-family` | `ui-serif, Georgia, serif` |
| S:4 | `.brand` | `font-size` | `1.25rem` |
| S:5 | `.brand-mark` | `font-size` | `1.35rem` |
| S:6 | `.brand-subtitle` | `font-size` | `.75rem` |
| S:34 | `.brand` | `font-size` | `clamp(.9rem, 3vw, 1.15rem)` |
| D:21 | `.side-drawer .drawer-heading h2` | `font-size` | `1rem` |
| D:21 | `.side-drawer .drawer-heading h2` | `font-weight` | `600` |
| R:12 | `.codex` | `font-family` | `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` |
| R:19 | `.codex` | `font-size` | `0.9375rem` |
| R:20 | `.codex` | `line-height` | `1.65` |
| R:54 | `.codex button, .codex input, .codex textarea, .codex select` | `font` | `inherit` |
| R:63 | `.codex button` | `line-height` | `1.3` |
| R:76 | `.codex button.primary` | `font-weight` | `650` |
| R:105 | `.codex .sidebar-label` | `font-size` | `0.75rem` |
| R:106 | `.codex .sidebar-label` | `font-weight` | `700` |
| R:107 | `.codex .sidebar-label` | `letter-spacing` | `0.15em` |
| R:108 | `.codex .sidebar-label` | `text-transform` | `uppercase` |
| R:127 | `.codex .tree-list summary` | `font-weight` | `600` |
| R:129 | `.codex .tree-list summary` | `font-size` | `0.83rem` |
| R:148 | `.codex .tree-list a` | `font-size` | `0.82rem` |
| R:175 | `.codex .sidebar-footer` | `font-size` | `0.7rem` |
| R:178 | `.codex .nav-empty` | `font-size` | `0.8rem` |
| R:191 | `.codex .page-context` | `font-size` | `0.8rem` |
| R:209 | `.codex .page-toolbar button` | `font-size` | `0.78rem` |
| R:218 | `.codex .prose h1` | `font-family` | `ui-serif, Georgia, Cambria, "Times New Roman", serif` |
| R:219 | `.codex .prose h1` | `font-size` | `clamp(2.5rem, 4vw, 2.8rem)` |
| R:220 | `.codex .prose h1` | `font-weight` | `450` |
| R:221 | `.codex .prose h1` | `letter-spacing` | `-0.045em` |
| R:222 | `.codex .prose h1` | `line-height` | `1.12` |
| R:229 | `.codex .prose h2` | `font-size` | `1.4rem` |
| R:230 | `.codex .prose h2` | `font-weight` | `600` |
| R:231 | `.codex .prose h2` | `letter-spacing` | `-0.02em` |
| R:234 | `.codex .prose h3` | `font-size` | `1.1rem` |
| R:244 | `.codex .prose > h1 + p` | `font-size` | `1.08rem` |
| R:246 | `.codex .prose > h1 + p` | `line-height` | `1.8` |
| R:259 | `.codex .prose code` | `font-family` | `ui-monospace, SFMono-Regular, Consolas, monospace` |
| R:260 | `.codex .prose code` | `font-size` | `0.85em` |
| R:306 | `.codex .heading-anchor` | `font-family` | `ui-sans-serif, system-ui, sans-serif` |
| R:307 | `.codex .heading-anchor` | `font-size` | `0.65em` |
| R:326 | `.codex .toc-title` | `font-size` | `0.75rem` |
| R:327 | `.codex .toc-title` | `font-weight` | `650` |
| R:339 | `.codex .toc-links a` | `font-size` | `0.8rem` |
| R:360 | `.codex .notice` | `font-size` | `0.83rem` |
| R:372 | `.codex .empty-mark` | `font-size` | `2.5rem` |
| R:400 | `.codex .mobile-toc` | `font-size` | `0.8rem` |
| R:417 | `.codex .tree-list :is(a, summary), .codex .toc-links a` | `font-size` | `.9rem` |
| R:439 | `.codex .prose h1` | `font-size` | `2.5rem` |
| G:3 | `.codex .relationships-heading h2` | `font-size` | `.75rem` |
| G:3 | `.codex .relationships-heading h2` | `font-weight` | `650` |
| G:9 | `.codex .relationship-graph > p` | `font-size` | `.75rem` |
| G:11 | `.codex .graph-caption` | `font-size` | `.8rem` |
| G:14 | `.codex .relationship-details summary` | `font-size` | `.8rem` |
| G:16 | `.codex .relationship-details h3` | `font-size` | `.75rem` |
| G:16 | `.codex .relationship-details h3` | `font-weight` | `650` |
| G:17 | `.codex .relationship-count, .codex .relationship-empty` | `font-size` | `.75rem` |
| G:19 | `.codex .relationship-list > li` | `font-size` | `.8rem` |
| G:22 | `.codex .relationship-headings` | `font-size` | `.75rem` |
| G:25 | `.codex .relationship-warnings li` | `font-size` | `.75rem` |
| G:27 | `.codex .relationship-error` | `font-size` | `.8rem` |
| G:28 | `.codex .relationship-retry` | `font-size` | `.8rem` |
| Q:10 | `.header-search-form input` | `font` | `inherit` |
| Q:10 | `.header-search-form input` | `font-size` | `1rem` |
| Q:19 | `.search-result-name` | `font-size` | `.9rem` |
| Q:19 | `.search-result-name` | `font-weight` | `650` |
| Q:20 | `.search-result-path` | `font-size` | `.75rem` |
| Q:20 | `.search-result-path` | `line-height` | `1.5` |
| Q:21 | `.search-result-excerpt` | `font-size` | `.8rem` |
| Q:21 | `.search-result-excerpt` | `line-height` | `1.6` |
| Q:22 | `.search-result-excerpt strong` | `font-weight` | `750` |
| Q:23 | `.search-status` | `font-size` | `.75rem` |
| Q:24 | `.search-show-all` | `font` | `inherit` |
| Q:26 | `.codex .search-page h1` | `font-size` | `2rem` |
| Q:29 | `.codex .search-page-form input` | `font-size` | `1rem` |
| Q:32 | `.codex .search-summary` | `font-size` | `.85rem` |
| Q:36 | `.codex .search-page-list .search-result-name` | `font-size` | `1rem` |

## Apêndice C — controlo de cobertura

- 48 ficheiros frontend incluídos na varredura; 7 CSS de origem.
- 73 hexadecimais distintos (56 de RGB opaco e 17 com alpha).
- 1 expressão RGB dinâmica, 1 entrada transparent e 1 entrada currentColor.
- 76 entradas únicas classificadas, sem valores em falta ou duplicação de linhas de inventário.
- 131 declarações tipográficas registadas no apêndice B.
- Reutilizações via var(): background 5; panel 0; text 8; muted 31; line 33; accent 30; link 1. Estas contagens são de declarações CSS, não de componentes.
- Canvas: 7 valores distintos, dos quais 4 exclusivos e 3 iguais a cores partilhadas do CSS.
- Nenhuma alteração de frontend, configuração, notas, imagens ou state é necessária para este relatório.
