/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {PositionStrategy} from './position-strategy';
import {ElementRef} from '@angular/core';
import {ViewportRuler, CdkScrollable, ViewportScrollPosition} from '@angular/cdk/scrolling';
import {
  ConnectedOverlayPositionChange,
  ConnectionPositionPair,
  ScrollingVisibility,
  validateHorizontalPosition,
  validateVerticalPosition,
} from './connected-position';
import {Observable, Subscription, Subject} from 'rxjs';
import {OverlayReference} from '../overlay-reference';
import {isElementScrolledOutsideView, isElementClippedByScrolling} from './scroll-clip';
import {coerceCssPixelValue, coerceArray} from '@angular/cdk/coercion';
import {Platform} from '@angular/cdk/platform';
import {OverlayContainer} from '../overlay-container';

// TODO: refactor clipping detection into a separate thing (part of scrolling module)
// TODO: doesn't handle both flexible width and height when it has to scroll along both axis.

/**
 * Class to be added to the overlay bounding box.
 *
 * 要添加到浮层限界框上的类。
 *
 */
const boundingBoxClass = 'cdk-overlay-connected-position-bounding-box';

/**
 * Regex used to split a string on its CSS units.
 *
 * 用来从字符串中拆分出 CSS 单位的正则表达式。
 *
 */
const cssUnitPattern = /([A-Za-z%]+)$/;

/**
 * Possible values that can be set as the origin of a FlexibleConnectedPositionStrategy.
 *
 * 可以设置为 FlexibleConnectedPositionStrategy 原点的可能值。
 *
 */
export type FlexibleConnectedPositionStrategyOrigin = ElementRef | Element | Point & {
  width?: number;
  height?: number;
};

/**
 * A strategy for positioning overlays. Using this strategy, an overlay is given an
 * implicit position relative some origin element. The relative position is defined in terms of
 * a point on the origin element that is connected to a point on the overlay element. For example,
 * a basic dropdown is connecting the bottom-left corner of the origin to the top-left corner
 * of the overlay.
 *
 * 放置浮层的策略。使用此策略，可以为浮层提供相对于某些原点元素的隐式位置。相对位置是根据与浮层元素上的点连接的原点元素上的点定义的。例如，一个基本的下拉列表将原点的左下角连接到浮层的左上角。
 *
 */
export class FlexibleConnectedPositionStrategy implements PositionStrategy {
  /**
   * The overlay to which this strategy is attached.
   *
   * 此策略附加到的浮层。
   *
   */
  private _overlayRef: OverlayReference;

  /**
   * Whether we're performing the very first positioning of the overlay.
   *
   * 是否正在执行浮层的第一个定位。
   *
   */
  private _isInitialRender: boolean;

  /**
   * Last size used for the bounding box. Used to avoid resizing the overlay after open.
   *
   * 用于限界框的最后一个尺寸。用于避免打开后再调整浮层的大小。
   *
   */
  private _lastBoundingBoxSize = {width: 0, height: 0};

  /**
   * Whether the overlay was pushed in a previous positioning.
   *
   * 浮层是否被推到了以前的位置。
   *
   */
  private _isPushed = false;

  /**
   * Whether the overlay can be pushed on-screen on the initial open.
   *
   * 初次打开时是否可以把浮层推到屏幕上。
   *
   */
  private _canPush = true;

  /**
   * Whether the overlay can grow via flexible width/height after the initial open.
   *
   * 初次打开后，浮层是否可以通过灵活的宽度/高度进行增长。
   *
   */
  private _growAfterOpen = false;

  /**
   * Whether the overlay's width and height can be constrained to fit within the viewport.
   *
   * 浮层的宽度和高度是否可以约束在当前视口中。
   *
   */
  private _hasFlexibleDimensions = true;

  /**
   * Whether the overlay position is locked.
   *
   * 浮层位置是否已锁定。
   *
   */
  private _positionLocked = false;

  /**
   * Cached origin dimensions
   *
   * 缓存的原点规格
   *
   */
  private _originRect: ClientRect;

  /**
   * Cached overlay dimensions
   *
   * 缓存的浮层规格
   *
   */
  private _overlayRect: ClientRect;

  /**
   * Cached viewport dimensions
   *
   * 缓存的视口规格
   *
   */
  private _viewportRect: ClientRect;

  /**
   * Amount of space that must be maintained between the overlay and the edge of the viewport.
   *
   * 浮层和视口边缘之间必须保留的空隙。
   *
   */
  private _viewportMargin = 0;

  /**
   * The Scrollable containers used to check scrollable view properties on position change.
   *
   * 可滚动容器，用于检查位置更改时可滚动视图的属性。
   *
   */
  private _scrollables: CdkScrollable[] = [];

  /**
   * Ordered list of preferred positions, from most to least desirable.
   *
   * 首选位置的有序列表，从最高到最低。
   *
   */
  _preferredPositions: ConnectionPositionPair[] = [];

  /**
   * The origin element against which the overlay will be positioned.
   *
   * 浮层将定位到的原点元素。
   *
   */
  private _origin: FlexibleConnectedPositionStrategyOrigin;

  /**
   * The overlay pane element.
   *
   * 浮层窗格元素。
   *
   */
  private _pane: HTMLElement;

  /**
   * Whether the strategy has been disposed of already.
   *
   * 该策略是否已被释放。
   *
   */
  private _isDisposed: boolean;

  /**
   * Parent element for the overlay panel used to constrain the overlay panel's size to fit
   * within the viewport.
   *
   * 浮层面板的父元素，用于约束浮层面板的大小以适合视口。
   *
   */
  private _boundingBox: HTMLElement | null;

  /**
   * The last position to have been calculated as the best fit position.
   *
   * 计算为最佳拟合位置中的最后一个。
   *
   */
  private _lastPosition: ConnectedPosition | null;

  /**
   * Subject that emits whenever the position changes.
   *
   * 位置改变时触发的主体对象。
   *
   */
  private readonly _positionChanges = new Subject<ConnectedOverlayPositionChange>();

  /**
   * Subscription to viewport size changes.
   *
   * 订阅视口大小更改。
   *
   */
  private _resizeSubscription = Subscription.EMPTY;

  /**
   * Default offset for the overlay along the x axis.
   *
   * 浮层沿 x 轴的默认偏移量。
   *
   */
  private _offsetX = 0;

  /**
   * Default offset for the overlay along the y axis.
   *
   * 浮层沿 y 轴的默认偏移量。
   *
   */
  private _offsetY = 0;

  /**
   * Selector to be used when finding the elements on which to set the transform origin.
   *
   * 本选择器用于查找要在其上设置变换原点的元素。
   *
   */
  private _transformOriginSelector: string;

  /**
   * Keeps track of the CSS classes that the position strategy has applied on the overlay panel.
   *
   * 跟踪由定位策略应用到浮层面板上的 CSS 类。
   *
   */
  private _appliedPanelClasses: string[] = [];

