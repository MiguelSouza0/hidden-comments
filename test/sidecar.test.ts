import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  contextFingerprint,
  createComment,
  fingerprint,
  parseSidecar,
  reanchor,
  serializeSidecar,
  sidecarPathFor,
} from "../src/core/sidecar.ts";

const ARQUIVO = [
  ".card {",
  "  display: flex;",
  "  z-index: 10;",
  "  color: red;",
  "}",
];

function comentarioNaLinha(lines: readonly string[], line: number, text = "nota") {
  return createComment({ lines, line, text, author: "ana" });
}

describe("impressao digital", () => {
  test("ignora indentacao e espacos repetidos", () => {
    assert.equal(fingerprint("  z-index: 10;"), fingerprint("z-index:   10;"));
  });

  test("linha em branco nao gera ancora", () => {
    assert.equal(fingerprint("   "), "");
    assert.equal(fingerprint(undefined), "");
  });

  test("linhas diferentes geram ancoras diferentes", () => {
    assert.notEqual(fingerprint("color: red;"), fingerprint("color: blue;"));
  });

  test("vizinhanca muda quando o entorno muda", () => {
    const outro = [...ARQUIVO];
    outro[1] = "  display: grid;";
    assert.notEqual(contextFingerprint(ARQUIVO, 2), contextFingerprint(outro, 2));
  });
});

describe("reancoragem", () => {
  test("mantem a linha quando nada mudou", () => {
    const comment = comentarioNaLinha(ARQUIVO, 2);
    const resultado = reanchor([comment], ARQUIVO);

    assert.equal(resultado.comments[0]?.line, 2);
    assert.equal(resultado.changed, false);
    assert.equal(resultado.orphans.length, 0);
  });

  test("acompanha a linha quando inserem codigo acima", () => {
    const comment = comentarioNaLinha(ARQUIVO, 2);
    const depois = ["/* cabecalho novo */", "", ...ARQUIVO];

    const resultado = reanchor([comment], depois);

    assert.equal(resultado.comments[0]?.line, 4, "z-index desceu duas linhas");
    assert.equal(resultado.changed, true);
  });

  test("acompanha a linha quando removem codigo acima", () => {
    const comment = comentarioNaLinha(ARQUIVO, 3);
    const depois = [".card {", "  z-index: 10;", "  color: red;", "}"];

    const resultado = reanchor([comment], depois);

    assert.equal(resultado.comments[0]?.line, 2);
  });

  test("tolera reindentacao sem considerar mudanca", () => {
    const comment = comentarioNaLinha(ARQUIVO, 2);
    const depois = ARQUIVO.map((linha) => `    ${linha.trim()}`);

    const resultado = reanchor([comment], depois);

    assert.equal(resultado.comments[0]?.line, 2);
    assert.equal(resultado.orphans.length, 0);
  });

  test("vira orfao quando a linha deixa de existir", () => {
    const comment = comentarioNaLinha(ARQUIVO, 2);
    const depois = [".card {", "  display: flex;", "}"];

    const resultado = reanchor([comment], depois);

    assert.equal(resultado.comments.length, 0);
    assert.equal(resultado.orphans.length, 1);
    assert.equal(resultado.orphans[0]?.text, "nota");
  });

  test("escolhe a ocorrencia mais proxima quando a linha se repete", () => {
    const repetido = ["a;", "x;", "b;", "x;", "c;", "x;"];
    const comment = comentarioNaLinha(repetido, 3);
    const depois = ["novo;", ...repetido];

    const resultado = reanchor([comment], depois);

    assert.equal(resultado.comments[0]?.line, 4, "deve seguir o x; do meio");
  });

  test("ancora comentario em linha em branco pela vizinhanca", () => {
    const comBranco = [".card {", "", "  color: red;", "}"];
    const comment = comentarioNaLinha(comBranco, 1);
    const depois = ["/* topo */", ...comBranco];

    const resultado = reanchor([comment], depois);

    assert.equal(resultado.comments[0]?.line, 2);
    assert.equal(resultado.orphans.length, 0);
  });

  test("processa varios comentarios de uma vez", () => {
    const comentarios = [comentarioNaLinha(ARQUIVO, 1, "um"), comentarioNaLinha(ARQUIVO, 3, "dois")];
    const depois = ["novo;", ...ARQUIVO];

    const resultado = reanchor(comentarios, depois);

    assert.deepEqual(
      resultado.comments.map((item) => item.line),
      [2, 4],
    );
  });
});

describe("arquivo do sidecar", () => {
  test("ida e volta preserva os comentarios", () => {
    const arquivo = {
      version: 1,
      source: "static/css/estilo.css",
      comments: [comentarioNaLinha(ARQUIVO, 2)],
    };

    const relido = parseSidecar(serializeSidecar(arquivo));

    assert.deepEqual(relido, arquivo);
  });

  test("JSON invalido nao derruba a extensao", () => {
    assert.equal(parseSidecar("{ isso nao e json"), undefined);
    assert.equal(parseSidecar("[]"), undefined);
    assert.equal(parseSidecar('{"source": 1}'), undefined);
  });

  test("descarta entradas malformadas e mantem as validas", () => {
    const valido = comentarioNaLinha(ARQUIVO, 1);
    const raw = JSON.stringify({
      version: 1,
      source: "a.css",
      comments: [valido, { id: "x" }, null, "texto"],
    });

    assert.equal(parseSidecar(raw)?.comments.length, 1);
  });

  test("caminho do sidecar espelha o do fonte", () => {
    assert.equal(
      sidecarPathFor("src/app/login.html", ".hidden-comments"),
      ".hidden-comments/src/app/login.html.json",
    );
    assert.equal(sidecarPathFor("/a/b.css", ".hc"), ".hc/a/b.css.json");
  });
});
