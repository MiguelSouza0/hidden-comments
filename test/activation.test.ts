/**
 * Teste de fumaca da ativacao.
 *
 * Carrega o bundle empacotado com um modulo `vscode` falso e confere que a
 * extensao sobe e registra o que promete no package.json. Nao substitui o
 * teste manual no Extension Development Host, mas pega o erro mais comum:
 * o bundle que nem chega a ativar.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import Module from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const registeredCommands: string[] = [];

class EventEmitterStub {
  event = () => ({ dispose() {} });
  fire() {}
  dispose() {}
}

const vscodeStub = {
  window: {
    createStatusBarItem: () => ({ show() {}, dispose() {}, text: "", tooltip: "" }),
    createTextEditorDecorationType: () => ({ dispose() {} }),
    registerTreeDataProvider: () => ({ dispose() {} }),
    onDidChangeActiveTextEditor: () => ({ dispose() {} }),
    activeTextEditor: undefined,
    showInformationMessage: () => Promise.resolve(undefined),
    showWarningMessage: () => Promise.resolve(undefined),
  },
  workspace: {
    getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback, update: () => Promise.resolve() }),
    onDidSaveTextDocument: () => ({ dispose() {} }),
    onDidChangeTextDocument: () => ({ dispose() {} }),
    onDidChangeConfiguration: () => ({ dispose() {} }),
    workspaceFolders: undefined,
    asRelativePath: (value: string) => value,
    findFiles: () => Promise.resolve([]),
  },
  commands: {
    registerCommand: (id: string) => {
      registeredCommands.push(id);
      return { dispose() {} };
    },
  },
  languages: {
    createDiagnosticCollection: () => ({ delete() {}, set() {}, dispose() {} }),
    registerCodeActionsProvider: () => ({ dispose() {} }),
  },
  EventEmitter: EventEmitterStub,
  StatusBarAlignment: { Right: 2 },
  ThemeColor: class {},
  ThemeIcon: class { static File = {}; },
  MarkdownString: class {},
  CodeActionKind: { QuickFix: {} },
  DecorationRangeBehavior: { ClosedClosed: 1 },
  TreeItemCollapsibleState: { None: 0, Expanded: 2 },
  ConfigurationTarget: { Global: 1, Workspace: 2 },
  Uri: { joinPath: () => ({}) },
  Position: class {},
  Range: class {},
  Selection: class {},
  Diagnostic: class {},
  DiagnosticSeverity: { Warning: 1, Information: 2 },
  TreeItem: class {},
  CodeAction: class {},
  WorkspaceEdit: class {},
  env: { language: "pt-br" },
  extensions: { getExtension: () => undefined },
};

describe("ativacao da extensao", () => {
  let extension: { activate: (context: unknown) => void; deactivate: () => void };

  before(() => {
    const original = (Module as unknown as { _load: (...args: unknown[]) => unknown })._load;
    (Module as unknown as { _load: (...args: unknown[]) => unknown })._load = (
      ...args: unknown[]
    ) => (args[0] === "vscode" ? vscodeStub : original(...args));

    extension = require("../dist/extension.cjs");
  });

  test("o bundle existe e foi empacotado", () => {
    const bundle = readFileSync(new URL("../dist/extension.cjs", import.meta.url), "utf8");
    assert.ok(bundle.length > 1000);
  });

  test("activate sobe sem lancar erro", () => {
    const subscriptions: unknown[] = [];
    assert.doesNotThrow(() => extension.activate({ subscriptions }));
    assert.ok(subscriptions.length > 0, "deveria registrar recursos para descarte");
  });

  test("registra todos os comandos declarados no package.json", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { contributes: { commands: ReadonlyArray<{ command: string }> } };

    for (const { command } of manifest.contributes.commands) {
      assert.ok(
        registeredCommands.includes(command),
        `comando declarado mas nao registrado: ${command}`,
      );
    }
  });

  test("deactivate nao lanca erro", () => {
    assert.doesNotThrow(() => extension.deactivate());
  });
});