  /**
   * Amount by which the overlay was pushed in each axis during the last time it was positioned.
   *
   * 上一次放置浮层时在每个轴上推动此浮层的距离。
   *
   */
  private _previousPushAmount: {x: number, y: number} | null;

  /**
   * Observable sequence of position changes.
   *
   * 位置变化的可观察序列。
   *
   */
  positionChanges: Observable<ConnectedOverlayPositionChange> = this._positionChanges;

  /**
   * Ordered list of preferred positions, from most to least desirable.
   *
   * 首选位置的有序列表，从最高到最低。
   *
   */
  get positions(): ConnectionPositionPair[] {
    return this._preferredPositions;
  }

  constructor(
      connectedTo: FlexibleConnectedPositionStrategyOrigin, private _viewportRuler: ViewportRuler,
      private _document: Document, private _platform: Platform,
      private _overlayContainer: OverlayContainer) {
    this.setOrigin(connectedTo);
  }

  /**
   * Attaches this position strategy to an overlay.
   *
   * 将此定位策略附加到浮层。
   *
   */
  attach(overlayRef: OverlayReference): void {
    if (this._overlayRef && overlayRef !== this._overlayRef &&
      (typeof ngDevMode === 'undefined' || ngDevMode)) {
      throw Error('This position strategy is already attached to an overlay');
    }

    this._validatePositions();

    overlayRef.hostElement.classList.add(boundingBoxClass);

    this._overlayRef = overlayRef;
    this._boundingBox = overlayRef.hostElement;
    this._pane = overlayRef.overlayElement;
    this._isDisposed = false;
    this._isInitialRender = true;
    this._lastPosition = null;
    this._resizeSubscription.unsubscribe();
    this._resizeSubscription = this._viewportRuler.change().subscribe(() => {
      // When the window is resized, we want to trigger the next reposition as if it
      // was an initial render, in order for the strategy to pick a new optimal position,
      // otherwise position locking will cause it to stay at the old one.
      this._isInitialRender = true;
      this.apply();
    });
  }

  /**
   * Updates the position of the overlay element, using whichever preferred position relative
   * to the origin best fits on-screen.
   *
   * 使用相对于屏幕最适合原点的首选位置来更新叠加元素的位置。
   *
   * The selection of a position goes as follows:
   *
   * 位置的选择逻辑如下：
   *
   * - If any positions fit completely within the viewport as-is,
   *     choose the first position that does so.
   *
   *   如果任何位置能完全按原样放置在视口中，请选择第一个适合的位置。
   *
   * - If flexible dimensions are enabled and at least one satifies the given minimum width/height,
   *     choose the position with the greatest available size modified by the positions' weight.
   *
   *   如果启用了灵活规格，并且其中至少有一个满足给定的最小宽度/高度，请选择最大的可用规格（根据位置的权重修订）的位置。
   *
   * - If pushing is enabled, take the position that went off-screen the least and push it
   *     on-screen.
   *
   *   如果启用了推入功能，则让离开屏幕的位置尽可能少，然后将其推入屏幕。
   *
   * - If none of the previous criteria were met, use the position that goes off-screen the least.
   *
   *   如果没有满足先前的条件，就使用屏幕外部分最少的位置。
   *
   * @docs-private
   */
  apply(): void {
    // We shouldn't do anything if the strategy was disposed or we're on the server.
    if (this._isDisposed || !this._platform.isBrowser) {
      return;
    }

    // If the position has been applied already (e.g. when the overlay was opened) and the
    // consumer opted into locking in the position, re-use the old position, in order to
    // prevent the overlay from jumping around.
    if (!this._isInitialRender && this._positionLocked && this._lastPosition) {
      this.reapplyLastPosition();
      return;
    }

    this._clearPanelClasses();
    this._resetOverlayElementStyles();
    this._resetBoundingBoxStyles();

    // We need the bounding rects for the origin and the overlay to determine how to position
    // the overlay relative to the origin.
    // We use the viewport rect to determine whether a position would go off-screen.
    this._viewportRect = this._getNarrowedViewportRect();
    this._originRect = this._getOriginRect();
    this._overlayRect = this._pane.getBoundingClientRect();

    const originRect = this._originRect;
    const overlayRect = this._overlayRect;
    const viewportRect = this._viewportRect;

    // Positions where the overlay will fit with flexible dimensions.
    const flexibleFits: FlexibleFit[] = [];

    // Fallback if none of the preferred positions fit within the viewport.
    let fallback: FallbackPosition | undefined;

    // Go through each of the preferred positions looking for a good fit.
    // If a good fit is found, it will be applied immediately.
    for (let pos of this._preferredPositions) {
      // Get the exact (x, y) coordinate for the point-of-origin on the origin element.
      let originPoint = this._getOriginPoint(originRect, pos);

      // From that point-of-origin, get the exact (x, y) coordinate for the top-left corner of the
      // overlay in this position. We use the top-left corner for calculations and later translate
      // this into an appropriate (top, left, bottom, right) style.
      let overlayPoint = this._getOverlayPoint(originPoint, overlayRect, pos);

      // Calculate how well the overlay would fit into the viewport with this point.
      let overlayFit = this._getOverlayFit(overlayPoint, overlayRect, viewportRect, pos);

      // If the overlay, without any further work, fits into the viewport, use this position.
      if (overlayFit.isCompletelyWithinViewport) {
        this._isPushed = false;
        this._applyPosition(pos, originPoint);
        return;
      }

      // If the overlay has flexible dimensions, we can use this position
      // so long as there's enough space for the minimum dimensions.
      if (this._canFitWithFlexibleDimensions(overlayFit, overlayPoint, viewportRect)) {
        // Save positions where the overlay will fit with flexible dimensions. We will use these
        // if none of the positions fit *without* flexible dimensions.
        flexibleFits.push({
          position: pos,
          origin: originPoint,
          overlayRect,
          boundingBoxRect: this._calculateBoundingBoxRect(originPoint, pos)
        });

        continue;
      }

      // If the current preferred position does not fit on the screen, remember the position
      // if it has more visible area on-screen than we've seen and move onto the next preferred
      // position.
      if (!fallback || fallback.overlayFit.visibleArea < overlayFit.visibleArea) {
        fallback = {overlayFit, overlayPoint, originPoint, position: pos, overlayRect};
      }
    }

    // If there are any positions where the overlay would fit with flexible dimensions, choose the
    // one that has the greatest area available modified by the position's weight
    if (flexibleFits.length) {
      let bestFit: FlexibleFit | null = null;
      let bestScore = -1;
      for (const fit of flexibleFits) {
        const score =
            fit.boundingBoxRect.width * fit.boundingBoxRect.height * (fit.position.weight || 1);
        if (score > bestScore) {
          bestScore = score;
          bestFit = fit;
        }
      }

      this._isPushed = false;
      this._applyPosition(bestFit!.position, bestFit!.origin);
      return;
    }

    // When none of the preferred positions fit within the viewport, take the position
    // that went off-screen the least and attempt to push it on-screen.
    if (this._canPush) {
      // TODO(jelbourn): after pushing, the opening "direction" of the overlay might not make sense.
      this._isPushed = true;
      this._applyPosition(fallback!.position, fallback!.originPoint);
      return;
    }

    // All options for getting the overlay within the viewport have been exhausted, so go with the
    // position that went off-screen the least.
    this._applyPosition(fallback!.position, fallback!.originPoint);
  }

