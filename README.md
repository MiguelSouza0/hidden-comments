# Hidden Comments · Comentários Ocultos

**Team comments that never reach the browser inspector.**
**Comentários de equipe que não chegam ao inspecionar do navegador.**

![VS Code](https://img.shields.io/badge/VS%20Code-1.73%2B-007ACC?logo=visualstudiocode&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Tests](https://img.shields.io/badge/tests-64-success)
![License](https://img.shields.io/badge/license-MIT-green)

---

<a name="portugues"></a>

## Português

### O problema

Um comentário `<!-- -->` num arquivo HTML aparece no painel Elements do DevTools. Um `/* */` num CSS aparece na aba Sources. Qualquer visitante do site lê as anotações internas da equipe.

O detalhe é que a maioria dos projetos **já tem** uma forma de comentário que não vaza — só não a usa de forma consistente. Em Jinja, `{# #}` some no servidor enquanto `<!-- -->` é enviado. Em Blade, `{{-- --}}` some e `<!-- -->` é enviado. Em SCSS, `//` some na compilação e `/* */` fica.

Esta extensão faz essa escolha por você.

### Como funciona

Ao adicionar um comentário, a extensão identifica o contexto do arquivo e usa a sintaxe que não chega ao navegador:

| Contexto | Sintaxe usada |
|---|---|
| Jinja2 / Django / Twig | `{# … #}` |
| Blade | `{{-- … --}}` |
| Handlebars | `{{!-- … --}}` |
| EJS | `<%# … %>` |
| Pug | `//- …` |
| SCSS / Sass / Less | `// …` |
| PHP, Python, Java, Ruby, Go | comentário normal (roda no servidor) |
| **HTML, CSS e JS puros** | **nenhuma existe → guardado fora do arquivo** |

Para os tipos sem saída segura, o comentário **não entra no arquivo**. Ele fica em `.hidden-comments/`, versionado com o código, e aparece no editor como texto fantasma ao lado da linha. O arquivo servido continua idêntico — o navegador não tem o que mostrar.

### Detecção sem configuração

Projetos Flask e Django guardam templates em arquivos `.html` comuns. Sem uma extensão de Jinja instalada, o VS Code os trata como HTML puro — e é justamente aí que esta extensão mais serve. Por isso ela não confia no tipo declarado pelo editor:

1. Override do usuário (`hiddenComments.contexts`)
2. Extensão do arquivo (`.blade.php`, `.twig`, `.j2`…)
3. Marcas no conteúdo (`{% block %}`, `@extends(`, `<%= %>`)
4. Dependências do projeto (`pyproject.toml` com Flask → `.html` em `templates/` é Jinja)
5. `languageId` do editor

**`{{ }}` de propósito não conta como sinal.** Angular, Vue e Handlebars usam a mesma marcação, e confundir um template Angular com Jinja faria a extensão inserir `{# #}`, que apareceria como texto na tela. Na dúvida, o comentário vai para fora do arquivo — que é seguro em qualquer tipo.

### Converter o que já está exposto

`Verificar comentários expostos no projeto` varre tudo e mostra quantos comentários estão indo para o navegador. `Converter comentários expostos` abre a pré-visualização de refatoração do próprio VS Code, com diff e caixa de seleção por item.

A conversão preserva o texto e a indentação, e é idempotente: rodar de novo não encontra nada.

### Ativar e desativar

| Ação | Como |
|---|---|
| Ligar/desligar a extensão | Clique no item da barra de status |
| Mostrar/esconder os comentários fantasma | `Ctrl+Alt+H` |
| Adicionar comentário | `Ctrl+Alt+Shift+H` |

A barra de status também mostra o contexto detectado do arquivo aberto — útil para conferir se a detecção acertou antes de confiar nela.

### Idioma

A extensão vem em português e inglês. Por padrão segue o idioma do VS Code; `hiddenComments.language` força um dos dois.

### O que isto **não** é

O arquivo `.hidden-comments/` está no repositório. A extensão protege contra **quem visita o site**, não contra quem tem acesso ao código. Quem clona o projeto lê os comentários — e é assim que deve ser, já que a ideia é a equipe compartilhá-los.

Para JavaScript, TypeScript, JSX e Vue o padrão é guardar fora do arquivo, porque o comentário só desaparece se o build minificar **e** não publicar sourcemap. Com sourcemap publicado, o DevTools mostra o código original inteiro. Se o seu build remove tudo, `hiddenComments.trustBuildForSourceMaps` libera a escrita no arquivo.

---

<a name="english"></a>

## English

### The problem

An HTML `<!-- -->` comment shows up in the DevTools Elements panel. A CSS `/* */` shows up under Sources. Every visitor can read the team's internal notes.

Most projects already **have** a comment form that never ships — they just don't use it consistently. In Jinja, `{# #}` is dropped server-side while `<!-- -->` is sent. In Blade, `{{-- --}}` is dropped and `<!-- -->` is sent. In SCSS, `//` is dropped at compile time and `/* */` survives.

This extension makes that choice for you.

### How it works

When you add a comment, the extension resolves the file's context and uses the syntax that never reaches the browser:

| Context | Syntax used |
|---|---|
| Jinja2 / Django / Twig | `{# … #}` |
| Blade | `{{-- … --}}` |
| Handlebars | `{{!-- … --}}` |
| EJS | `<%# … %>` |
| Pug | `//- …` |
| SCSS / Sass / Less | `// …` |
| PHP, Python, Java, Ruby, Go | plain comment (runs server-side) |
| **Plain HTML, CSS and JS** | **none exists → stored outside the file** |

For file types with no safe form, the comment **never enters the file**. It lives in `.hidden-comments/`, versioned with your code, and renders in the editor as ghost text next to the line. The served file is untouched, so the browser has nothing to show.

### Detection without configuration

Flask and Django projects keep templates in ordinary `.html` files. Without a Jinja extension installed, VS Code treats them as plain HTML — exactly the case where this extension matters most. So it does not trust the editor's language id:

1. User override (`hiddenComments.contexts`)
2. File extension (`.blade.php`, `.twig`, `.j2`…)
3. Content markers (`{% block %}`, `@extends(`, `<%= %>`)
4. Project dependencies (`pyproject.toml` with Flask → `.html` under `templates/` is Jinja)
5. Editor `languageId`

**`{{ }}` deliberately does not count as a signal.** Angular, Vue and Handlebars share that syntax, and mistaking an Angular template for Jinja would insert `{# #}`, which renders as visible text on the page. When unsure, the comment goes outside the file — always safe.

### Converting what is already exposed

`Check exposed comments in the project` scans everything and reports how many comments are being served. `Convert exposed comments` opens VS Code's own refactor preview, with a diff and a checkbox per item.

Conversion preserves text and indentation, and is idempotent: a second run finds nothing.

### Turning it on and off

| Action | How |
|---|---|
| Enable/disable the extension | Click the status bar item |
| Show/hide ghost comments | `Ctrl+Alt+H` |
| Add a comment | `Ctrl+Alt+Shift+H` |

The status bar also shows the detected context for the open file, so you can check the detection before trusting it.

### Language

Ships in English and Portuguese. Follows the VS Code display language by default; `hiddenComments.language` forces either one.

### What this is **not**

The `.hidden-comments/` folder lives in your repository. This protects against **site visitors**, not against anyone with repository access. Whoever clones the project reads the comments — which is the point, since the team is meant to share them.

For JavaScript, TypeScript, JSX and Vue the default is to store outside the file, because a comment only disappears if the build minifies **and** publishes no source map. With a published source map, DevTools shows the original source in full. If your build strips everything, `hiddenComments.trustBuildForSourceMaps` allows writing into the file.

---

## Desenvolvimento · Development

```bash
npm install
npm test        # 64 testes, sem depender do editor, sem subir editor
npm run check   # tipos + testes
npm run build   # bundle com esbuild
npm run package # gera o .vsix
```

O núcleo (`src/core/`) não importa `vscode`: detecção, varredura, conversão e ancoragem são funções puras, testadas direto com `node --test`.

<sub>MIT · <a href="https://github.com/MiguelSouza0">Francisco Miguel Souza Santos</a></sub>
