import PropTypes from 'prop-types';
import { isEqual } from 'lodash';
import { Marker as CanvasMarker } from '2drender';

class Marker {
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
      onDoubleClick,
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
    /**
     * Hook map click event.
     */
    this.map.on('dblclick', this.handleDoubleClick, this);
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
      onDoubleClick,
      onMouseOut,
      onMouseOver,
      width,
    });
    this.canvasMarker = new CanvasMarker();
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
   * canvasMarker config function is expected to be called every time canvas need update.
   * This is why I don't call canvasMarker config function here,
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
      onDoubleClick,
      onMouseOut,
      onMouseOver,
      width = 0,
    } = props;

    this.data = data;
    this.onClick = onClick;
    this.onDoubleClick = onDoubleClick;
    this.onMouseOut = onMouseOut;
    this.onMouseOver = onMouseOver;
    /**
     * Save markers that pointer is hovering. Compare with previous hover markers to understand
     * whether it is a mouse over or mouse out event.
     */
    this.hoverMarkers = [];
    /**
     * Its functionality is very similar to hoverMarkers, although it is used to determine
     * cursor style.
     */
    this.hoverStyleMarkers = [];
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
    if (typeof this.onClick === 'function') {
      const clickedMarkers = this.canvasMarker.findByPosition(event.pixel);

      if (clickedMarkers.length !== 0) {
        this.onClick(event, clickedMarkers);
      }
    }
  }

  /**
   * Propagate double click event to parent module if onDoubleClick event handler is defined.
   */
  handleDoubleClick(event) {
    if (typeof this.onDoubleClick === 'function') {
      const clickedMarkers = this.canvasMarker.findByPosition(event.pixel);

      if (clickedMarkers.length !== 0) {
        this.onDoubleClick(event, clickedMarkers);
      }
    }
  }

  /**
   * Propagate mouse over and mouse out events to parent module.
   */
  handleMouseHover(event) {
    /**
     * Finding hovering markers is a time consuming task. Run the task only if either mouse over
     * or mouse out event is hooked.
     */
    if (typeof this.onMouseOver === 'function' || typeof this.onMouseOut === 'function') {
      const markers = this.canvasMarker.findByPosition(event.pixel);

      if (markers.length > this.hoverMarkers.length) {
        /**
         * An increasing marker length is a concrete signal of a mouse over event.
         */
        if (typeof this.onMouseOver === 'function') {
          this.onMouseOver(event, markers);
        }
      } else if (markers.length < this.hoverMarkers.length) {
        /**
         * A dropping marker length is a concrete signal of a mouse out event.
         */
        if (typeof this.onMouseOut === 'function') {
          this.onMouseOut(event, markers);
        }
      } else if (!isEqual(markers, this.hoverMarkers)) {
        /**
         * If marker length does not change, there could be two reasons:
         * 1. pointer is not moving out of any markers.
         * 2. pointer is moving to other markers however the number of markers does not change.
         * If markers pass deep equality check, it means point is not moving out of any markers,
         * fails otherwise.
         * For scenario two, mouse out event is fired before mouse over event to notify the hovering
         * marker being changed.
         */
        if (typeof this.onMouseOut === 'function') {
          this.onMouseOut(event, markers);
        }
        if (typeof this.onMouseOver === 'function') {
          this.onMouseOver(event, markers);
        }
      }

      this.hoverMarkers = markers;
    }
  }

  /**
   * Change cursor style if mouse events are being watched.
   */
  handleMouseHoverStyle(event) {
    const { map } = this.props;

    /**
     * Finding hovering markers is a time consuming task. Run the task only if at least one of mouse
     * events is hooked.
     */
    if (typeof this.onClick === 'function'
      || typeof this.onDoubleClick === 'function'
      || typeof this.onMouseOver === 'function'
      || typeof this.onMouseOut === 'function'
    ) {
      const markers = this.canvasMarker.findByPosition(event.pixel);

      /**
       * Change cursor to pointer if mouse moves on at least one marker.
       */
      if (this.hoverStyleMarkers.length === 0 && markers.length > 0) {
        map.setDefaultCursor('pointer');
      }

      /**
       * Change cursor to AMap default style if mouse leaves all markers.
       */
      if (this.hoverStyleMarkers.length > 0 && markers.length === 0) {
        map.setDefaultCursor();
      }

      this.hoverStyleMarkers = markers;
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
    this.canvasMarker.config({
      ctx: this.ctx,
      /**
       * Everytime render function get called, canvas coordinates must get updated to reflect
       * changes.
       */
      data: this.data.map((marker) => {
        const { location } = marker;
        let { position } = marker;

        /**
         * Position has higher priority over location. If position is not defined, position is
         * derived from location.
         */
        if (!position) {
          /**
           * Transform lng lat coordinates to canvas coordinates.
           */
          position = Marker.coordinateTransformation(this.map, location);
        }


        return {
          /**
           * Pass all other properties to canvasMarker. This entire object will be returned when
           * calling findByPosition function.
           */
          ...marker,
          position,
        };
      }),
    });
    /**
     * Call canvas marker render function to draw grids.
     */
    this.canvasMarker.render();
  }
}