  detach(): void {
    this._clearPanelClasses();
    this._lastPosition = null;
    this._previousPushAmount = null;
    this._resizeSubscription.unsubscribe();
  }

  /**
   * Cleanup after the element gets destroyed.
   *
   * 元素销毁后进行清理。
   *
   */
  dispose(): void {
    if (this._isDisposed) {
      return;
    }

    // We can't use `_resetBoundingBoxStyles` here, because it resets
    // some properties to zero, rather than removing them.
    if (this._boundingBox) {
      extendStyles(this._boundingBox.style, {
        top: '',
        left: '',
        right: '',
        bottom: '',
        height: '',
        width: '',
        alignItems: '',
        justifyContent: '',
      } as CSSStyleDeclaration);
    }

    if (this._pane) {
      this._resetOverlayElementStyles();
    }

    if (this._overlayRef) {
      this._overlayRef.hostElement.classList.remove(boundingBoxClass);
    }

    this.detach();
    this._positionChanges.complete();
    this._overlayRef = this._boundingBox = null!;
    this._isDisposed = true;
  }

  /**
   * This re-aligns the overlay element with the trigger in its last calculated position,
   * even if a position higher in the "preferred positions" list would now fit. This
   * allows one to re-align the panel without changing the orientation of the panel.
   *
   * 这将使浮层元素与触发器在其最后计算的位置处重新对齐，即使现在“首选位置”列表中的位置优先级较高也是如此。这样一来，无需更改面板方向即可重新对齐面板。
   *
   */
  reapplyLastPosition(): void {
    if (!this._isDisposed && (!this._platform || this._platform.isBrowser)) {
      this._originRect = this._getOriginRect();
      this._overlayRect = this._pane.getBoundingClientRect();
      this._viewportRect = this._getNarrowedViewportRect();

      const lastPosition = this._lastPosition || this._preferredPositions[0];
      const originPoint = this._getOriginPoint(this._originRect, lastPosition);

      this._applyPosition(lastPosition, originPoint);
    }
  }

  /**
   * Sets the list of Scrollable containers that host the origin element so that
   * on reposition we can evaluate if it or the overlay has been clipped or outside view. Every
   * Scrollable must be an ancestor element of the strategy's origin element.
   *
   * 设置承载原点元素的可滚动容器列表，以便在重新定位时可以评估该元素或浮层是否已被裁剪或在外部视图。每个可滚动对象必须是此策略的原点元素的祖先。
   *
   */
  withScrollableContainers(scrollables: CdkScrollable[]): this {
    this._scrollables = scrollables;
    return this;
  }

  /**
   * Adds new preferred positions.
   *
   * 添加新的首选位置。
   *
   * @param positions List of positions options for this overlay.
   *
   * 此浮层的定位选项列表。
   *
   */
  withPositions(positions: ConnectedPosition[]): this {
    this._preferredPositions = positions;

    // If the last calculated position object isn't part of the positions anymore, clear
    // it in order to avoid it being picked up if the consumer tries to re-apply.
    if (positions.indexOf(this._lastPosition!) === -1) {
      this._lastPosition = null;
    }

    this._validatePositions();

    return this;
  }

  /**
   * Sets a minimum distance the overlay may be positioned to the edge of the viewport.
   *
   * 设置浮层可以放置到视口边缘的最小距离。
   *
   * @param margin Required margin between the overlay and the viewport edge in pixels.
   *
   * 浮层和视口边缘之间的必要边距（以像素为单位）。
   *
   */
  withViewportMargin(margin: number): this {
    this._viewportMargin = margin;
    return this;
  }

  /**
   * Sets whether the overlay's width and height can be constrained to fit within the viewport.
   *
   * 设置是否可以将浮层的宽度和高度限制为适合视口。
   *
   */
  withFlexibleDimensions(flexibleDimensions = true): this {
    this._hasFlexibleDimensions = flexibleDimensions;
    return this;
  }

  /**
   * Sets whether the overlay can grow after the initial open via flexible width/height.
   *
   * 设置浮层在初始打开后是否可以灵活的增加宽度/高度。
   *
   */
  withGrowAfterOpen(growAfterOpen = true): this {
    this._growAfterOpen = growAfterOpen;
    return this;
  }

  /**
   * Sets whether the overlay can be pushed on-screen if none of the provided positions fit.
   *
   * 设置如果提供的位置都不适合，则是否可以在屏幕上推动浮层。
   *
   */
  withPush(canPush = true): this {
    this._canPush = canPush;
    return this;
  }

  /**
   * Sets whether the overlay's position should be locked in after it is positioned
   * initially. When an overlay is locked in, it won't attempt to reposition itself
   * when the position is re-applied (e.g. when the user scrolls away).
   *
   * 设置浮层的位置在最初放置后是否应锁定。当浮层被锁定时，在重新应用位置时（例如，当用户滚动时），它不会尝试重新定位自身。
   *
   * @param isLocked Whether the overlay should locked in.
   *
   * 浮层是否应锁定。
   *
   */
  withLockedPosition(isLocked = true): this {
    this._positionLocked = isLocked;
    return this;
  }

  /**
   * Sets the origin, relative to which to position the overlay.
   * Using an element origin is useful for building components that need to be positioned
   * relatively to a trigger (e.g. dropdown menus or tooltips), whereas using a point can be
   * used for cases like contextual menus which open relative to the user's pointer.
   *
   * 设置相对于此浮层位置的原点。使用元素原点可用于构建需要相对于触发器定位的组件（例如，下拉菜单或工具提示），从而让这个点可用于诸如上下文菜单等需要相对于用户指针处打开的情况。
   *
   * @param origin Reference to the new origin.
   *
   * 新原点的引用。
   *
   */
  setOrigin(origin: FlexibleConnectedPositionStrategyOrigin): this {
    this._origin = origin;
    return this;
  }

  /**
   * Sets the default offset for the overlay's connection point on the x-axis.
   *
   * 设置浮层在 x 轴上的连接点的默认偏移量。
   *
   * @param offset New offset in the X axis.
   *
   * X 轴上的新偏移量。
   *
   */
  withDefaultOffsetX(offset: number): this {
    this._offsetX = offset;
    return this;
  }

