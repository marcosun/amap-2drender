import PropTypes from 'prop-types';
import { isEqual } from 'lodash';
import { Text as CanvasText } from '2drender';
import getDPR from '../utils/getDPR';
import isNullVoid from '../utils/isNullVoid';

class Text {
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
     * Save texts that pointer is hovering. Compare with previous hover texts to understand
     * whether it is a mouse over or mouse out event.
     */
    this.hoverTexts = [];
    /**
     * Its functionality is very similar to hoverTexts, although it is used to determine
     * cursor style.
     */
    this.hoverStyleTexts = [];
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
    this.canvasText = new CanvasText();
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
    this.map.off('mousemove', this.handleMouseMove, this);
  }

  /**
   * Propagate click event to parent module if onClick event handler is defined.
   */
  handleClick(event) {
    if (this.onClick) {
      const clickedTexts = this.canvasText.findByPosition(event.pixel);

      if (clickedTexts.length !== 0) {
        this.onClick(event, clickedTexts);
      }
    }
  }

  /**
   * Propagate mouse over and mouse out events to parent module.
   */
  handleMouseHover(event) {
    /**
     * Finding hovering texts is a time consuming task. Run the task only if either mouse over
     * or mouse out event is hooked.
     */
    if (typeof this.onMouseOver === 'function' || typeof this.onMouseOut === 'function') {
      const texts = this.canvasText.findByPosition(event.pixel);

      if (texts.length > this.hoverTexts.length) {
        /**
         * An increasing text length is a concrete signal of a mouse over event.
         */
        if (typeof this.onMouseOver === 'function') {
          this.onMouseOver(event, texts);
        }
      } else if (texts.length < this.hoverTexts.length) {
        /**
         * A dropping text length is a concrete signal of a mouse out event.
         */
        if (typeof this.onMouseOut === 'function') {
          this.onMouseOut(event, texts);
        }
      } else if (!isEqual(texts, this.hoverTexts)) {
        /**
         * If text length does not change, there could be two reasons:
         * 1. pointer is not moving out of any texts.
         * 2. pointer is moving to other texts however the number of texts does not change.
         * If texts pass deep equality check, it means point is not moving out of any texts,
         * fails otherwise.
         * For scenario two, mouse out event is fired before mouse over event to notify the hovering
         * text being changed.
         */
        if (typeof this.onMouseOut === 'function') {
          this.onMouseOut(event, texts);
        }
        if (typeof this.onMouseOver === 'function') {
          this.onMouseOver(event, texts);
        }
      }

      this.hoverTexts = texts;
    }
  }

  /**
   * Change cursor style if mouse events are being watched.
   */
  handleMouseHoverStyle(event) {
    /**
     * Finding hovering texts is a time consuming task. Run the task only if at least one of mouse
     * events is hooked.
     */
    if (typeof this.onClick === 'function'
      || typeof this.onMouseOver === 'function'
      || typeof this.onMouseOut === 'function'
    ) {
      const texts = this.canvasText.findByPosition(event.pixel);

      /**
       * Change cursor to pointer if mouse moves on at least one text.
       */
      if (this.hoverStyleTexts.length === 0 && texts.length > 0) {
        this.map.setDefaultCursor('pointer');
      }

      /**
       * Change cursor to AMap default style if mouse leaves all texts.
       */
      if (this.hoverStyleTexts.length > 0 && texts.length === 0) {
        this.map.setDefaultCursor();
      }

      this.hoverStyleTtexts = texts;
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
    this.canvasText.config({
      canvas: this.canvas,
      /**
       * Everytime render function get called, canvas coordinates must get updated to reflect
       * changes.
       */
      data: this.data.map((text) => {
        const { location } = text;
        let { position } = text;

        /**
         * Position has higher priority over location. If position is not defined, position is
         * derived from location.
         */
        if (!position) {
          /**
           * Transform lng lat coordinates to canvas coordinates.
           */
          position = Text.coordinateTransformation(this.map, location);
        }

        return {
          /**
           * Pass all other properties to canvasText. This entire object will be returned when
           * calling findByPosition function.
           */
          ...text,
          position,
        };
      }),
      /**
       * 2drender understands rendered images are displayed on high DPR devices.
       */
      dpr: this.dpr,
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
     * Call canvas text render function to draw texts.
     */
    this.canvasText.render();
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

Text.propTypes = {
  /**
   * A list of texts.
   */
  data: PropTypes.arrayOf(PropTypes.shape({
    /**
     * Anchor origin is a point where it will be placed to the given position.
     * A common use case would be defining text top left point as anchor origin [0, -10].
     * It has lower priority if both anchorOrigin and anchorOriginDescription are defined.
     * i.e. [x, y]. Default text bottom left point: [0, 0].
     */
    anchorOrigin: PropTypes.arrayOf(PropTypes.number),
    /**
     * Anchor origin is a point where it will be placed to the given position.
     * A common use case would be defining text top left point as anchor origin.
     * It has higher priority if both anchorOrigin and anchorOriginDescription are defined.
     * i.e. [x, y] Default bottom-left.
     */
    anchorOriginDescription: PropTypes.oneOf([
      'bottom-center', 'bottom-left', 'bottom-right', 'center', 'middle-left', 'middle-right',
      'top-center', 'top-left', 'top-right',
    ]),
    /**
     * Text colour.
     * Default black.
     */
    color: PropTypes.string,
    /**
     * Font size in unit pixel.
     * Default 10.
     */
    fontSize: PropTypes.number,
    /**
     * Text lng lat location. i.e. [lng, lat].
     * Text position is derived from location.
     * It has lower priority if both location and position are defined.
     * Text anchor origin point is placed to this location.
     */
    location: PropTypes.arrayOf(PropTypes.number),
    /**
     * Text position in canvas cartesian coordinate system. i.e. [x, y].
     * It has higher priority if both location and position are defined.
     * Text anchor origin point is placed to this position.
     */
    position: PropTypes.arrayOf(PropTypes.number),
    /**
     * Text content.
     * Default ''.
     */
    text: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
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
   * Callback fired when at least a text is clicked.
   * Signature:
   * (event, texts) => void
   * event: AMap MapsEvent object.
   * texts: A list of texts that is clicked. Texts with the earlier position in the data array
   * are positioned later in the click callback. This is because texts appear later in the data
   * array are drawn later and has a higher priority when clicked.
   */
  onClick: PropTypes.func,
  /**
   * Callback fired when pointer leaves the element or one of its child elements (even if
   * the pointer is still within the element).
   * Signature:
   * (event, texts) => void
   * event: AMap MapsEvent object.
   * texts: A list of texts that pointer overs. Texts with the earlier position in the data
   * array are positioned later in the mouse over callback. This is because texts appear later
   * in the data array are drawn later and has a higher priority when mouse over.
   */
  onMouseOut: PropTypes.func,
  /**
   * Callback fired when pointer moves onto the element or one of its child elements (even if
   * the pointer is still within the element).
   * Signature:
   * (event, texts) => void
   * event: AMap MapsEvent object.
   * texts: A list of texts that pointer overs. Texts with the earlier position in the data
   * array are positioned later in the mouse over callback. This is because texts appear later
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

export default Text;
