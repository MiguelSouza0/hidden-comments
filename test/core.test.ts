import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  allContexts,
  getContext,
  isConvertible,
  resolveSafeSyntax,
  scanSyntaxes,
} from "../src/core/languages.ts";
import { formatComment, rewrap } from "../src/core/comment.ts";
import {
  findBlockComments,
  findComments,
  findHtmlComments,
  findLineComments,
} from "../src/core/scan.ts";
import { applyReplacements, planConversion } from "../src/core/convert.ts";

describe("registro de linguagens", () => {
  test("todo contexto convertivel tem forma segura diferente da exposta", () => {
    for (const context of allContexts()) {
      if (!isConvertible(context)) {
        continue;
      }
      const safe = context.safe;
      assert.ok(safe, `${context.id} deveria ter forma segura`);
      for (const leaking of context.leaking) {
        assert.notEqual(
          safe.open,
          leaking.open,
          `${context.id}: a forma segura nao pode ser igual a que vaza`,
        );
      }
    }
  });

  test("linguagens de servidor nao tem sintaxe que vaze", () => {
    for (const id of ["php", "python", "cstyle-server", "hash-server"] as const) {
      assert.equal(getContext(id).leaking.length, 0);
    }
  });

  test("html e css nao tem forma segura", () => {
    assert.equal(getContext("html").safe, undefined);
    assert.equal(getContext("css").safe, undefined);
    assert.equal(resolveSafeSyntax(getContext("html"), { trustBuild: false }), undefined);
  });

  test("contexto dependente de build so libera escrita se o usuario assumir o risco", () => {
    const javascript = getContext("javascript");
    assert.equal(resolveSafeSyntax(javascript, { trustBuild: false }), undefined);
    assert.deepEqual(resolveSafeSyntax(javascript, { trustBuild: true }), { open: "//" });
  });

  test("nao oferece conversao onde a troca nao esconderia nada", () => {
    assert.equal(scanSyntaxes(getContext("javascript")).length, 0);
    assert.equal(scanSyntaxes(getContext("vue")).length, 0);
    assert.ok(scanSyntaxes(getContext("jinja")).length > 0);
  });
});

describe("varredura de comentarios HTML", () => {
  test("encontra comentario simples", () => {
    const found = findHtmlComments('<div><!-- Cabecalho Principal --></div>');
    assert.equal(found.length, 1);
    assert.equal(found[0]?.inner, " Cabecalho Principal ");
  });

  test("encontra comentario de varias linhas", () => {
    const found = findHtmlComments("<!--\n  linha 1\n  linha 2\n-->");
    assert.equal(found.length, 1);
    assert.equal(found[0]?.inner, "\n  linha 1\n  linha 2\n");
  });

  test("ignora <!-- dentro de <script>", () => {
    const source = '<script>\n  const x = "<!-- nao e comentario -->";\n</script>\n<!-- e comentario -->';
    const found = findHtmlComments(source);
    assert.equal(found.length, 1);
    assert.equal(found[0]?.inner, " e comentario ");
  });

  test("ignora <!-- dentro de <style>", () => {
    const found = findHtmlComments('<style>\n  /* <!-- --> */\n</style>');
    assert.equal(found.length, 0);
  });

  test("nao confunde <scriptish> com <script>", () => {
    const found = findHtmlComments("<scriptish><!-- achavel --></scriptish>");
    assert.equal(found.length, 1);
  });

  test("ignora comentario sem fechamento em vez de adivinhar", () => {
    assert.equal(findHtmlComments("<div><!-- sem fim").length, 0);
  });

  test("encontra varios comentarios em sequencia", () => {
    const source = "<!-- um -->\n<div></div>\n<!-- dois -->";
    assert.equal(findHtmlComments(source).length, 2);
  });
});

