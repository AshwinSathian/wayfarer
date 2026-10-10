// A .wasm file imported for its address: Angular's builder copies it out
// under a hashed name (`loader` in angular.json).
declare module "*.wasm" {
  const location: string;
  export default location;
}