  /**
   * Sets the default offset for the overlay's connection point on the y-axis.
   *
   * 设置浮层在 y 轴上的连接点的默认偏移量。
   *
   * @param offset New offset in the Y axis.
   *
   * Y 轴上的新偏移量。
   *
   */
  withDefaultOffsetY(offset: number): this {
    this._offsetY = offset;
    return this;
  }

  /**
   * Configures that the position strategy should set a `transform-origin` on some elements
   * inside the overlay, depending on the current position that is being applied. This is
   * useful for the cases where the origin of an animation can change depending on the
   * alignment of the overlay.
   *
   * 配置定位策略应该把 `transform-origin` 设置为此浮层内的某些元素，具体取决于所要应用的当前位置。对于动画的原点要根据浮层的对齐方式而改变的情况，这很有用。
   *
   * @param selector CSS selector that will be used to find the target
   *    elements onto which to set the transform origin.
   *
   * CSS 选择器，将用于查找要设置为形变原点的目标元素。
   *
   */
  withTransformOriginOn(selector: string): this {
    this._transformOriginSelector = selector;
    return this;
  }

  /**
   * Gets the (x, y) coordinate of a connection point on the origin based on a relative position.
   *
   * 根据相对位置获取原点上连接点的（x，y）坐标。
   *
   */
  private _getOriginPoint(originRect: ClientRect, pos: ConnectedPosition): Point {
    let x: number;
    if (pos.originX == 'center') {
      // Note: when centering we should always use the `left`
      // offset, otherwise the position will be wrong in RTL.
      x = originRect.left + (originRect.width / 2);
    } else {
      const startX = this._isRtl() ? originRect.right : originRect.left;
      const endX = this._isRtl() ? originRect.left : originRect.right;
      x = pos.originX == 'start' ? startX : endX;
    }

    let y: number;
    if (pos.originY == 'center') {
      y = originRect.top + (originRect.height / 2);
    } else {
      y = pos.originY == 'top' ? originRect.top : originRect.bottom;
    }

    return {x, y};
  }

  /**
   * Gets the (x, y) coordinate of the top-left corner of the overlay given a given position and
   * origin point to which the overlay should be connected.
   *
   * 在指定浮层应连接到的指定位置和原点的情况下，获取浮层左上角的（x，y）坐标。
   *
   */
  private _getOverlayPoint(
      originPoint: Point,
      overlayRect: ClientRect,
      pos: ConnectedPosition): Point {

    // Calculate the (overlayStartX, overlayStartY), the start of the
    // potential overlay position relative to the origin point.
    let overlayStartX: number;
    if (pos.overlayX == 'center') {
      overlayStartX = -overlayRect.width / 2;
    } else if (pos.overlayX === 'start') {
      overlayStartX = this._isRtl() ? -overlayRect.width : 0;
    } else {
      overlayStartX = this._isRtl() ? 0 : -overlayRect.width;
    }

    let overlayStartY: number;
    if (pos.overlayY == 'center') {
      overlayStartY = -overlayRect.height / 2;
    } else {
      overlayStartY = pos.overlayY == 'top' ? 0 : -overlayRect.height;
    }

    // The (x, y) coordinates of the overlay.
    return {
      x: originPoint.x + overlayStartX,
      y: originPoint.y + overlayStartY,
    };
  }

  /**
   * Gets how well an overlay at the given point will fit within the viewport.
   *
   * 获取指定点的浮层在视口中的适应程度。
   *
   */
  private _getOverlayFit(point: Point, rawOverlayRect: ClientRect, viewport: ClientRect,
    position: ConnectedPosition): OverlayFit {

    // Round the overlay rect when comparing against the
    // viewport, because the viewport is always rounded.
    const overlay = getRoundedBoundingClientRect(rawOverlayRect);
    let {x, y} = point;
    let offsetX = this._getOffset(position, 'x');
    let offsetY = this._getOffset(position, 'y');

    // Account for the offsets since they could push the overlay out of the viewport.
    if (offsetX) {
      x += offsetX;
    }

    if (offsetY) {
      y += offsetY;
    }

    // How much the overlay would overflow at this position, on each side.
    let leftOverflow = 0 - x;
    let rightOverflow = (x + overlay.width) - viewport.width;
    let topOverflow = 0 - y;
    let bottomOverflow = (y + overlay.height) - viewport.height;

    // Visible parts of the element on each axis.
    let visibleWidth = this._subtractOverflows(overlay.width, leftOverflow, rightOverflow);
    let visibleHeight = this._subtractOverflows(overlay.height, topOverflow, bottomOverflow);
    let visibleArea = visibleWidth * visibleHeight;

    return {
      visibleArea,
      isCompletelyWithinViewport: (overlay.width * overlay.height) === visibleArea,
      fitsInViewportVertically: visibleHeight === overlay.height,
      fitsInViewportHorizontally: visibleWidth == overlay.width,
    };
  }

  /**
   * Whether the overlay can fit within the viewport when it may resize either its width or height.
   *
   * 当浮层可以调整其宽度或高度的大小时，它是否适合放在此视口中。
   *
   * @param fit How well the overlay fits in the viewport at some position.
   *
   * 浮层在某些位置上适合视口的程度。
   *
   * @param point The (x, y) coordinates of the overlat at some position.
   *
   * 浮层在某些位置的（x，y）坐标。
   *
   * @param viewport The geometry of the viewport.
   *
   * 视口的几何形状。
   *
   */
  private _canFitWithFlexibleDimensions(fit: OverlayFit, point: Point, viewport: ClientRect) {
    if (this._hasFlexibleDimensions) {
      const availableHeight = viewport.bottom - point.y;
      const availableWidth = viewport.right - point.x;
      const minHeight = getPixelValue(this._overlayRef.getConfig().minHeight);
      const minWidth = getPixelValue(this._overlayRef.getConfig().minWidth);

      const verticalFit = fit.fitsInViewportVertically ||
          (minHeight != null && minHeight <= availableHeight);
      const horizontalFit = fit.fitsInViewportHorizontally ||
          (minWidth != null && minWidth <= availableWidth);

      return verticalFit && horizontalFit;
    }
    return false;
  }

