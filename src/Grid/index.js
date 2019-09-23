import PropTypes from 'prop-types';
import { isEqual } from 'lodash';
import { Grid as CanvasGrid } from '2drender';
import getDPR from '../utils/getDPR';
import isNullVoid from '../utils/isNullVoid';
import moveCanvas from '../utils/moveCanvas';

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
     * Get device pixel ratio. It is critical to support RETINA devices.
     * DPR shall not change during lifetime, which means dragging browser from lower DPR device to
     * higher DPR device results blurred images. In this case, user must perform refresh in higher
     * DPR devices.
     */
    this.dpr = getDPR();

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
     * Do not render canvas if map is dragging.
     */
    this.map.on('dragend', this.handleDragEnd, this);
    this.map.on('dragstart', this.handleDragStart, this);
    this.map.on('touchend', this.handleDragEnd, this);
    this.map.on('touchstart', this.handleDragStart, this);

    /**
     * Do not render canvas if map is dragging.
     */
    this.isDragging = false;

    /**
     * Create canvas.
     */
    this.canvas = window.document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    /**
     * A Daemon is a programme that runs as a background process, rather than being under the direct
     * control of an interactive user.
     * With underlying Marker, hundreds of thousands of UI elements are rendered asynchronously by
     * taking advantage of CPU idle time. This beautiful animation is attractive for the initial
     * render. However, all following re-renders, such as dragging, UI elements position changing,
     * and etc, breaks logical links with the previous state with this animation.
     * Keeping visible canvas frozen, while rendering UI elements at background and display
     * daemon canvas as soon as it completes prevents unnecessary UI elements flash.
     */
    this.daemonCanvas = document.createElement('canvas');
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
      this.customLayer.render = this.internalRender.bind(this);
    });
  }

  /**
   * All properties that can be changed during lifetime should be handled by this function.
   * Update ctx, dataset, and event callbacks.
   */
  config(props) {
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
     * Memorise width and height so that we understand if width or height is updated in lifetime.
     * Change canvas size only if its shape changes.
     */
    if (height !== this.height) {
      this.height = height;
      /**
       * Set CSS value to scale down by dpr value to make image sharp.
       */
      this.canvas.style.height = `${height}px`;
    }
    if (width !== this.width) {
      this.width = width;
      /**
       * Set CSS value to scale down by dpr value to make image sharp.
       */
      this.canvas.style.width = `${width}px`;
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
    /**
     * Remove event hooks.
     * https://github.com/marcosun/amap-2drender/issues/1
     */
    this.map.off('click', this.handleClick, this);
    this.map.off('dragend', this.handleDragEnd, this);
    this.map.off('dragstart', this.handleDragStart, this);
    this.map.off('mousemove', this.handleMouseMove, this);
    this.map.off('touchend', this.handleDragEnd, this);
    this.map.off('touchstart', this.handleDragStart, this);
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

  handleDragEnd() {
    this.isDragging = false;
  }

  /**
   * Do not render canvas if map is dragging.
   */
  handleDragStart() {
    this.isDragging = true;
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
   * This internal render function is expected to be called internally only.
   * User should use render function rather than internal render.
   */
  async internalRender() {
    const getPreviousCenterAndZoom = () => {
      return {
        previousCenter: this.previousCenter,
        previousZoom: this.previousZoom,
      };
    };

    const getNextCenterAndZoom = () => {
      const nextCenter = this.map.getCenter();
      const nextZoom = this.map.getZoom();

      return {
        nextCenter,
        nextZoom,
      };
    };

    const memorisePreviousCenterAndZoom = () => {
      this.previousCenter = this.map.getCenter();
      this.previousZoom = this.map.getZoom();
    };

    /**
     * Do not render canvas if map is dragging.
     */
    if (this.isDragging) return;

    let canvas = this.canvas;
    /**
     * Keeping visible canvas frozen, while rendering UI elements at background and display
     * daemon canvas as soon as it completes prevents unnecessary UI elements flash.
     * This happens only after map drag. Zoom change does not use daemon canvas.
     */
    const { nextCenter, nextZoom } = getNextCenterAndZoom();
    const { previousCenter, previousZoom } = getPreviousCenterAndZoom();
    if (nextZoom === previousZoom) {
      canvas = this.daemonCanvas;
      /**
       * Map drag difference in pixel.
       */
      const deltaX = this.map.lngLatToContainer(nextCenter).getX() -
        this.map.lngLatToContainer(previousCenter).getX();
      const deltaY = this.map.lngLatToContainer(nextCenter).getY() -
        this.map.lngLatToContainer(previousCenter).getY();
      /**
       * Move visible canvas horizontally and vertically.
       */
      moveCanvas(this.canvas, -deltaX, -deltaY);
    }

    this.canvasGrid.config({
      canvas,
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
      /**
       * 2drender understands rendered images are displayed on high DPR devices.
       */
      dpr: this.dpr,
      /**
       * Canvas CSS width.
       */
      height: this.height,
      /**
       * Canvas CSS width.
       */
      width: this.width,
    });
    /**
     * Call canvas grid render function to draw grids.
     */
    await this.canvasGrid.render();

    /**
     * Replace visible canvas with completed canvas to prevent UI elements flash.
     */
    if (nextZoom === previousZoom) {
      this.canvas.width = this.daemonCanvas.width;
      this.canvas.height = this.daemonCanvas.height;
      this.ctx.drawImage(this.daemonCanvas, 0, 0);
    }

    memorisePreviousCenterAndZoom();
  }

  /**
   * This is the function user calls to update how canvas looks like.
   * If configuration properties are not provided, canvas will perform a refresh.
   */
  render(props) {
    if (!isNullVoid(props)) {
      this.config(props);
    }
    this.internalRender();
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
