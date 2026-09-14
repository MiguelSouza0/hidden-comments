import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { getContext } from "../src/core/languages.ts";
import { applyReplacements, planConversion } from "../src/core/convert.ts";
import {
  findEmbeddedComments,
  findEmbeddedRegions,
  findRawRegions,
  isPragma,
} from "../src/core/scan.ts";

const jinja = getContext("jinja");

function converter(fonte: string, contexto = jinja): string {
  return applyReplacements(fonte, planConversion(fonte, contexto));
}

function textos(fonte: string, contexto = jinja): string[] {
  return planConversion(fonte, contexto).map((item) => item.original);
}

describe("blocos <script> e <style>", () => {
  test("localiza o conteudo interno de cada bloco", () => {
    const regioes = findEmbeddedRegions('<script>a</script><style>b</style>');
    assert.deepEqual(
      regioes.map((r) => r.kind),
      ["script", "style"],
    );
  });

  test("converte comentario de linha do JavaScript", () => {
    const fonte = "<script>\n  // nota interna\n  const x = 1;\n</script>";
    assert.equal(
      converter(fonte),
      "<script>\n  {# nota interna #}\n  const x = 1;\n</script>",
    );
  });

  test("converte comentario de bloco do CSS", () => {
    const fonte = "<style>\n  /* nota */\n  .a { color: red }\n</style>";
    assert.ok(converter(fonte).includes("{# nota #}"));
  });

  test("converte bloco de varias linhas preservando o miolo", () => {
    const fonte = "<script>\n  /*\n   linha 1\n   linha 2\n  */\n</script>";
    const resultado = converter(fonte);
    assert.ok(resultado.includes("linha 1"));
    assert.ok(resultado.includes("linha 2"));
    assert.ok(!resultado.includes("/*"));
  });

  test("nao converte em HTML puro, que nao tem pre-processador", () => {
    const fonte = "<script>\n  // nota\n</script>";
    assert.equal(planConversion(fonte, getContext("html")).length, 0);
  });
});

describe("protecao contra falso positivo em JavaScript", () => {
  test("ignora as duas barras finais de uma expressao regular", () => {
    const fonte = "<script>\n  const re = /https?:\\/\\//;\n</script>";
    assert.equal(textos(fonte).length, 0, "nao pode tocar em expressao regular");
    assert.equal(converter(fonte), fonte);
  });

  test("ignora comentario no meio da linha", () => {
    const fonte = "<script>\n  const x = 1; // nota ao lado\n</script>";
    assert.equal(textos(fonte).length, 0);
  });

  test("ignora barras dentro de string", () => {
    const fonte = '<script>\n  const url = "https://exemplo.com";\n</script>';
    assert.equal(textos(fonte).length, 0);
  });

  test("nao encontra o mesmo comentario duas vezes", () => {
    const fonte = "<script>\n  /* bloco\n  // dentro do bloco\n  */\n</script>";
    const plano = planConversion(fonte, jinja);
    assert.equal(plano.length, 1);
    assert.ok(converter(fonte).includes("dentro do bloco"));
  });
});

describe("diretivas nao podem ser convertidas", () => {
  const diretivas = [
    "// eslint-disable-next-line no-console",
    "/* eslint-disable */",
    "// prettier-ignore",
    "// @ts-ignore",
    "//# sourceMappingURL=app.js.map",
    "/*! licenca preservada pelo minificador */",
    "/** @type {string} */",
    "/// <reference path=\"x.d.ts\" />",
    "/* global jQuery */",
    "// istanbul ignore next",
    "// @license MIT",
  ];

  for (const diretiva of diretivas) {
    test(`preserva ${diretiva.slice(0, 32)}`, () => {
      const fonte = `<script>\n  ${diretiva}\n  const x = 1;\n</script>`;
      assert.equal(converter(fonte), fonte, "diretiva mudaria o comportamento do codigo");
    });
  }

  test("comentario comum ao lado de diretiva continua sendo convertido", () => {
    const fonte = "<script>\n  // eslint-disable-next-line\n  // nota do time\n</script>";
    const resultado = converter(fonte);
    assert.ok(resultado.includes("// eslint-disable-next-line"));
    assert.ok(resultado.includes("{# nota do time #}"));
  });

  test("isPragma reconhece os prefixos", () => {
    assert.ok(isPragma(" eslint-disable"));
    assert.ok(isPragma("# sourceMappingURL=x"));
    assert.ok(isPragma("* @type {x}"));
    assert.ok(!isPragma(" nota normal do time"));
  });
});

