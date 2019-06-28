import PropTypes from 'prop-types';
import { isEqual } from 'lodash';
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
      onMouseOut,
      onMouseOver,
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
    this.map.on('mousemove', this.handleMouseMove, this);
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
      onMouseOut,
      onMouseOver,
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
      onMouseOut,
      onMouseOver,
      width = 0,
    } = props;

    this.data = data;
    this.onClick = onClick;
    this.onMouseOut = onMouseOut;
    this.onMouseOver = onMouseOver;
    /**
     * Save grids that pointer is hovering. Compare with previous hover grids to understand
     * whether it is a mouse over or mouse out event.
     */
    this.hoverGrids = [];
    /**
     * Its functionality is very similar to hoverGrids, although it is used to determine
     * cursor style.
     */
    this.hoverStyleGrids = [];
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
   * Propagate mouse over and mouse out events to parent module.
   */
  handleMouseHover(event) {
    /**
     * Finding hovering grids is a time consuming task. Run the task only if either mouse over
     * or mouse out event is hooked.
     */
    if (typeof this.onMouseOver === 'function' || typeof this.onMouseOut === 'function') {
      const grids = this.canvasGrid.findByPosition(event.pixel);

      if (grids.length > this.hoverGrids.length) {
        /**
         * An increasing grid length is a concrete signal of a mouse over event.
         */
        if (typeof this.onMouseOver === 'function') {
          this.onMouseOver(event, grids);
        }
      } else if (grids.length < this.hoverGrids.length) {
        /**
         * A dropping grid length is a concrete signal of a mouse out event.
         */
        if (typeof this.onMouseOut === 'function') {
          this.onMouseOut(event, grids);
        }
      } else if (!isEqual(grids, this.hoverGrids)) {
        /**
         * If grid length does not change, there could be two reasons:
         * 1. pointer is not moving out of any grids.
         * 2. pointer is moving to other grids however the number of grids does not change.
         * If grids pass deep equality check, it means point is not moving out of any grids,
         * fails otherwise.
         * For scenario two, mouse out event is fired before mouse over event to notify the hovering
         * grid being changed.
         */
        if (typeof this.onMouseOut === 'function') {
          this.onMouseOut(event, grids);
        }
        if (typeof this.onMouseOver === 'function') {
          this.onMouseOver(event, grids);
        }
      }

      this.hoverGrids = grids;
    }
  }

  /**
   * Change cursor style if mouse events are being watched.
   */
  handleMouseHoverStyle(event) {
    /**
     * Finding hovering grids is a time consuming task. Run the task only if at least one of mouse
     * events is hooked.
     */
    if (typeof this.onClick === 'function'
      || typeof this.onDoubleClick === 'function'
      || typeof this.onMouseOver === 'function'
      || typeof this.onMouseOut === 'function'
    ) {
      const grids = this.canvasGrid.findByPosition(event.pixel);

      /**
       * Change cursor to pointer if mouse moves on at least one grid.
       */
      if (this.hoverStyleGrids.length === 0 && grids.length > 0) {
        this.map.setDefaultCursor('pointer');
      }

      /**
       * Change cursor to AMap default style if mouse leaves all grids.
       */
      if (this.hoverStyleGrids.length > 0 && grids.length === 0) {
        this.map.setDefaultCursor();
      }

      this.hoverStyleGrids = grids;
    }
  }

  handleMouseMove(event) {
    /**
     * Propagate mouse over and mouse out events to parent module.
     */
    this.handleMouseHover(event);
    /**
     * Change cursor style if mouse events are being watched.
     */
    this.handleMouseHoverStyle(event);
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
   * Callback fired when pointer leaves the element or one of its child elements (even if
   * the pointer is still within the element).
   * Signature:
   * (event, grids) => void
   * event: AMap MapsEvent object.
   * grids: A list of grids that pointer overs. Grids with the earlier position in the data
   * array are positioned later in the mouse over callback. This is because grids appear later
   * in the data array are drawn later and has a higher priority when mouse over.
   */
  onMouseOut: PropTypes.func,
  /**
   * Callback fired when pointer moves onto the element or one of its child elements (even if
   * the pointer is still within the element).
   * Signature:
   * (event, grids) => void
   * event: AMap MapsEvent object.
   * grids: A list of grids that pointer overs. Grids with the earlier position in the data
   * array are positioned later in the mouse over callback. This is because grids appear later
   * in the data array are drawn later and has a higher priority when mouse over.
   */
  onMouseOver: PropTypes.func,
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