Marker.propTypes = {
  /**
   * A list of markers.
   */
  data: PropTypes.arrayOf(PropTypes.shape({
    /**
     * Anchor origin is a point where it will be placed to the given position.
     * A common use case would be defining marker centre point as anchor origin .
     * i.e. [x, y] Default [0, 0].
     */
    anchorOrigin: PropTypes.arrayOf(PropTypes.number),
    /**
     * Marker height. Scale marker height.
     */
    height: PropTypes.number.isRequired,
    /**
     * Marker icon is whatever can be consumed by Image class, such as base64.
     */
    icon: PropTypes.any,
    /**
     * Marker lng lat location. i.e. [lng, lat].
     * Marker position is derived from location.
     * It has lower priority if both location and position are defined.
     * Marker anchor origin point is placed to this location.
     */
    location: PropTypes.arrayOf(PropTypes.number),
    /**
     * Marker position in canvas cartesian coordinate system. i.e. [x, y].
     * It has higher priority if both location and position are defined.
     * Marker anchor origin point is placed to this position.
     */
    position: PropTypes.arrayOf(PropTypes.number),
    /**
     * Rotate marker by the given angle. Default 0.
     * Angles are in radians, not degrees. To convert, please use: radians = (Math.PI/180)*degrees.
     */
    rotation: PropTypes.number,
    /**
     * Marker width. Scale marker width.
     */
    width: PropTypes.number.isRequired,
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
   * Callback fired when at least a marker is clicked.
   * Signature:
   * (event, markers) => void
   * event: AMap MapsEvent object.
   * markers: A list of markers that is clicked. Markers with the earlier position in the data array
   * are positioned later in the click callback. This is because markers appear later in the data
   * array are drawn later and has a higher priority when clicked.
   */
  onClick: PropTypes.func,
  /**
   * Double click event fired immediately after click event.
   * Signature:
   * (event, markers) => void
   * event: AMap MapsEvent object.
   * markers: A list of markers that is clicked. Markers with the earlier position in the data array
   * are positioned later in the click callback. This is because markers appear later in the data
   * array are drawn later and has a higher priority when clicked.
   */
  onDoubleClick: PropTypes.func,
  /**
   * Callback fired when pointer leaves the element or one of its child elements (even if
   * the pointer is still within the element).
   * Signature:
   * (event, markers) => void
   * event: AMap MapsEvent object.
   * markers: A list of markers that pointer overs. Markers with the earlier position in the data
   * array are positioned later in the mouse over callback. This is because markers appear later
   * in the data array are drawn later and has a higher priority when mouse over.
   */
  onMouseOut: PropTypes.func,
  /**
   * Callback fired when pointer moves onto the element or one of its child elements (even if
   * the pointer is still within the element).
   * Signature:
   * (event, markers) => void
   * event: AMap MapsEvent object.
   * markers: A list of markers that pointer overs. Markers with the earlier position in the data
   * array are positioned later in the mouse over callback. This is because markers appear later
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

export default Marker;