  /**
   * Gets the point at which the overlay can be "pushed" on-screen. If the overlay is larger than
   * the viewport, the top-left corner will be pushed on-screen (with overflow occuring on the
   * right and bottom).
   *
   * 获取可以推到屏幕上的浮层的位置。如果浮层大于视口，则屏幕左上角将被推送到屏幕上（在右侧和底部发生溢出）。
   *
   * @param start Starting point from which the overlay is pushed.
   *
   * 推送浮层的起点。
   *
   * @param overlay Dimensions of the overlay.
   *
   * 浮层的规格。
   *
   * @param scrollPosition Current viewport scroll position.
   *
   * 当前视口的滚动位置。
   *
   * @returns The point at which to position the overlay after pushing. This is effectively a new
   *     originPoint.
   *
   * 推送后放置浮层的位置。这实际上是一个新的原点。
   *
   */
  private _pushOverlayOnScreen(start: Point,
                               rawOverlayRect: ClientRect,
                               scrollPosition: ViewportScrollPosition): Point {
    // If the position is locked and we've pushed the overlay already, reuse the previous push
    // amount, rather than pushing it again. If we were to continue pushing, the element would
    // remain in the viewport, which goes against the expectations when position locking is enabled.
    if (this._previousPushAmount && this._positionLocked) {
      return {
        x: start.x + this._previousPushAmount.x,
        y: start.y + this._previousPushAmount.y
      };
    }

    // Round the overlay rect when comparing against the
    // viewport, because the viewport is always rounded.
    const overlay = getRoundedBoundingClientRect(rawOverlayRect);
    const viewport = this._viewportRect;

    // Determine how much the overlay goes outside the viewport on each
    // side, which we'll use to decide which direction to push it.
    const overflowRight = Math.max(start.x + overlay.width - viewport.width, 0);
    const overflowBottom = Math.max(start.y + overlay.height - viewport.height, 0);
    const overflowTop = Math.max(viewport.top - scrollPosition.top - start.y, 0);
    const overflowLeft = Math.max(viewport.left - scrollPosition.left - start.x, 0);

    // Amount by which to push the overlay in each axis such that it remains on-screen.
    let pushX = 0;
    let pushY = 0;

    // If the overlay fits completely within the bounds of the viewport, push it from whichever
    // direction is goes off-screen. Otherwise, push the top-left corner such that its in the
    // viewport and allow for the trailing end of the overlay to go out of bounds.
    if (overlay.width <= viewport.width) {
      pushX = overflowLeft || -overflowRight;
    } else {
      pushX = start.x < this._viewportMargin ? (viewport.left - scrollPosition.left) - start.x : 0;
    }

    if (overlay.height <= viewport.height) {
      pushY = overflowTop || -overflowBottom;
    } else {
      pushY = start.y < this._viewportMargin ? (viewport.top - scrollPosition.top) - start.y : 0;
    }

    this._previousPushAmount = {x: pushX, y: pushY};

    return {
      x: start.x + pushX,
      y: start.y + pushY,
    };
  }

  /**
   * Applies a computed position to the overlay and emits a position change.
   *
   * 将计算出的位置应用于浮层并发出位置变更通知。
   *
   * @param position The position preference
   *
   * 首选位置
   *
   * @param originPoint The point on the origin element where the overlay is connected.
   *
   * 原点元素上浮层的连接点。
   *
   */
  private _applyPosition(position: ConnectedPosition, originPoint: Point) {
    this._setTransformOrigin(position);
    this._setOverlayElementStyles(originPoint, position);
    this._setBoundingBoxStyles(originPoint, position);

    if (position.panelClass) {
      this._addPanelClasses(position.panelClass);
    }

    // Save the last connected position in case the position needs to be re-calculated.
    this._lastPosition = position;

    // Notify that the position has been changed along with its change properties.
    // We only emit if we've got any subscriptions, because the scroll visibility
    // calculcations can be somewhat expensive.
    if (this._positionChanges.observers.length) {
      const scrollableViewProperties = this._getScrollVisibility();
      const changeEvent = new ConnectedOverlayPositionChange(position, scrollableViewProperties);
      this._positionChanges.next(changeEvent);
    }

    this._isInitialRender = false;
  }

  /**
   * Sets the transform origin based on the configured selector and the passed-in position.
   *
   * 根据配置的选择器和传入的位置，设置形变原点。
   *
   */
  private _setTransformOrigin(position: ConnectedPosition) {
    if (!this._transformOriginSelector) {
      return;
    }

    const elements: NodeListOf<HTMLElement> =
        this._boundingBox!.querySelectorAll(this._transformOriginSelector);
    let xOrigin: 'left' | 'right' | 'center';
    let yOrigin: 'top' | 'bottom' | 'center' = position.overlayY;

    if (position.overlayX === 'center') {
      xOrigin = 'center';
    } else if (this._isRtl()) {
      xOrigin = position.overlayX === 'start' ? 'right' : 'left';
    } else {
      xOrigin = position.overlayX === 'start' ? 'left' : 'right';
    }

    for (let i = 0; i < elements.length; i++) {
      elements[i].style.transformOrigin = `${xOrigin} ${yOrigin}`;
    }
  }

  /**
   * Gets the position and size of the overlay's sizing container.
   *
   * 获取浮层大小调整容器的位置和大小。
   *
   * This method does no measuring and applies no styles so that we can cheaply compute the
   * bounds for all positions and choose the best fit based on these results.
   *
   * 此方法不进行任何度量，也不应用任何样式，因此我们可以廉价地计算所有位置的边界，并根据这些结果选择最佳拟合。
   *
   */
  private _calculateBoundingBoxRect(origin: Point, position: ConnectedPosition): BoundingBoxRect {
    const viewport = this._viewportRect;
    const isRtl = this._isRtl();
    let height: number, top: number, bottom: number;

    if (position.overlayY === 'top') {
      // Overlay is opening "downward" and thus is bound by the bottom viewport edge.
      top = origin.y;
      height = viewport.height - top + this._viewportMargin;
    } else if (position.overlayY === 'bottom') {
      // Overlay is opening "upward" and thus is bound by the top viewport edge. We need to add
      // the viewport margin back in, because the viewport rect is narrowed down to remove the
      // margin, whereas the `origin` position is calculated based on its `ClientRect`.
      bottom = viewport.height - origin.y + this._viewportMargin * 2;
      height = viewport.height - bottom + this._viewportMargin;
    } else {
      // If neither top nor bottom, it means that the overlay is vertically centered on the
      // origin point. Note that we want the position relative to the viewport, rather than
      // the page, which is why we don't use something like `viewport.bottom - origin.y` and
      // `origin.y - viewport.top`.
      const smallestDistanceToViewportEdge =
          Math.min(viewport.bottom - origin.y + viewport.top, origin.y);

      const previousHeight = this._lastBoundingBoxSize.height;

      height = smallestDistanceToViewportEdge * 2;
      top = origin.y - smallestDistanceToViewportEdge;

      if (height > previousHeight && !this._isInitialRender && !this._growAfterOpen) {
        top = origin.y - (previousHeight / 2);
      }
    }

    // The overlay is opening 'right-ward' (the content flows to the right).
    const isBoundedByRightViewportEdge =
        (position.overlayX === 'start' && !isRtl) ||
        (position.overlayX === 'end' && isRtl);

    // The overlay is opening 'left-ward' (the content flows to the left).
    const isBoundedByLeftViewportEdge =
        (position.overlayX === 'end' && !isRtl) ||
        (position.overlayX === 'start' && isRtl);

    let width: number, left: number, right: number;

    if (isBoundedByLeftViewportEdge) {
      right = viewport.width - origin.x + this._viewportMargin;
      width = origin.x - this._viewportMargin;
    } else if (isBoundedByRightViewportEdge) {
      left = origin.x;
      width = viewport.right - origin.x;
    } else {
      // If neither start nor end, it means that the overlay is horizontally centered on the
      // origin point. Note that we want the position relative to the viewport, rather than
      // the page, which is why we don't use something like `viewport.right - origin.x` and
      // `origin.x - viewport.left`.
      const smallestDistanceToViewportEdge =
          Math.min(viewport.right - origin.x + viewport.left, origin.x);
      const previousWidth = this._lastBoundingBoxSize.width;

      width = smallestDistanceToViewportEdge * 2;
      left = origin.x - smallestDistanceToViewportEdge;

      if (width > previousWidth && !this._isInitialRender && !this._growAfterOpen) {
        left = origin.x - (previousWidth / 2);
      }
    }

    return {top: top!, left: left!, bottom: bottom!, right: right!, width, height};
  }

