import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { detectContext, globToRegExp } from "../src/core/detect.ts";

/** Trecho real de templates/base.html do SER (Flask + Jinja). */
const SER_BASE = `<!DOCTYPE html>
<html lang="{{ session.get('idioma', 'pt_BR').replace('_', '-') }}" class="{% if session.get('tema_escuro') %}dark{% endif %}">
<head>
    <meta charset="UTF-8">
    <!-- Cabecalho Principal -->
</head>`;

/** Trecho real de task-card.html do PWeb (Angular). */
const ANGULAR_CARD = `<div
  class="p-3 border rounded bg-white shadow-sm cursor-move"
  [class.opacity-70]="isDragging"
  (dragstart)="onDragStart($event)">
  <div class="font-semibold text-slate-800">{{ task().title }}</div>
</div>`;

describe("deteccao por conteudo", () => {
  test("reconhece template Jinja em arquivo .html comum", () => {
    const detection = detectContext({
      path: "templates/base.html",
      languageId: "html",
      content: SER_BASE,
    });
    assert.equal(detection?.context.id, "jinja");
    assert.equal(detection?.reason, "content");
  });

  test("NAO confunde template Angular com Jinja", () => {
    const detection = detectContext({
      path: "src/app/task-card/task-card.html",
      languageId: "html",
      content: ANGULAR_CARD,
    });
    assert.equal(
      detection?.context.id,
      "html",
      "chaves duplas do Angular nao podem virar Jinja: {# #} apareceria na tela",
    );
    assert.equal(detection?.context.safe, undefined);
  });

  test("reconhece Jinja por comentario ja existente", () => {
    const detection = detectContext({
      path: "partial.html",
      content: "<div>{# ja seguro #}</div>",
    });
    assert.equal(detection?.context.id, "jinja");
  });

  test("reconhece Blade por diretiva", () => {
    const detection = detectContext({
      path: "resources/views/home.html",
      content: "@extends('layouts.app')\n@section('content')",
    });
    assert.equal(detection?.context.id, "blade");
  });

  test("reconhece EJS", () => {
    const detection = detectContext({
      path: "views/index.html",
      content: "<h1><%= titulo %></h1>",
    });
    assert.equal(detection?.context.id, "ejs");
  });
});

describe("deteccao por extensao", () => {
  test("blade tem precedencia sobre php", () => {
    assert.equal(detectContext({ path: "views/home.blade.php" })?.context.id, "blade");
    assert.equal(detectContext({ path: "src/Controller.php" })?.context.id, "php");
  });

  test("mapeia extensoes conhecidas", () => {
    const casos: ReadonlyArray<readonly [string, string]> = [
      ["a/b.scss", "sass"],
      ["a/b.py", "python"],
      ["a/b.java", "cstyle-server"],
      ["a/b.rb", "hash-server"],
      ["a/b.tsx", "jsx"],
      ["a/b.ts", "javascript"],
      ["a/b.css", "css"],
      ["a/b.vue", "vue"],
      ["a/b.twig", "twig"],
      ["a/b.j2", "jinja"],
    ];
    for (const [path, esperado] of casos) {
      assert.equal(detectContext({ path })?.context.id, esperado, path);
    }
  });

  test("extensao nao reconhecida nao devolve contexto", () => {
    assert.equal(detectContext({ path: "README.md" }), undefined);
  });
});

describe("deteccao pelo projeto", () => {
  test("html em templates/ de projeto Flask e Jinja", () => {
    const detection = detectContext({
      path: "app/templates/navbar.html",
      languageId: "html",
      content: "<nav>sem marcacao de motor</nav>",
      markers: { flask: true },
    });
    assert.equal(detection?.context.id, "jinja");
    assert.equal(detection?.reason, "project");
  });

  test("html fora de templates/ nao herda o motor do projeto", () => {
    const detection = detectContext({
      path: "static/pagina.html",
      languageId: "html",
      content: "<div>nada</div>",
      markers: { flask: true },
    });
    assert.equal(detection?.context.id, "html");
  });

  test("sem marcadores de projeto, html continua html", () => {
    const detection = detectContext({
      path: "app/templates/navbar.html",
      languageId: "html",
      content: "<nav>nada</nav>",
    });
    assert.equal(detection?.context.id, "html");
  });
});

describe("override do usuario", () => {
  test("vence todos os outros sinais", () => {
    const detection = detectContext({
      path: "src/app/task-card.html",
      languageId: "html",
      content: ANGULAR_CARD,
      overrides: { "**/*.html": "jinja" },
    });
    assert.equal(detection?.context.id, "jinja");
    assert.equal(detection?.reason, "override");
  });

  test("ignora id de contexto invalido", () => {
    const detection = detectContext({
      path: "a.html",
      languageId: "html",
      overrides: { "**/*.html": "inexistente" },
    });
    assert.equal(detection?.context.id, "html");
  });
});

describe("glob", () => {
  test("padroes comuns", () => {
    assert.ok(globToRegExp("**/*.html").test("a/b/c.html"));
    assert.ok(globToRegExp("**/*.html").test("c.html"));
    assert.ok(globToRegExp("templates/*.html").test("templates/base.html"));
    assert.ok(!globToRegExp("templates/*.html").test("templates/sub/base.html"));
    assert.ok(globToRegExp("src/**").test("src/a/b/c.ts"));
  });
});
