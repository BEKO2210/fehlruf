declare module "qrcode" {
  interface ToStringOptions {
    type?: "svg" | "utf8" | "terminal";
    margin?: number;
    width?: number;
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
    color?: { dark?: string; light?: string };
  }
  export function toString(text: string, options?: ToStringOptions): Promise<string>;
  const qrcode: { toString: typeof toString };
  export default qrcode;
}