describe("varredura de comentarios de bloco e de linha", () => {
  const block = { open: "/*", close: "*/" };

  test("encontra bloco em CSS", () => {
    const found = findBlockComments(".a { color: red } /* nota */", block);
    assert.equal(found.length, 1);
    assert.equal(found[0]?.inner, " nota ");
  });

  test("ignora bloco dentro de string", () => {
    const found = findBlockComments('.a::after { content: "/* nao e */" }', block);
    assert.equal(found.length, 0);
  });

  test("ignora comentario de linha dentro de string", () => {
    const found = findLineComments('const url = "https://exemplo.com";', { open: "//" });
    assert.equal(found.length, 0);
  });

  test("encontra comentario de linha ate o fim da linha", () => {
    const found = findLineComments("const x = 1; // nota\nconst y = 2;", { open: "//" });
    assert.equal(found.length, 1);
    assert.equal(found[0]?.inner, " nota");
  });

  test("findComments devolve achados ordenados por posicao", () => {
    const source = "/* b */ x /* a */";
    const found = findComments(source, [block]);
    assert.deepEqual(
      found.map((item) => item.inner),
      [" b ", " a "],
    );
  });
});

describe("formatacao de comentario novo", () => {
  const jinja = { open: "{#", close: "#}" };

  test("uma linha vira comentario de uma linha", () => {
    assert.equal(formatComment(jinja, "revisar permissao"), "{# revisar permissao #}");
  });

  test("varias linhas viram bloco indentado", () => {
    assert.equal(
      formatComment(jinja, "primeira\nsegunda", { indent: "  " }),
      "{#\n    primeira\n    segunda\n  #}",
    );
  });

  test("sintaxe sem fechamento prefixa cada linha", () => {
    assert.equal(
      formatComment({ open: "//" }, "uma\noutra", { indent: "  " }),
      "// uma\n  // outra",
    );
  });
});

describe("troca de delimitadores", () => {
  test("preserva o miolo de varias linhas exatamente", () => {
    const inner = "\n  Coluna direita\n  Segunda linha\n";
    assert.equal(rewrap({ open: "{#", close: "#}" }, inner), `{#${inner}#}`);
  });

  test("normaliza o espacamento em uma linha so", () => {
    assert.equal(rewrap({ open: "{#", close: "#}" }, "Cabecalho"), "{# Cabecalho #}");
  });
});

describe("conversao", () => {
  const jinja = getContext("jinja");

  // Espelha a forma dos templates reais do SER.
  const template = [
    "{% extends 'base.html' %}",
    "{% block conteudo %}",
    "  <!-- Cabecalho Principal -->",
    '  <div class="card">',
    "    {# ja estava seguro #}",
    "    <!-- Coluna direita: adicionar materia -->",
    "  </div>",
    "{% endblock %}",
  ].join("\n");

  test("converte apenas os comentarios expostos", () => {
    const plan = planConversion(template, jinja);
    assert.equal(plan.length, 2);
    assert.deepEqual(
      plan.map((item) => item.text),
      ["{# Cabecalho Principal #}", "{# Coluna direita: adicionar materia #}"],
    );
  });

  test("o resultado nao tem mais comentario HTML", () => {
    const resultado = applyReplacements(template, planConversion(template, jinja));
    assert.equal(findHtmlComments(resultado).length, 0);
    assert.ok(resultado.includes("{# Cabecalho Principal #}"));
    assert.ok(resultado.includes("{# ja estava seguro #}"));
  });

  test("preserva a indentacao das linhas convertidas", () => {
    const resultado = applyReplacements(template, planConversion(template, jinja));
    assert.ok(resultado.includes("  {# Cabecalho Principal #}"));
  });

  test("e idempotente", () => {
    const primeira = applyReplacements(template, planConversion(template, jinja));
    assert.equal(planConversion(primeira, jinja).length, 0);
  });

  test("nao mexe no codigo em volta", () => {
    const resultado = applyReplacements(template, planConversion(template, jinja));
    assert.ok(resultado.includes("{% extends 'base.html' %}"));
    assert.ok(resultado.includes('<div class="card">'));
    assert.equal(resultado.split("\n").length, template.split("\n").length);
  });

  test("nao propoe nada para contexto sem forma segura", () => {
    assert.equal(planConversion("<!-- nota -->", getContext("html")).length, 0);
  });

  test("converte bloco de varias linhas preservando o texto", () => {
    const source = "<!--\n  linha 1\n  linha 2\n-->";
    const resultado = applyReplacements(source, planConversion(source, jinja));
    assert.equal(resultado, "{#\n  linha 1\n  linha 2\n#}");
  });

  test("converte Blade para a forma do motor", () => {
    const source = "<!-- interno -->";
    const resultado = applyReplacements(source, planConversion(source, getContext("blade")));
    assert.equal(resultado, "{{-- interno --}}");
  });
});
