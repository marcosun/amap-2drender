import copyCanvas from './copyCanvas';

/**
 * Move canvas horizontally and vertically.
 */
export default function moveCanvas({
  canvas: sourceCanvas,
  deltaX,
  deltaY,
  dpr = 1,
}) {
  const sourceCtx = sourceCanvas.getContext('2d');
  /**
   * Create a copy of source canvas.
   */
  const tmpCanvas = copyCanvas(sourceCanvas);
  /**
   * Clear source canvas.
   */
  sourceCanvas.width = sourceCanvas.width;
  /**
   * On an empty canvas, draw transformed canvas image.
   * Moving distance should reflect device pixel ratio.
   */
  sourceCtx.drawImage(tmpCanvas, deltaX * dpr, deltaY * dpr);

  return sourceCanvas;
}
