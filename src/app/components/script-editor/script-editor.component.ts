import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  effect,
  forwardRef,
  inject,
  input,
  output,
  viewChild
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { NG_VALUE_ACCESSOR, ControlValueAccessor } from "@angular/forms";
import { ThemeService } from "../../services/theme.service";
import type * as MonacoTypes from "monaco-editor";
import {
  MonacoEditorModule,
  defineSandboxThemes,
  loadMonaco,
  loadedMonaco,
  monacoThemeName,
  waitForNonZeroWidth,
} from "../../shared/monaco/monaco-loader";

// eslint-disable-next-line @typescript-eslint/no-empty-function -- ControlValueAccessor default before registerOnChange/registerOnTouched wires the real callback
const noop = () => {};

@Component({
  selector: "app-script-editor",
  standalone: true,
  imports: [CommonModule],
  host: {
    class: "block w-full",
  },
  template: `
    <!-- "on timer(400ms)" fallback: see json-editor.component.ts's template
         comment — "on viewport" alone reproducibly missed its trigger under
         rapid structural churn (viewport/tab transitions), leaving the
         editor permanently stuck on the placeholder below. -->
    <div [style.height.px]="height() ?? 200">
      @defer (on viewport; on timer(400ms)) {
        <div
          #editorHost
          class="h-full w-full overflow-hidden rounded-lg bg-canvas-panel"
        ></div>
      } @placeholder {
        <div class="flex h-full w-full items-center justify-center rounded-md bg-canvas-elevated type-callout text-label-tertiary">
          Loading editor…
        </div>
      }
    </div>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => ScriptEditorComponent),
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScriptEditorComponent
  implements ControlValueAccessor, OnChanges, OnDestroy
{
  readonly height = input<number | null>(null);
  readonly readOnly = input(false);
  readonly valueChange = output<string>();

  readonly editorHost = viewChild<ElementRef<HTMLDivElement>>("editorHost");

  private editorInstance: MonacoTypes.editor.IStandaloneCodeEditor | null = null;
  private model: MonacoTypes.editor.ITextModel | null = null;
  private monacoModule: MonacoEditorModule | null = null;
  private internalValue = "";
  private onChange: (val: string) => void = noop;
  private onTouched: () => void = noop;
  private isUpdatingFromEditor = false;
  private destroyed = false;

  private readonly themeService = inject(ThemeService);

  constructor() {
    effect(() => {
      const theme = this.themeService.theme();
      if (loadedMonaco) {
        loadedMonaco.editor.setTheme(monacoThemeName(theme));
      }
    });

    // Signal-driven replacement for the old @ViewChild setter: fires once
    // the @defer'd host element mounts (and again on any later re-mount).
    effect(() => {
      const host = this.editorHost();
      if (host) {
        void this.initializeEditor();
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ("readOnly" in changes && this.editorInstance) {
      this.editorInstance.updateOptions({ readOnly: this.readOnly() });
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.editorInstance?.dispose();
    this.model?.dispose();
    this.editorInstance = null;
    this.model = null;
  }

  // ControlValueAccessor
  writeValue(value: string | null | undefined): void {
    const str = value ?? "";
    this.internalValue = str;
    if (this.model && !this.isUpdatingFromEditor) {
      const current = this.model.getValue();
      if (current !== str) {
        this.model.setValue(str);
      }
    }
  }

  registerOnChange(fn: (val: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.editorInstance?.updateOptions({ readOnly: disabled });
  }

  private async initializeEditor(): Promise<void> {
    const host = this.editorHost();
    if (this.editorInstance || !host) {
      return;
    }
    const hostEl = host.nativeElement;

    const [monacoModule] = await Promise.all([
      loadMonaco(),
      waitForNonZeroWidth(hostEl),
    ]);
    if (this.destroyed || this.editorInstance || !this.editorHost()) {
      // Disposed, or a concurrent call already initialized, while awaiting.
      return;
    }
    this.monacoModule = monacoModule;
    const monaco = this.monacoModule;

    defineSandboxThemes(monaco);

    this.model =
      this.model ??
      monaco.editor.createModel(this.internalValue, "javascript", undefined);

    this.editorInstance = monaco.editor.create(host.nativeElement, {
      model: this.model,
      automaticLayout: true,
      minimap: { enabled: false },
      theme: monacoThemeName(this.themeService.theme()),
      fontSize: 13,
      lineNumbers: "on",
      scrollBeyondLastLine: false,
      wordWrap: "on",
      readOnly: this.readOnly(),
      tabSize: 2,
      insertSpaces: true,
    });

    this.model.onDidChangeContent(() => {
      const value = this.model!.getValue();
      this.isUpdatingFromEditor = true;
      this.internalValue = value;
      this.onChange(value);
      this.valueChange.emit(value);
      this.isUpdatingFromEditor = false;
    });

    this.editorInstance.onDidBlurEditorText(() => this.onTouched());
  }
}
