import type * as MonacoTypes from "monaco-editor";

type Listener = () => void;

class StubDisposable implements MonacoTypes.IDisposable {
  dispose(): void {}
}

class StubModel {
  private value: string;

  constructor(initialValue: string) {
    this.value = initialValue;
  }

  setValue(value: string): void {
    this.value = value;
  }

  getValue(): string {
    return this.value;
  }

  dispose(): void {}
}

class StubEditor {
  constructor(private readonly model: StubModel) {}

  updateOptions(_: unknown): void {}

  onDidChangeModelContent(listener: Listener): StubDisposable {
    listener();
    return new StubDisposable();
  }

  onDidBlurEditorWidget(listener: Listener): StubDisposable {
    listener();
    return new StubDisposable();
  }

  dispose(): void {}
}

export const editor = {
  create: (
    _container: HTMLElement,
    _options?: MonacoTypes.editor.IStandaloneEditorConstructionOptions
  ) =>
    new StubEditor(new StubModel("")) as unknown as MonacoTypes.editor.IStandaloneCodeEditor,
  createModel: (
    value: string,
    _language?: string,
    _uri?: MonacoTypes.Uri
  ) => new StubModel(value) as unknown as MonacoTypes.editor.ITextModel,
  setModelLanguage: (_model: MonacoTypes.editor.ITextModel, _language: string): void => {},
  setTheme: (_themeName: string): void => {},
  defineTheme: (_themeName: string, _themeData: MonacoTypes.editor.IStandaloneThemeData): void => {},
  // What the GraphQL tools ask of the editor (P5.5): no model exists here, and no marker is drawn.
  getModels: (): MonacoTypes.editor.ITextModel[] => [],
  onDidCreateModel: (_listener: (model: MonacoTypes.editor.ITextModel) => void): MonacoTypes.IDisposable => new StubDisposable(),
  onDidChangeModelLanguage: (_listener: (event: { model: MonacoTypes.editor.ITextModel }) => void): MonacoTypes.IDisposable => new StubDisposable(),
  setModelMarkers: (_model: MonacoTypes.editor.ITextModel, _owner: string, _markers: MonacoTypes.editor.IMarkerData[]): void => {},
};

export const MarkerSeverity = { Hint: 1, Info: 2, Warning: 4, Error: 8 } as unknown as typeof MonacoTypes.MarkerSeverity;

export const languages = {
  CompletionItemKind: { Field: 3 } as unknown as typeof MonacoTypes.languages.CompletionItemKind,
  registerCompletionItemProvider: (_language: string, _provider: MonacoTypes.languages.CompletionItemProvider): MonacoTypes.IDisposable => new StubDisposable(),
};