  /**
   * Sets the position and size of the overlay's sizing wrapper. The wrapper is positioned on the
   * origin's connection point and stetches to the bounds of the viewport.
   *
   * 设置浮层大小调整器的位置和大小。包装器位于原点的连接点上，并拉伸到视口的边界。
   *
   * @param origin The point on the origin element where the overlay is connected.
   *
   * 原点元素上浮层的连接点。
   *
   * @param position The position preference
   *
   * 首选位置
   *
   */
  private _setBoundingBoxStyles(origin: Point, position: ConnectedPosition): void {
    const boundingBoxRect = this._calculateBoundingBoxRect(origin, position);

    // It's weird if the overlay *grows* while scrolling, so we take the last size into account
    // when applying a new size.
    if (!this._isInitialRender && !this._growAfterOpen) {
      boundingBoxRect.height = Math.min(boundingBoxRect.height, this._lastBoundingBoxSize.height);
      boundingBoxRect.width = Math.min(boundingBoxRect.width, this._lastBoundingBoxSize.width);
    }

    const styles = {} as CSSStyleDeclaration;

    if (this._hasExactPosition()) {
      styles.top = styles.left = '0';
      styles.bottom = styles.right = styles.maxHeight = styles.maxWidth = '';
      styles.width = styles.height = '100%';
    } else {
      const maxHeight = this._overlayRef.getConfig().maxHeight;
      const maxWidth = this._overlayRef.getConfig().maxWidth;

      styles.height = coerceCssPixelValue(boundingBoxRect.height);
      styles.top = coerceCssPixelValue(boundingBoxRect.top);
      styles.bottom = coerceCssPixelValue(boundingBoxRect.bottom);
      styles.width = coerceCssPixelValue(boundingBoxRect.width);
      styles.left = coerceCssPixelValue(boundingBoxRect.left);
      styles.right = coerceCssPixelValue(boundingBoxRect.right);

      // Push the pane content towards the proper direction.
      if (position.overlayX === 'center') {
        styles.alignItems = 'center';
      } else {
        styles.alignItems = position.overlayX === 'end' ? 'flex-end' : 'flex-start';
      }

      if (position.overlayY === 'center') {
        styles.justifyContent = 'center';
      } else {
        styles.justifyContent = position.overlayY === 'bottom' ? 'flex-end' : 'flex-start';
      }

      if (maxHeight) {
        styles.maxHeight = coerceCssPixelValue(maxHeight);
      }

      if (maxWidth) {
        styles.maxWidth = coerceCssPixelValue(maxWidth);
      }
    }

    this._lastBoundingBoxSize = boundingBoxRect;

    extendStyles(this._boundingBox!.style, styles);
  }

  /**
   * Resets the styles for the bounding box so that a new positioning can be computed.
   *
   * 重置边界框的样式，以便可以计算新的位置。
   *
   */
  private _resetBoundingBoxStyles() {
    extendStyles(this._boundingBox!.style, {
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      height: '',
      width: '',
      alignItems: '',
      justifyContent: '',
    } as CSSStyleDeclaration);
  }

  /**
   * Resets the styles for the overlay pane so that a new positioning can be computed.
   *
   * 重置浮层窗格的样式，以便可以计算新的位置。
   *
   */
  private _resetOverlayElementStyles() {
    extendStyles(this._pane.style, {
      top: '',
      left: '',
      bottom: '',
      right: '',
      position: '',
      transform: '',
    } as CSSStyleDeclaration);
  }

  /**
   * Sets positioning styles to the overlay element.
   *
   * 为浮层元素设置定位样式。
   *
   */
  private _setOverlayElementStyles(originPoint: Point, position: ConnectedPosition): void {
    const styles = {} as CSSStyleDeclaration;
    const hasExactPosition = this._hasExactPosition();
    const hasFlexibleDimensions = this._hasFlexibleDimensions;
    const config = this._overlayRef.getConfig();

    if (hasExactPosition) {
      const scrollPosition = this._viewportRuler.getViewportScrollPosition();
      extendStyles(styles, this._getExactOverlayY(position, originPoint, scrollPosition));
      extendStyles(styles, this._getExactOverlayX(position, originPoint, scrollPosition));
    } else {
      styles.position = 'static';
    }

    // Use a transform to apply the offsets. We do this because the `center` positions rely on
    // being in the normal flex flow and setting a `top` / `left` at all will completely throw
    // off the position. We also can't use margins, because they won't have an effect in some
    // cases where the element doesn't have anything to "push off of". Finally, this works
    // better both with flexible and non-flexible positioning.
    let transformString = '';
    let offsetX = this._getOffset(position, 'x');
    let offsetY = this._getOffset(position, 'y');

    if (offsetX) {
      transformString += `translateX(${offsetX}px) `;
    }

    if (offsetY) {
      transformString += `translateY(${offsetY}px)`;
    }

    styles.transform = transformString.trim();

    // If a maxWidth or maxHeight is specified on the overlay, we remove them. We do this because
    // we need these values to both be set to "100%" for the automatic flexible sizing to work.
    // The maxHeight and maxWidth are set on the boundingBox in order to enforce the constraint.
    // Note that this doesn't apply when we have an exact position, in which case we do want to
    // apply them because they'll be cleared from the bounding box.
    if (config.maxHeight) {
      if (hasExactPosition) {
        styles.maxHeight = coerceCssPixelValue(config.maxHeight);
      } else if (hasFlexibleDimensions) {
        styles.maxHeight = '';
      }
    }

    if (config.maxWidth) {
      if (hasExactPosition) {
        styles.maxWidth = coerceCssPixelValue(config.maxWidth);
      } else if (hasFlexibleDimensions) {
        styles.maxWidth = '';
      }
    }

    extendStyles(this._pane.style, styles);
  }

