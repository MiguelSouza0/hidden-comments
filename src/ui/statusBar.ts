/** Item da barra de status: liga/desliga e mostra o contexto do arquivo atual. */

import * as vscode from "vscode";

import type { Detection } from "../core/detect.ts";
import { resolveSafeSyntax } from "../core/languages.ts";
import { t } from "../l10n.ts";

export class StatusBar {
  private readonly item: vscode.StatusBarItem;
  /** Aviso separado, com acao propria: um clique converte o arquivo. */
  private readonly exposed: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = "hiddenComments.toggleEnabled";
    this.item.show();

    this.exposed = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
    this.exposed.command = "hiddenComments.convertFile";
  }

  update(options: {
    readonly enabled: boolean;
    readonly visible: boolean;
    readonly detection: Detection | undefined;
    readonly trustBuild: boolean;
    readonly hiddenCount: number;
    readonly exposedCount: number;
  }): void {
    const { enabled, visible, detection, trustBuild, hiddenCount, exposedCount } = options;

    if (enabled && exposedCount > 0) {
      this.exposed.text = `$(warning) ${t("status.exposed", String(exposedCount))}`;
      this.exposed.tooltip = t("status.exposedTooltip");
      this.exposed.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground",
      );
      this.exposed.show();
    } else {
      this.exposed.hide();
    }

    if (!enabled) {
      this.item.text = `$(eye-closed) ${t("status.off")}`;
      this.item.tooltip = t("status.tooltip");
      this.item.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground",
      );
      return;
    }

    this.item.backgroundColor = undefined;

    const label = detection
      ? detection.context.label
      : t("status.contextUnknown");
    const hidden = visible ? "" : ` ${t("status.hidden")}`;
    const count = hiddenCount > 0 ? ` $(comment) ${t("status.count", String(hiddenCount))}` : "";

    this.item.text = `$(eye) ${t("status.context", label)}${count}${hidden}`;

    const safe = detection
      ? resolveSafeSyntax(detection.context, { trustBuild })
      : undefined;

    this.item.tooltip = new vscode.MarkdownString(
      detection && safe
        ? t("context.safe", detection.context.label, `\`${safe.open}\``)
        : t("context.unsafe", label),
    );
  }

  dispose(): void {
    this.item.dispose();
    this.exposed.dispose();
  }
}
