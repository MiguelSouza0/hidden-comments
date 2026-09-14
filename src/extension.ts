/**
 * Ponto de entrada da extensao: liga o nucleo puro a interface do VS Code.
 *
 * Regra que orienta o arquivo inteiro: o comentario so vai para dentro do
 * arquivo-fonte quando o contexto garante que ele nao chega ao navegador. Em
 * qualquer outra situacao -- inclusive quando a deteccao nao tem certeza --
 * o texto vai para o sidecar, que e seguro em todo tipo de arquivo.
 */

import { userInfo } from "node:os";

import * as vscode from "vscode";

import { formatComment } from "./core/comment.ts";
import { planConversion } from "./core/convert.ts";
import type { Detection } from "./core/detect.ts";
import { resolveSafeSyntax } from "./core/languages.ts";
import { createComment } from "./core/sidecar.ts";
import { t } from "./l10n.ts";
import { GhostComments } from "./ui/decorations.ts";
import { ExposedComments } from "./ui/diagnostics.ts";
import { StatusBar } from "./ui/statusBar.ts";
import { CommentTree } from "./ui/tree.ts";
import { SidecarStore, clearMarkerCache, detectForDocument } from "./workspace.ts";

/** Extensoes que podem ter comentario convertivel, para a varredura do projeto. */
const CONVERTIBLE_GLOB =
  "**/*.{html,htm,twig,njk,j2,jinja,jinja2,hbs,handlebars,ejs,pug,jade,scss,sass,less,blade.php}";

function config() {
  return vscode.workspace.getConfiguration("hiddenComments");
}

function isEnabled(): boolean {
  return config().get<boolean>("enabled", true);
}

function ghostVisible(): boolean {
  return config().get<boolean>("showGhostComments", true);
}

function trustBuild(): boolean {
  return config().get<boolean>("trustBuildForSourceMaps", false);
}

/** Nome exibido junto ao comentario; cai no usuario do sistema se nao houver. */
function authorName(): string {
  const configured = config().get<string>("author", "").trim();
  return configured !== "" ? configured : (userInfo().username ?? "");
}

