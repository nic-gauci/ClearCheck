declare module "jsonpack" {
  interface Jsonpack {
    unpack<T = unknown>(packed:string):T;
  }

  const jsonpack:Jsonpack;
  export default jsonpack;
}
