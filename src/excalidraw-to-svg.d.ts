export interface ExcalidrawToSvgOptions {
  /** Timeout in milliseconds for the worker conversion */
  timeoutMs?: number;
  /** AbortSignal to cancel the conversion */
  signal?: AbortSignal;
}

/**
 * Convert an Excalidraw diagram JSON to an SVG element.
 *
 * @param diagram - Excalidraw diagram as a JSON string or parsed object
 * @param options - Optional timeout and abort signal
 * @returns A promise that resolves to an SVGSVGElement
 */
declare function excalidrawToSvg(
  diagram: string | object,
  options?: ExcalidrawToSvgOptions
): Promise<SVGSVGElement>;

export default excalidrawToSvg;
