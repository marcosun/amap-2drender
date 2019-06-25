import PropTypes from 'prop-types';
import { Grid as CanvasGrid } from '2drender';

class Grid {
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

  constructor(props) {
    const {
      data = [],
      height = 0,
      map,
      onClick,
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
     * Hook map click event.
     */
    this.map.on('click', this.handleClick, this);
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
      onClick,
      width,
    });
    this.canvasGrid = new CanvasGrid();
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
   * Update ctx, dataset, and event callbacks.
   * canvasGrid config function is expected to be called every time canvas need update.
   * This is why I don't call canvasGrid config function here,
   * instead update private properties of this moudle only.
   */
  config(props) {
    /**
     * This method is used both internally and externally, therefore, we must assign default values.
     */
    const {
      data = [],
      height = 0,
      onClick,
      width = 0,
    } = props;

    this.data = data;
    this.onClick = onClick;
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
   * Propagate click event to parent module if onClick event handler is defined.
   */
  handleClick(event) {
    if (this.onClick) {
      const clickedGrids = this.canvasGrid.findByPosition(event.pixel);

      if (clickedGrids.length !== 0) {
        this.onClick(event, clickedGrids);
      }
    }
  }

  /**
   * Render function will be called every time canvas needs update (such as after drag and zoom).
   */
  render() {
    /**
     * Clear canvas.
     */
    this.canvas.width = this.canvas.width;
    this.canvasGrid.config({
      ctx: this.ctx,
      /**
       * Everytime render function get called, canvas coordinates must get updated to reflect
       * changes.
       */
      data: this.data.map((grid) => {
        const { bottomRight, topLeft } = grid;
        /**
         * Transform lng lat coordinates to canvas coordinates.
         */
        const [x1, y1] = Grid.coordinateTransformation(this.map, bottomRight);
        const [x0, y0] = Grid.coordinateTransformation(this.map, topLeft);

        return {
          /**
           * Pass all other properties to canvasGrid. This entire object will be returned when
           * calling findByPosition function.
           */
          ...grid,
          /**
           * Get height and width from canvas coordinates.
           */
          height: y1 - y0,
          origin: [x0, y0],
          width: x1 - x0,
        };
      }),
    });
    /**
     * Call canvas grid render function to draw grids.
     */
    this.canvasGrid.render();
  }
}

Grid.propTypes = {
  /**
   * A list of grids.
   * Grid definitions include grid shape and styles.
   */
  data: PropTypes.arrayOf(PropTypes.shape({
    /**
     * Grid border colour.
     */
    borderColor: PropTypes.string,
    /**
     * Grid bottom right corner lng lat coordinates.
     */
    bottomRight: PropTypes.arrayOf(PropTypes.number),
    /**
     * Grid fill colour.
     */
    color: PropTypes.string.isRequired,
    /**
     * Grid top left corner lng lat coordinates.
     */
    topLeft: PropTypes.arrayOf(PropTypes.number),
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
   * Callback fired when at least a grid is clicked.
   * Signature:
   * (event, grids) => void
   * event: AMap MapsEvent object.
   * grids: A list of grids that is clicked. Grids with the earlier position in the data array
   * are positioned later in the click callback. This is because grids appear later in the data
   * array are drawn later and has a higher priority when clicked.
   */
  onClick: PropTypes.func,
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

export default Grid;