describe("blocos onde o pre-processador nao roda", () => {
  test("localiza {% raw %}", () => {
    const fonte = "a {% raw %} b {% endraw %} c";
    const regioes = findRawRegions(fonte, jinja.rawBlocks ?? []);
    assert.equal(regioes.length, 1);
    assert.equal(fonte.slice(regioes[0]!.start, regioes[0]!.end), "{% raw %} b {% endraw %}");
  });

  test("nao converte comentario dentro de {% raw %}", () => {
    const fonte = "{% raw %}\n<!-- ficaria visivel como texto -->\n{% endraw %}";
    assert.equal(converter(fonte), fonte);
  });

  test("converte fora do raw e preserva o que esta dentro", () => {
    const fonte = "<!-- converte -->\n{% raw %}\n<!-- preserva -->\n{% endraw %}";
    const resultado = converter(fonte);
    assert.ok(resultado.includes("{# converte #}"));
    assert.ok(resultado.includes("<!-- preserva -->"));
  });

  test("aceita a forma com hifen de corte", () => {
    const fonte = "{%- raw -%}\n<!-- preserva -->\n{%- endraw -%}";
    assert.equal(converter(fonte), fonte);
  });

  test("Blade protege @verbatim", () => {
    const fonte = "@verbatim\n<!-- preserva -->\n@endverbatim";
    assert.equal(converter(fonte, getContext("blade")), fonte);
  });
});

describe("documento misto", () => {
  const fonte = [
    '{% extends "base.html" %}',
    "<!-- cabecalho -->",
    "<script>",
    "  // nota do time",
    '  const url = "https://exemplo.com";',
    "  const re = /a\\/\\//;",
    "  // eslint-disable-next-line",
    "  console.log(url);",
    "</script>",
    "<style>",
    "  /* espacamento */",
    "  .a { margin: 0 }",
    "</style>",
  ].join("\n");

  test("converte apenas o que deve", () => {
    const plano = planConversion(fonte, jinja);
    assert.deepEqual(plano.map((item) => item.original), [
      "<!-- cabecalho -->",
      "// nota do time",
      "/* espacamento */",
    ]);
  });

  test("preserva o codigo em volta", () => {
    const resultado = converter(fonte);
    assert.ok(resultado.includes('const url = "https://exemplo.com";'));
    assert.ok(resultado.includes("const re = /a\\/\\//;"));
    assert.ok(resultado.includes("// eslint-disable-next-line"));
    assert.equal(resultado.split("\n").length, fonte.split("\n").length);
  });

  test("continua idempotente", () => {
    const primeira = converter(fonte);
    assert.equal(planConversion(primeira, jinja).length, 0);
  });

  test("nada sobra que o navegador possa ver", () => {
    const resultado = converter(fonte);
    assert.ok(!resultado.includes("<!-- cabecalho"));
    assert.ok(!resultado.includes("// nota do time"));
    assert.ok(!resultado.includes("/* espacamento"));
  });
});

describe("findEmbeddedComments isolado", () => {
  test("devolve offsets absolutos no documento", () => {
    const fonte = "<div></div>\n<script>\n  // nota\n</script>";
    const achados = findEmbeddedComments(fonte);
    assert.equal(achados.length, 1);
    assert.equal(fonte.slice(achados[0]!.start, achados[0]!.end), "// nota");
  });

  test("bloco sem fechamento nao derruba a varredura", () => {
    assert.doesNotThrow(() => findEmbeddedComments("<script>\n  // nota"));
  });
});
