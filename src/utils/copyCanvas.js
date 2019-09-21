/**
 * Create a new copy of canvas.
 */
export default function copyCanvas(sourceCanvas) {
  /**
   * Create a new canvas object.
   */
  const destinationCanvas = document.createElement('canvas');
  const destinationCtx = destinationCanvas.getContext('2d');
  /**
   * Size of the destination canvas is identical to source canvas.
   */
  destinationCanvas.height = sourceCanvas.height;
  destinationCanvas.width = sourceCanvas.width;
  /**
   * Copy canvas image.
   */
  destinationCtx.drawImage(sourceCanvas, 0, 0);

  return destinationCanvas;
}