  /**
   * Gets the exact top/bottom for the overlay when not using flexible sizing or when pushing.
   *
   * 不使用灵活的大小调整或推入时，获取浮层的确切顶部/底部。
   *
   */
  private _getExactOverlayY(position: ConnectedPosition,
                            originPoint: Point,
                            scrollPosition: ViewportScrollPosition) {
    // Reset any existing styles. This is necessary in case the
    // preferred position has changed since the last `apply`.
    let styles = {top: '', bottom: ''} as CSSStyleDeclaration;
    let overlayPoint = this._getOverlayPoint(originPoint, this._overlayRect, position);

    if (this._isPushed) {
      overlayPoint = this._pushOverlayOnScreen(overlayPoint, this._overlayRect, scrollPosition);
    }

    let virtualKeyboardOffset =
        this._overlayContainer.getContainerElement().getBoundingClientRect().top;

    // Normally this would be zero, however when the overlay is attached to an input (e.g. in an
    // autocomplete), mobile browsers will shift everything in order to put the input in the middle
    // of the screen and to make space for the virtual keyboard. We need to account for this offset,
    // otherwise our positioning will be thrown off.
    overlayPoint.y -= virtualKeyboardOffset;

    // We want to set either `top` or `bottom` based on whether the overlay wants to appear
    // above or below the origin and the direction in which the element will expand.
    if (position.overlayY === 'bottom') {
      // When using `bottom`, we adjust the y position such that it is the distance
      // from the bottom of the viewport rather than the top.
      const documentHeight = this._document.documentElement!.clientHeight;
      styles.bottom = `${documentHeight - (overlayPoint.y + this._overlayRect.height)}px`;
    } else {
      styles.top = coerceCssPixelValue(overlayPoint.y);
    }

    return styles;
  }

  /**
   * Gets the exact left/right for the overlay when not using flexible sizing or when pushing.
   *
   * 在不使用灵活大小调整或推入时，获取浮层的确切左/右。
   *
   */
  private _getExactOverlayX(position: ConnectedPosition,
                            originPoint: Point,
                            scrollPosition: ViewportScrollPosition) {
    // Reset any existing styles. This is necessary in case the preferred position has
    // changed since the last `apply`.
    let styles = {left: '', right: ''} as CSSStyleDeclaration;
    let overlayPoint = this._getOverlayPoint(originPoint, this._overlayRect, position);

    if (this._isPushed) {
      overlayPoint = this._pushOverlayOnScreen(overlayPoint, this._overlayRect, scrollPosition);
    }

    // We want to set either `left` or `right` based on whether the overlay wants to appear "before"
    // or "after" the origin, which determines the direction in which the element will expand.
    // For the horizontal axis, the meaning of "before" and "after" change based on whether the
    // page is in RTL or LTR.
    let horizontalStyleProperty: 'left' | 'right';

    if (this._isRtl()) {
      horizontalStyleProperty = position.overlayX === 'end' ? 'left' : 'right';
    } else {
      horizontalStyleProperty = position.overlayX === 'end' ? 'right' : 'left';
    }

    // When we're setting `right`, we adjust the x position such that it is the distance
    // from the right edge of the viewport rather than the left edge.
    if (horizontalStyleProperty === 'right') {
      const documentWidth = this._document.documentElement!.clientWidth;
      styles.right = `${documentWidth - (overlayPoint.x + this._overlayRect.width)}px`;
    } else {
      styles.left = coerceCssPixelValue(overlayPoint.x);
    }

    return styles;
  }

  /**
   * Gets the view properties of the trigger and overlay, including whether they are clipped
   * or completely outside the view of any of the strategy's scrollables.
   *
   * 获取触发器和浮层的视图属性，包括它们是否被裁剪或完全在此策略的任何可滚动视图的外部。
   *
   */
  private _getScrollVisibility(): ScrollingVisibility {
    // Note: needs fresh rects since the position could've changed.
    const originBounds = this._getOriginRect();
    const overlayBounds =  this._pane.getBoundingClientRect();

    // TODO(jelbourn): instead of needing all of the client rects for these scrolling containers
    // every time, we should be able to use the scrollTop of the containers if the size of those
    // containers hasn't changed.
    const scrollContainerBounds = this._scrollables.map(scrollable => {
      return scrollable.getElementRef().nativeElement.getBoundingClientRect();
    });

    return {
      isOriginClipped: isElementClippedByScrolling(originBounds, scrollContainerBounds),
      isOriginOutsideView: isElementScrolledOutsideView(originBounds, scrollContainerBounds),
      isOverlayClipped: isElementClippedByScrolling(overlayBounds, scrollContainerBounds),
      isOverlayOutsideView: isElementScrolledOutsideView(overlayBounds, scrollContainerBounds),
    };
  }

  /**
   * Subtracts the amount that an element is overflowing on an axis from its length.
   *
   * 从元素的长度中减去元素在轴上的溢出量。
   *
   */
  private _subtractOverflows(length: number, ...overflows: number[]): number {
    return overflows.reduce((currentValue: number, currentOverflow: number) => {
      return currentValue - Math.max(currentOverflow, 0);
    }, length);
  }

  /**
   * Narrows the given viewport rect by the current \_viewportMargin.
   *
   * 通过当前的 _viewportMargin 缩小指定的视口方框。
   *
   */
  private _getNarrowedViewportRect(): ClientRect {
    // We recalculate the viewport rect here ourselves, rather than using the ViewportRuler,
    // because we want to use the `clientWidth` and `clientHeight` as the base. The difference
    // being that the client properties don't include the scrollbar, as opposed to `innerWidth`
    // and `innerHeight` that do. This is necessary, because the overlay container uses
    // 100% `width` and `height` which don't include the scrollbar either.
    const width = this._document.documentElement!.clientWidth;
    const height = this._document.documentElement!.clientHeight;
    const scrollPosition = this._viewportRuler.getViewportScrollPosition();

    return {
      top:    scrollPosition.top + this._viewportMargin,
      left:   scrollPosition.left + this._viewportMargin,
      right:  scrollPosition.left + width - this._viewportMargin,
      bottom: scrollPosition.top + height - this._viewportMargin,
      width:  width  - (2 * this._viewportMargin),
      height: height - (2 * this._viewportMargin),
    };
  }

  /**
   * Whether the we're dealing with an RTL context
   *
   * 我们是否正在 RTL 上下文中
   *
   */
  private _isRtl() {
    return this._overlayRef.getDirection() === 'rtl';
  }

  /**
   * Determines whether the overlay uses exact or flexible positioning.
   *
   * 确定浮层使用的是精确定位还是灵活定位。
   *
   */
  private _hasExactPosition() {
    return !this._hasFlexibleDimensions || this._isPushed;
  }

  /**
   * Retrieves the offset of a position along the x or y axis.
   *
   * 获取沿 x 或 y 轴的位置偏移。
   *
   */
  private _getOffset(position: ConnectedPosition, axis: 'x' | 'y') {
    if (axis === 'x') {
      // We don't do something like `position['offset' + axis]` in
      // order to avoid breking minifiers that rename properties.
      return position.offsetX == null ? this._offsetX : position.offsetX;
    }

    return position.offsetY == null ? this._offsetY : position.offsetY;
  }

