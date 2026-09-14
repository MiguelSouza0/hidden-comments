/**
 * Texto fantasma dos comentarios guardados fora do arquivo.
 *
 * A decoracao existe so no editor: nao entra no documento, nao aparece no
 * `git diff` e nao tem como chegar ao navegador.
 */

import * as vscode from "vscode";

import type { HiddenComment } from "../core/sidecar.ts";

export class GhostComments {
  private readonly decoration = vscode.window.createTextEditorDecorationType({
    after: {
      margin: "0 0 0 1.5rem",
      color: new vscode.ThemeColor("editorGhostText.foreground"),
      fontStyle: "italic",
    },
    isWholeLine: true,
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });

  render(editor: vscode.TextEditor, comments: readonly HiddenComment[]): void {
    const options: vscode.DecorationOptions[] = [];

    for (const comment of comments) {
      if (comment.line >= editor.document.lineCount) {
        continue;
      }

      const line = editor.document.lineAt(comment.line);
      const preview = comment.text.replace(/\s+/g, " ").trim();

      options.push({
        range: line.range,
        hoverMessage: new vscode.MarkdownString(
          `**${comment.author || "?"}** - ${comment.text}`,
        ),
        renderOptions: {
          after: { contentText: `  ${preview}  ` },
        },
      });
    }

    editor.setDecorations(this.decoration, options);
  }

  clear(editor: vscode.TextEditor): void {
    editor.setDecorations(this.decoration, []);
  }

  dispose(): void {
    this.decoration.dispose();
  }
}
