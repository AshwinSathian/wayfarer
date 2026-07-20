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
  setTheme: (_themeName: string): void => {},
  defineTheme: (_themeName: string, _themeData: MonacoTypes.editor.IStandaloneThemeData): void => {},
};

export const languages = {
  json: {
    jsonDefaults: {
      setDiagnosticsOptions: (_: unknown) => {},
    },
  },
};