export function activate(context: vscode.ExtensionContext): void {
  const store = new SidecarStore();
  const statusBar = new StatusBar();
  const ghosts = new GhostComments();
  const diagnostics = new ExposedComments();
  const tree = new CommentTree(store);

  context.subscriptions.push(statusBar, ghosts, diagnostics, tree);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("hiddenComments.tree", tree),
  );
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider({ scheme: "file" }, diagnostics, {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }),
  );

  async function refresh(editor = vscode.window.activeTextEditor): Promise<void> {
    if (!editor) {
      statusBar.update({
        enabled: isEnabled(),
        visible: ghostVisible(),
        detection: undefined,
        trustBuild: trustBuild(),
      });
      return;
    }

    const enabled = isEnabled();
    const detection = enabled ? await detectForDocument(editor.document) : undefined;

    statusBar.update({
      enabled,
      visible: ghostVisible(),
      detection,
      trustBuild: trustBuild(),
    });

    if (!enabled) {
      ghosts.clear(editor);
      diagnostics.collection.delete(editor.document.uri);
      return;
    }

    diagnostics.refresh(editor.document, detection);

    if (ghostVisible()) {
      ghosts.render(editor, await store.load(editor.document));
    } else {
      ghosts.clear(editor);
    }
  }

  // --------------------------------------------------------------- comandos

  async function addComment(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showWarningMessage(t("msg.noEditor"));
      return;
    }
    if (!isEnabled()) {
      void vscode.window.showWarningMessage(t("msg.disabled"));
      return;
    }

    const text = await vscode.window.showInputBox({
      prompt: t("prompt.comment"),
      placeHolder: t("prompt.commentPlaceholder"),
    });
    if (!text) {
      return;
    }

    const detection = await detectForDocument(editor.document);
    const safe = detection
      ? resolveSafeSyntax(detection.context, { trustBuild: trustBuild() })
      : undefined;

    if (detection && safe) {
      await insertInline(editor, safe, text);
      void vscode.window.showInformationMessage(
        t("msg.insertedSafe", `\`${safe.open}\``),
      );
    } else {
      await storeInSidecar(editor, text);
      void vscode.window.showInformationMessage(explainSidecar(detection));
    }

    await refresh(editor);
    tree.refresh();
  }

  async function insertInline(
    editor: vscode.TextEditor,
    syntax: { readonly open: string; readonly close?: string },
    text: string,
  ): Promise<void> {
    const line = editor.document.lineAt(editor.selection.active.line);
    const indent = line.text.slice(0, line.firstNonWhitespaceCharacterIndex);
    const comment = formatComment(syntax, text, { indent });

    await editor.edit((builder) => {
      builder.insert(new vscode.Position(line.lineNumber, 0), `${indent}${comment}\n`);
    });
  }

  async function storeInSidecar(
    editor: vscode.TextEditor,
    text: string,
  ): Promise<void> {
    if (!vscode.workspace.getWorkspaceFolder(editor.document.uri)) {
      void vscode.window.showWarningMessage(t("msg.noEditor"));
      return;
    }

    const comment = createComment({
      lines: editor.document.getText().split("\n"),
      line: editor.selection.active.line,
      text,
      author: authorName(),
    });

    await store.add(editor.document, comment);
  }

  function explainSidecar(detection: Detection | undefined): string {
    if (!detection) {
      return t("msg.sidecarUnknown");
    }
    if (detection.context.buildDependent) {
      return t("msg.buildDependent", detection.context.label);
    }
    return t("msg.insertedSidecar", detection.context.label);
  }

  async function toggle(key: "enabled" | "showGhostComments"): Promise<void> {
    const current = config().get<boolean>(key, true);
    const target = vscode.workspace.workspaceFolders
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;

    await config().update(key, !current, target);
    await refresh();
  }

  async function convert(uris: readonly vscode.Uri[]): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    let total = 0;
    let unsupported: string | undefined;

    for (const uri of uris) {
      const document = await vscode.workspace.openTextDocument(uri);
      const detection = await detectForDocument(document);
      if (!detection) {
        continue;
      }

      const plan = planConversion(document.getText(), detection.context);
      if (plan.length === 0) {
        if (uris.length === 1 && !resolveSafeSyntax(detection.context, { trustBuild: false })) {
          unsupported = detection.context.label;
        }
        continue;
      }

      for (const replacement of plan) {
        edit.replace(
          uri,
          new vscode.Range(
            document.positionAt(replacement.start),
            document.positionAt(replacement.end),
          ),
          replacement.text,
          { needsConfirmation: true, label: replacement.text },
        );
        total += 1;
      }
    }

    if (total === 0) {
      void vscode.window.showInformationMessage(
        unsupported ? t("msg.convertNotSupported", unsupported) : t("msg.convertClean"),
      );
      return;
    }

    await vscode.workspace.applyEdit(edit, { isRefactoring: true });
    void vscode.window.showInformationMessage(t("msg.convertReady", String(total)));
  }

  async function scan(uris: readonly vscode.Uri[], label: string): Promise<void> {
    let comments = 0;
    let files = 0;

    for (const uri of uris) {
      const document = await vscode.workspace.openTextDocument(uri);
      const detection = await detectForDocument(document);
      if (!detection) {
        continue;
      }
      const plan = planConversion(document.getText(), detection.context);
      if (plan.length > 0) {
        comments += plan.length;
        files += 1;
      }
    }

    if (comments === 0) {
      void vscode.window.showInformationMessage(t("msg.scanClean", label));
      return;
    }

    const action = await vscode.window.showWarningMessage(
      t("msg.scanFound", String(comments), String(files)),
      t("action.convert"),
    );
    if (action) {
      await convert(uris);
    }
  }

  function activeUri(): vscode.Uri | undefined {
    return vscode.window.activeTextEditor?.document.uri;
  }

  async function workspaceCandidates(): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles(CONVERTIBLE_GLOB, "**/{node_modules,dist,build,.venv,vendor}/**");
  }

  const commands: ReadonlyArray<readonly [string, (...args: never[]) => unknown]> = [
    ["hiddenComments.add", addComment],
    ["hiddenComments.toggleEnabled", () => toggle("enabled")],
    ["hiddenComments.toggleVisibility", () => toggle("showGhostComments")],
    ["hiddenComments.refreshTree", () => tree.refresh()],
    [
      "hiddenComments.scanFile",
      async () => {
        const uri = activeUri();
        if (uri) {
          await scan([uri], vscode.workspace.asRelativePath(uri, false));
        }
      },
    ],
    [
      "hiddenComments.scanWorkspace",
      async () => scan(await workspaceCandidates(), vscode.workspace.name ?? ""),
    ],
    [
      "hiddenComments.convertFile",
      async (target?: vscode.Uri) => {
        const uri = target ?? activeUri();
        if (uri) {
          await convert([uri]);
        }
      },
    ],
    [
      "hiddenComments.convertWorkspace",
      async () => convert(await workspaceCandidates()),
    ],
    [
      "hiddenComments.showContext",
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          void vscode.window.showWarningMessage(t("msg.noEditor"));
          return;
        }
        const detection = await detectForDocument(editor.document);
        const safe = detection
          ? resolveSafeSyntax(detection.context, { trustBuild: trustBuild() })
          : undefined;
        void vscode.window.showInformationMessage(
          detection && safe
            ? t("context.safe", detection.context.label, `${safe.open} ... ${safe.close ?? ""}`.trim())
            : t("context.unsafe", detection?.context.label ?? t("status.contextUnknown")),
        );
      },
    ],
    [
      "hiddenComments.openComment",
      async (source?: string, line?: number) => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder || source === undefined) {
          return;
        }
        const uri = vscode.Uri.joinPath(folder.uri, source);
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document);
        const position = new vscode.Position(line ?? 0, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position));
      },
    ],
    [
      "hiddenComments.editComment",
      async (node?: { readonly comment?: { readonly id: string; readonly text: string }; readonly source?: string }) => {
        if (!node?.comment || !node.source) {
          return;
        }
        const text = await vscode.window.showInputBox({
          prompt: t("prompt.edit"),
          value: node.comment.text,
        });
        if (text === undefined) {
          return;
        }
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) {
          return;
        }
        const document = await vscode.workspace.openTextDocument(
          vscode.Uri.joinPath(folder.uri, node.source),
        );
        await store.update(document, node.comment.id, text);
        tree.refresh();
        await refresh();
      },
    ],
    [
      "hiddenComments.deleteComment",
      async (node?: { readonly comment?: { readonly id: string }; readonly source?: string }) => {
        if (!node?.comment || !node.source) {
          return;
        }
        const confirmed = await vscode.window.showWarningMessage(
          t("confirm.delete"),
          { modal: true },
          t("confirm.yes"),
        );
        if (!confirmed) {
          return;
        }
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) {
          return;
        }
        const document = await vscode.workspace.openTextDocument(
          vscode.Uri.joinPath(folder.uri, node.source),
        );
        await store.remove(document, node.comment.id);
        void vscode.window.showInformationMessage(t("msg.deleted"));
        tree.refresh();
        await refresh();
      },
    ],
  ];

  for (const [id, handler] of commands) {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, handler as (...args: unknown[]) => unknown),
    );
  }

  // -------------------------------------------------------------- ouvintes

  let pending: NodeJS.Timeout | undefined;

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => void refresh(editor)),
    vscode.workspace.onDidSaveTextDocument(() => {
      void refresh();
      tree.refresh();
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document !== vscode.window.activeTextEditor?.document) {
        return;
      }
      // Agrupa as teclas digitadas: revarrer a cada caractere trava o editor.
      clearTimeout(pending);
      pending = setTimeout(() => void refresh(), 400);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("hiddenComments")) {
        clearMarkerCache();
        void refresh();
        tree.refresh();
      }
    }),
  );

  void refresh();
}

export function deactivate(): void {
  // Os recursos sao liberados por context.subscriptions.
}
