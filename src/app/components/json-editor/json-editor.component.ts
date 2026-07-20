import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  effect,
  forwardRef,
  inject,
  input,
  output
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ThemeService } from "../../services/theme.service";
import {
  ControlValueAccessor,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  ValidationErrors,
  Validator,
} from "@angular/forms";
import type * as MonacoTypes from "monaco-editor";
import {
  MonacoEditorModule,
  defineSandboxThemes,
  loadMonaco,
  loadedMonaco,
  monacoThemeName,
} from "../../shared/monaco/monaco-loader";

// eslint-disable-next-line @typescript-eslint/no-empty-function -- ControlValueAccessor default before registerOnChange/registerOnTouched wires the real callback
const noop = () => {};

@Component({
  selector: "app-json-editor",
  standalone: true,
  imports: [CommonModule],
  host: {
    class: "block w-full min-h-[200px]",
  },
  template: `
    <div
      class="h-full w-full"
      [style.height.px]="height() ?? defaultHeight"
    >
      @defer (on viewport) {
        <div
          #editorHost
          class="h-full w-full overflow-hidden rounded-lg bg-canvas-panel"
        ></div>
      } @placeholder {
        <div
          class="flex h-full w-full items-center justify-center rounded-md bg-canvas-elevated type-callout text-label-tertiary"
        >
          Loading editor…
        </div>
      }
    </div>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => JsonEditorComponent),
    },
    {
      provide: NG_VALIDATORS,
      multi: true,
      useExisting: forwardRef(() => JsonEditorComponent),
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JsonEditorComponent
  implements ControlValueAccessor, Validator, OnChanges, OnDestroy
{
  private readonly themeService = inject(ThemeService);

  readonly readOnly = input(false);
  readonly height = input<number>();
  readonly schemaUri = input<string>();
  readonly schema = input<unknown>();

  readonly jsonValidChange = output<boolean>();
  readonly parsedChange = output<unknown>();

  @ViewChild("editorHost")
  set editorHost(host: ElementRef<HTMLDivElement> | undefined) {
    this.editorHostRef = host;
    if (host) {
      void this.initializeEditor();
    }
  }

  private editorHostRef?: ElementRef<HTMLDivElement>;

  private monacoModule: MonacoEditorModule | null = null;

  constructor() {
    effect(() => {
      const theme = this.themeService.theme();
      if (loadedMonaco) {
        loadedMonaco.editor.setTheme(monacoThemeName(theme));
      }
    });
  }
  private editorInstance: MonacoTypes.editor.IStandaloneCodeEditor | null = null;
  private model: MonacoTypes.editor.ITextModel | null = null;
  private disabled = false;
  private internalValue = "";
  private isJsonValid = true;
  private propagateChange: (value: string) => void = noop;
  private propagateTouched: () => void = noop;
  readonly defaultHeight = 320;

  ngOnChanges(changes: SimpleChanges): void {
    if ("readOnly" in changes && this.editorInstance) {
      this.editorInstance.updateOptions({ readOnly: this.readOnly() || this.disabled });
    }

    if (
      ("schema" in changes || "schemaUri" in changes) &&
      this.monacoModule
    ) {
      this.applySchemaDiagnostics();
    }
  }

  writeValue(value: unknown): void {
    this.internalValue =
      typeof value === "string"
        ? value
        : value == null
        ? ""
        : this.stringifyValue(value);

    if (this.model) {
      this.model.setValue(this.internalValue);
    }
    this.validateCurrentValue();
  }

  registerOnChange(fn: (value: string) => void): void {
    this.propagateChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.propagateTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    if (this.editorInstance) {
      this.editorInstance.updateOptions({
        readOnly: this.readOnly() || this.disabled,
      });
    }
  }

  validate(): ValidationErrors | null {
    return this.isJsonValid ? null : { jsonInvalid: true };
  }

  ngOnDestroy(): void {
    if (this.editorInstance) {
      this.editorInstance.dispose();
      this.editorInstance = null;
    }
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
  }

  private async initializeEditor(): Promise<void> {
    if (this.editorInstance || !this.editorHostRef) {
      return;
    }

    this.monacoModule = await loadMonaco();
    const monaco = this.monacoModule;

    defineSandboxThemes(monaco);
    this.applySchemaDiagnostics();

    this.model =
      this.model ??
      monaco.editor.createModel(this.internalValue, "json", undefined);

    this.editorInstance = monaco.editor.create(this.editorHostRef.nativeElement, {
      model: this.model,
      automaticLayout: true,
      minimap: { enabled: false },
      theme: monacoThemeName(this.themeService.theme()),
      wordWrap: "on",
      readOnly: this.readOnly() || this.disabled,
    });

    this.editorInstance.onDidChangeModelContent(() => {
      const value = this.model?.getValue() ?? "";
      this.handleEditorValueChange(value);
    });

    this.editorInstance.onDidBlurEditorWidget(() => {
      this.propagateTouched();
    });

    this.validateCurrentValue();
  }

  private handleEditorValueChange(value: string): void {
    this.internalValue = value;
    this.propagateChange(value);
    this.validateCurrentValue();
  }

  private validateCurrentValue(): void {
    if (this.readOnly()) {
      if (!this.isJsonValid) {
        this.isJsonValid = true;
        this.jsonValidChange.emit(true);
      }
      this.parsedChange.emit(undefined);
      return;
    }

    const { isValid, parsed } = this.tryParseJson(this.internalValue);
    const validityChanged = isValid !== this.isJsonValid;
    this.isJsonValid = isValid;

    if (validityChanged) {
      this.jsonValidChange.emit(isValid);
    }

    if (isValid) {
      this.parsedChange.emit(parsed);
    } else {
      this.parsedChange.emit(undefined);
    }
  }

  private applySchemaDiagnostics(): void {
    if (!this.monacoModule) {
      return;
    }
    const monaco = this.monacoModule;

    const schemaUri = this.schemaUri();
    const schema = this.schema();
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      allowComments: true,
      validate: true,
      enableSchemaRequest: !!this.schemaUri(),
      schemas:
        schema && schemaUri
          ? [
              {
                uri: schemaUri,
                fileMatch: ["*"],
                schema: schema,
              },
            ]
          : [],
    });
  }

  private stringifyValue(value: unknown): string {
    try {
      return JSON.stringify(value, undefined, 2);
    } catch {
      return "";
    }
  }

  private tryParseJson(value: string): { isValid: boolean; parsed: unknown } {
    if (!value.trim()) {
      return { isValid: true, parsed: undefined };
    }
    try {
      return { isValid: true, parsed: JSON.parse(value) };
    } catch {
      return { isValid: false, parsed: undefined };
    }
  }
}
