# Changelog

## 1.0.0

Primeira versão. / First release.

- Escolhe, por tipo de arquivo, a sintaxe de comentário que o servidor descarta antes de responder: Jinja, Django, Twig, Blade, Handlebars, EJS, Pug e SCSS.
- Detecta o motor de template por conteúdo e pelas dependências do projeto, sem depender do tipo declarado pelo editor.
- Converte comentários já expostos, com pré-visualização e diff, inclusive os de JavaScript e CSS embutidos em `<script>` e `<style>`.
- Preserva diretivas de ferramentas (`eslint-disable`, `sourceMappingURL`, `@ts-ignore`, `/*! licença */`) e blocos `{% raw %}` / `@verbatim`.
- Em HTML, CSS e JS puros guarda o comentário fora do arquivo, com reancoragem por impressão digital do conteúdo.
- Interface em português e inglês.
