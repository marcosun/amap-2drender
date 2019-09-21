import copyCanvas from './copyCanvas';

/**
 * Move canvas horizontally and vertically.
 */
export default function moveCanvas(sourceCanvas, deltaX, deltaY) {
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
   */
  sourceCtx.drawImage(tmpCanvas, deltaX, deltaY);

  return sourceCanvas;
}
