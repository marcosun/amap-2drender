import PropTypes from 'prop-types';
import { isEqual } from 'lodash';
import { Line as CanvasLine } from '2drender';
import getDPR from '../utils/getDPR';
import isNullVoid from '../utils/isNullVoid';

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
     * Save lines that pointer is hovering. Compare with previous hover lines to understand
     * whether it is a mouse over or mouse out event.
     */
    this.hoverLines = [];
    /**
     * Its functionality is very similar to hoverLines, although it is used to determine
     * cursor style.
     */
    this.hoverStyleLines = [];
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
    this.map.off('mousemove', this.handleMouseMove, this);
  }

  /**
   * Propagate click event to parent module if onClick event handler is defined.
   */
  handleClick(event) {
    if (typeof this.onClick === 'function') {
      const clickedLines = this.canvasLine.findByPosition(event.pixel);

      if (clickedLines.length !== 0) {
        this.onClick(event, clickedLines);
      }
    }
  }

  /**
   * Propagate mouse over and mouse out events to parent module.
   */
  handleMouseHover(event) {
    /**
     * Finding hovering lines is a time consuming task. Run the task only if either mouse over
     * or mouse out event is hooked.
     */
    if (typeof this.onMouseOver === 'function' || typeof this.onMouseOut === 'function') {
      const lines = this.canvasLine.findByPosition(event.pixel);

      if (lines.length > this.hoverLines.length) {
        /**
         * An increasing line length is a concrete signal of a mouse over event.
         */
        if (typeof this.onMouseOver === 'function') {
          this.onMouseOver(event, lines);
        }
      } else if (lines.length < this.hoverLines.length) {
        /**
         * A dropping line length is a concrete signal of a mouse out event.
         */
        if (typeof this.onMouseOut === 'function') {
          this.onMouseOut(event, lines);
        }
      } else if (!isEqual(lines, this.hoverLines)) {
        /**
         * If line length does not change, there could be two reasons:
         * 1. pointer is not moving out of any lines.
         * 2. pointer is moving to other lines however the number of lines does not change.
         * If lines pass deep equality check, it means point is not moving out of any lines,
         * fails otherwise.
         * For scenario two, mouse out event is fired before mouse over event to notify the hovering
         * line being changed.
         */
        if (typeof this.onMouseOut === 'function') {
          this.onMouseOut(event, lines);
        }
        if (typeof this.onMouseOver === 'function') {
          this.onMouseOver(event, lines);
        }
      }

      this.hoverLines = lines;
    }
  }

  /**
   * Change cursor style if mouse events are being watched.
   */
  handleMouseHoverStyle(event) {
    /**
     * Finding hovering lines is a time consuming task. Run the task only if at least one of mouse
     * events is hooked.
     */
    if (typeof this.onClick === 'function'
      || typeof this.onDoubleClick === 'function'
      || typeof this.onMouseOver === 'function'
      || typeof this.onMouseOut === 'function'
    ) {
      const lines = this.canvasLine.findByPosition(event.pixel);

      /**
       * Change cursor to pointer if mouse moves on at least one line.
       */
      if (this.hoverStyleLines.length === 0 && lines.length > 0) {
        this.map.setDefaultCursor('pointer');
      }

      /**
       * Change cursor to AMap default style if mouse leaves all lines.
       */
      if (this.hoverStyleLines.length > 0 && lines.length === 0) {
        this.map.setDefaultCursor();
      }

      this.hoverStyleLines = lines;
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
  internalRender() {
    this.canvasLine.config({
      canvas: this.canvas,
      data: this.data,
      /**
       * 2drender understands rendered images are displayed on high DPR devices.
       */
      dpr: this.dpr,
      /**
       * Everytime render function get called, canvas coordinates must get updated to reflect
       * changes.
       * When dataset is large, it takes a considerable time to transform lng lat coordinates to
       * canvas coordinates. getSnapshotBeforeRender takes advantage of none UI blocking skills
       * by invoking transformation function only before a single line is about to render.
       */
      getSnapshotBeforeRender: Line.getSnapshotBeforeRender(this.map),
      /**
       * Canvas CSS height.
       */
      height: this.height,
      /**
       * Canvas CSS width.
       */
      width: this.width,
    });
    /**
     * Call canvas line render function to draw polylines.
     */
    this.canvasLine.render();
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
   * Callback fired when at least a polyline is clicked.
   * Signature:
   * (event, lines) => void
   * event: AMap MapsEvent object.
   * lines: A list of lines that is clicked. Lines with the earlier position in the data array
   * are positioned later in the click callback. This is because lines appear later in the data
   * array are drawn later and has a higher priority when clicked.
   */
  onClick: PropTypes.func,
  /**
   * Callback fired when pointer leaves the element or one of its child elements (even if
   * the pointer is still within the element).
   * Signature:
   * (event, lines) => void
   * event: AMap MapsEvent object.
   * lines: A list of lines that pointer overs. Lines with the earlier position in the data
   * array are positioned later in the mouse over callback. This is because lines appear later
   * in the data array are drawn later and has a higher priority when mouse over.
   */
  onMouseOut: PropTypes.func,
  /**
   * Callback fired when pointer moves onto the element or one of its child elements (even if
   * the pointer is still within the element).
   * Signature:
   * (event, lines) => void
   * event: AMap MapsEvent object.
   * lines: A list of lines that pointer overs. Lines with the earlier position in the data
   * array are positioned later in the mouse over callback. This is because lines appear later
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

export default Line;
