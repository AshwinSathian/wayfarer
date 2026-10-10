// The QuickJS engine file. Angular's builder copies it out under a hashed
// name (`loader` in angular.json) and the import is that file's address.
declare module "@jitl/quickjs-wasmfile-release-sync/wasm" {
  const location: string;
  export default location;
}
