import PropTypes from 'prop-types';
import { Line as CanvasLine } from '2drender';

class Line {
  /**
   * Transform lng lat coordinates to canvas coordinates.
   */
  static coordinateTransformation(map, coordinates) {
    /**
     * Compatible with object coordinates and array coordinates.
     */
    let { lng, lat } = coordinates;
    if (coordinates instanceof Array) {
      [lng, lat] = coordinates;
    }
    /**
     * AMap.LngLat fix lng lat coordinates errors.
     */
    const lngLat = new window.AMap.LngLat(lng, lat);
    const { x, y } = map.lngLatToContainer(lngLat);
    return [x, y];
  }

  /**
   * Transform lng lat coordinates to canvas coordinates.
   */
  static getSnapshotBeforeRender(map) {
    return ({ color, path, width }) => {
      return {
        color,
        path: path.map((coordinates) => {
          return Line.coordinateTransformation(map, coordinates);
        }),
        width,
      };
    };
  }

  constructor(props) {
    const {
      data = [],
      height = 0,
      map,
      opacity = 1,
      width = 0,
      zIndex = 12,
      zooms = [3, 18],
    } = props;

    /**
     * Map instance cannot be changed during lifetime, therefore, it is not memorised by config
     * function.
     */
    this.map = map;
    /**
     * Create canvas.
     */
    this.canvas = window.document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    /**
     * Memorise properties that can be changed during lifetime.
     */
    this.config({
      data,
      height,
      width,
    });
    this.canvasLine = new CanvasLine();
    /**
     * Initialise AMap custom layer.
     */
    window.AMap.plugin('AMap.CustomLayer', () => {
      /**
       * Create AMap custom layer.
       */
      this.customLayer = new window.AMap.CustomLayer(this.canvas, {
        map,
        opacity,
        zIndex,
        zooms,
      });
      /**
       * Assign custom layer's render function so that this function will be called every time
       * canvas needs update.
       */
      this.customLayer.render = this.render.bind(this);
    });
  }

  /**
   * All properties that can be changed during lifetime should be handled by this function.
   * Update ctx and dataset.
   * canvasLine config function is expected to be called every time canvas need update.
   * This is why I don't call canvasLine config function here,
   * instead update private properties of this moudle only.
   */
  config(props) {
    /**
     * This method is used both internally and externally, therefore, we must assign default values.
     */
    const {
      data = [],
      height = 0,
      width = 0,
    } = props;

    this.data = data;
    /**
     * Memorise width and height so that we understand if width or height is updated in lifetime.
     * Change canvas size only if its shape changes.
     */
    if (height !== this.height) {
      this.canvas.height = height;
    }
    if (width !== this.width) {
      this.canvas.width = width;
    }
  }

  /**
   * Remove custom layer.
   */
  destroy() {
    /**
     * In case of custom layer is destroyed before AMap.CustomLayer has loaded.
     */
    if (this.customLayer) this.customLayer.setMap(null);
  }

  /**
   * Render function will be called every time canvas needs update (such as after drag and zoom).
   */
  render() {
    /**
     * Clear canvas.
     */
    this.canvas.width = this.canvas.width;
    this.canvasLine.config({
      ctx: this.ctx,
      data: this.data,
      /**
       * Everytime render function get called, canvas coordinates must get updated to reflect
       * changes.
       * When dataset is large, it takes a considerable time to transform lng lat coordinates to
       * canvas coordinates. getSnapshotBeforeRender takes advantage of none UI blocking skills
       * by invoking transformation function only before a single line is about to render.
       */
      getSnapshotBeforeRender: Line.getSnapshotBeforeRender(this.map),
    });
    /**
     * Call canvas line render function to draw polylines.
     */
    this.canvasLine.render();
  }
}

Line.propTypes = {
  /**
   * A list of polylines.
   */
  data: PropTypes.arrayOf(PropTypes.shape({
    /**
     * Line fill colour.
     * Default transparent.
     */
    color: PropTypes.string.isRequired,
    /**
     * Line path. Supports line string. i.e. [[lng, lat], [lng, lat], [lng, lat]] or
     * [{lng, lat}, {lng, lat}, {lng, lat}]
     */
    path: PropTypes.arrayOf(PropTypes.oneOfType([
      PropTypes.arrayOf(PropTypes.number),
      PropTypes.shape({
        lat: PropTypes.number,
        lng: PropTypes.number,
      }),
    ])).isRequired,
    /**
     * Line width.
     */
    width: PropTypes.number,
  })),
  /**
   * Canvas height.
   * Default 0.
   */
  height: PropTypes.number,
  /**
   * AMap instance.
   */
  map: PropTypes.object.isRequired,
  /**
   * Custom layer opacity.
   * Default 1.
   */
  opacity: PropTypes.number,
  /**
   * Canvas height.
   * Default 0.
   */
  width: PropTypes.number,
  /**
   * Custom layer zIndex.
   * Default 12.
   */
  zIndex: PropTypes.number,
  /**
   * Custom layer visible zoom ranges.
   * Default [3, 18]
   */
  zooms: PropTypes.arrayOf(PropTypes.number),
};

export default Line;