  /**
   * Validates that the current position match the expected values.
   *
   * 验证当前位置是否与期望值匹配。
   *
   */
  private _validatePositions(): void {
    if (typeof ngDevMode === 'undefined' || ngDevMode) {
      if (!this._preferredPositions.length) {
        throw Error('FlexibleConnectedPositionStrategy: At least one position is required.');
      }

      // TODO(crisbeto): remove these once Angular's template type
      // checking is advanced enough to catch these cases.
      this._preferredPositions.forEach(pair => {
        validateHorizontalPosition('originX', pair.originX);
        validateVerticalPosition('originY', pair.originY);
        validateHorizontalPosition('overlayX', pair.overlayX);
        validateVerticalPosition('overlayY', pair.overlayY);
      });
    }
  }

  /**
   * Adds a single CSS class or an array of classes on the overlay panel.
   *
   * 在浮层面板上添加一个或一组 CSS 类。
   *
   */
  private _addPanelClasses(cssClasses: string | string[]) {
    if (this._pane) {
      coerceArray(cssClasses).forEach(cssClass => {
        if (cssClass !== '' && this._appliedPanelClasses.indexOf(cssClass) === -1) {
          this._appliedPanelClasses.push(cssClass);
          this._pane.classList.add(cssClass);
        }
      });
    }
  }

  /**
   * Clears the classes that the position strategy has applied from the overlay panel.
   *
   * 从浮层面板中清除已应用定位策略的类。
   *
   */
  private _clearPanelClasses() {
    if (this._pane) {
      this._appliedPanelClasses.forEach(cssClass => {
        this._pane.classList.remove(cssClass);
      });
      this._appliedPanelClasses = [];
    }
  }

  /**
   * Returns the ClientRect of the current origin.
   *
   * 返回当前原点的 ClientRect。
   *
   */
  private _getOriginRect(): ClientRect {
    const origin = this._origin;

    if (origin instanceof ElementRef) {
      return origin.nativeElement.getBoundingClientRect();
    }

    // Check for Element so SVG elements are also supported.
    if (origin instanceof Element) {
      return origin.getBoundingClientRect();
    }

    const width = origin.width || 0;
    const height = origin.height || 0;

    // If the origin is a point, return a client rect as if it was a 0x0 element at the point.
    return {
      top: origin.y,
      bottom: origin.y + height,
      left: origin.x,
      right: origin.x + width,
      height,
      width
    };
  }
}

/**
 * A simple (x, y) coordinate.
 *
 * 一个简单的（x，y）坐标。
 *
 */
interface Point {
  x: number;
  y: number;
}

/**
 * Record of measurements for how an overlay (at a given position) fits into the viewport.
 *
 * 指定位置的浮层应该如何适合视口的测量记录。
 *
 */
interface OverlayFit {
  /**
   * Whether the overlay fits completely in the viewport.
   *
   * 浮层是否完全适合视口。
   *
   */
  isCompletelyWithinViewport: boolean;

  /**
   * Whether the overlay fits in the viewport on the y-axis.
   *
   * 浮层是否适合 y 轴上的视口。
   *
   */
  fitsInViewportVertically: boolean;

  /**
   * Whether the overlay fits in the viewport on the x-axis.
   *
   * 浮层是否适合 x 轴上的视口。
   *
   */
  fitsInViewportHorizontally: boolean;

  /**
   * The total visible area (in px^2) of the overlay inside the viewport.
   *
   * 视口内浮层的总可见区域（以 px^2 为单位）。
   *
   */
  visibleArea: number;
}

/**
 * Record of the measurments determining whether an overlay will fit in a specific position.
 *
 * 确定浮层是否适合特定位置的测量记录。
 *
 */
interface FallbackPosition {
  position: ConnectedPosition;
  originPoint: Point;
  overlayPoint: Point;
  overlayFit: OverlayFit;
  overlayRect: ClientRect;
}

/**
 * Position and size of the overlay sizing wrapper for a specific position.
 *
 * 特定位置的上浮层大小调整器的位置和大小。
 *
 */
interface BoundingBoxRect {
  top: number;
  left: number;
  bottom: number;
  right: number;
  height: number;
  width: number;
}

/**
 * Record of measures determining how well a given position will fit with flexible dimensions.
 *
 * 确定指定位置与灵活规格的适应程度的测量记录。
 *
 */
interface FlexibleFit {
  position: ConnectedPosition;
  origin: Point;
  overlayRect: ClientRect;
  boundingBoxRect: BoundingBoxRect;
}

/**
 * A connected position as specified by the user.
 *
 * 用户指定的连接位置。
 *
 */
export interface ConnectedPosition {
  originX: 'start' | 'center' | 'end';
  originY: 'top' | 'center' | 'bottom';

  overlayX: 'start' | 'center' | 'end';
  overlayY: 'top' | 'center' | 'bottom';

  weight?: number;
  offsetX?: number;
  offsetY?: number;
  panelClass?: string | string[];
}

/**
 * Shallow-extends a stylesheet object with another stylesheet object.
 *
 * 将样式表对象与另一个样式表对象一起浅扩展。
 *
 */
function extendStyles(destination: CSSStyleDeclaration,
                      source: CSSStyleDeclaration): CSSStyleDeclaration {
  for (let key in source) {
    if (source.hasOwnProperty(key)) {
      destination[key] = source[key];
    }
  }

  return destination;
}

/**
 * Extracts the pixel value as a number from a value, if it's a number
 * or a CSS pixel string (e.g. `1337px`). Otherwise returns null.
 *
 * 如果是数字或 CSS 像素字符串（例如 `1337px` ），则从值中提取像素值作为数字。否则返回 null。
 *
 */
function getPixelValue(input: number|string|null|undefined): number|null {
  if (typeof input !== 'number' && input != null) {
    const [value, units] = input.split(cssUnitPattern);
    return (!units || units === 'px') ? parseFloat(value) : null;
  }

  return input || null;
}

/**
 * Gets a version of an element's bounding `ClientRect` where all the values are rounded down to
 * the nearest pixel. This allows us to account for the cases where there may be sub-pixel
 * deviations in the `ClientRect` returned by the browser (e.g. when zoomed in with a percentage
 * size, see #21350).
 *
 * 获取元素边界 `ClientRect` 的版本，其中所有值均向下舍入到最接近的像素。`ClientRect` 可能存在亚像素偏差的情况（例如，以百分比大小放大时，请参阅＃21350）。
 *
 */
function getRoundedBoundingClientRect(clientRect: ClientRect): ClientRect {
  return {
    top: Math.floor(clientRect.top),
    right: Math.floor(clientRect.right),
    bottom: Math.floor(clientRect.bottom),
    left: Math.floor(clientRect.left),
    width: Math.floor(clientRect.width),
    height: Math.floor(clientRect.height)
  };
}
