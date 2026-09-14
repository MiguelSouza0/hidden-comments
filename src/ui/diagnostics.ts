/**
 * Avisos sobre comentarios que estao indo para o navegador.
 *
 * So aponta o que tem conserto: em contexto sem forma segura nao ha o que
 * sugerir, e encher o painel de avisos sem acao possivel so ensinaria o
 * usuario a ignorar a extensao.
 */

import * as vscode from "vscode";

import type { Detection } from "../core/detect.ts";
import { planConversion } from "../core/convert.ts";
import { resolveSafeSyntax } from "../core/languages.ts";
import { t } from "../l10n.ts";

export const DIAGNOSTIC_CODE = "hidden-comments.exposed";

export class ExposedComments implements vscode.CodeActionProvider {
  readonly collection = vscode.languages.createDiagnosticCollection("hiddenComments");

  refresh(document: vscode.TextDocument, detection: Detection | undefined): void {
    const severity = this.severity();

    if (!detection || severity === undefined) {
      this.collection.delete(document.uri);
      return;
    }

    const safe = resolveSafeSyntax(detection.context, { trustBuild: false });
    const plan = planConversion(document.getText(), detection.context);

    if (!safe || plan.length === 0) {
      this.collection.delete(document.uri);
      return;
    }

    const diagnostics = plan.map((replacement) => {
      const range = new vscode.Range(
        document.positionAt(replacement.start),
        document.positionAt(replacement.end),
      );
      const diagnostic = new vscode.Diagnostic(
        range,
        t("diag.exposed", `${safe.open} ... ${safe.close ?? ""}`.trim()),
        severity,
      );
      diagnostic.source = t("diag.source");
      diagnostic.code = DIAGNOSTIC_CODE;
      return diagnostic;
    });

    this.collection.set(document.uri, diagnostics);
  }

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const relevant = context.diagnostics.filter(
      (diagnostic) => diagnostic.code === DIAGNOSTIC_CODE,
    );
    if (relevant.length === 0) {
      return [];
    }

    const action = new vscode.CodeAction(
      t("action.convertFile"),
      vscode.CodeActionKind.QuickFix,
    );
    action.command = {
      command: "hiddenComments.convertFile",
      title: t("action.convertFile"),
      arguments: [document.uri],
    };
    action.diagnostics = relevant;
    void range;
    return [action];
  }

  private severity(): vscode.DiagnosticSeverity | undefined {
    const configured = vscode.workspace
      .getConfiguration("hiddenComments")
      .get<string>("diagnosticsSeverity", "warning");

    if (configured === "off") {
      return undefined;
    }
    return configured === "information"
      ? vscode.DiagnosticSeverity.Information
      : vscode.DiagnosticSeverity.Warning;
  }

  dispose(): void {
    this.collection.dispose();
  }
}
