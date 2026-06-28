/** Ambient module types for dependencies without bundled typings. */

declare module 'imagetracerjs' {
  type Imagedata = { data: Uint8ClampedArray | number[]; width: number; height: number };
  type Options = Record<string, number | string | boolean>;
  interface ImageTracerStatic {
    imagedataToSVG(imagedata: Imagedata, options?: Options | string): string;
    imageToSVG(url: string, callback: (svg: string) => void, options?: Options | string): void;
  }
  const ImageTracer: ImageTracerStatic;
  export default ImageTracer;
}
