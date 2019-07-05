/**
 * Return device pixel ratio. Default to 1.
 * This is used to detect and support RETINA devices.
 */
export default function getDPR() {
  return window.devicePixelRatio || 1;
}
