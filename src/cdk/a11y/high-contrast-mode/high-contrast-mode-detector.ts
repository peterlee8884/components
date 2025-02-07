/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {Platform} from '@angular/cdk/platform';
import {DOCUMENT} from '@angular/common';
import {Inject, Injectable} from '@angular/core';

/**
 * Set of possible high-contrast mode backgrounds.
 *
 * 一组可能的高对比度模式背景。
 *
 */
export const enum HighContrastMode {
  NONE,
  BLACK_ON_WHITE,
  WHITE_ON_BLACK,
}

/**
 * CSS class applied to the document body when in black-on-white high-contrast mode.
 *
 * 黑白高对比度模式下，要应用于文档主体的 CSS 类。
 *
 */
export const BLACK_ON_WHITE_CSS_CLASS = 'cdk-high-contrast-black-on-white';

/**
 * CSS class applied to the document body when in white-on-black high-contrast mode.
 *
 * 在黑白高对比度模式下要应用于文档正文的 CSS 类。
 *
 */
export const WHITE_ON_BLACK_CSS_CLASS = 'cdk-high-contrast-white-on-black';

/**
 * CSS class applied to the document body when in high-contrast mode.
 *
 * 在高对比度模式下，要应用于文档主体的 CSS 类。
 *
 */
export const HIGH_CONTRAST_MODE_ACTIVE_CSS_CLASS = 'cdk-high-contrast-active';

/**
 * Service to determine whether the browser is currently in a high-contrast-mode environment.
 *
 * 本服务用于确定浏览器当前是否处于高对比度模式环境中。
 *
 * Microsoft Windows supports an accessibility feature called "High Contrast Mode". This mode
 * changes the appearance of all applications, including web applications, to dramatically increase
 * contrast.
 *
 * Microsoft Windows 支持一种称为“高对比度模式”的辅助功能。此模式更改所有应用程序（包括 Web 应用程序）的外观，以显著提高对比度。
 *
 * IE, Edge, and Firefox currently support this mode. Chrome does not support Windows High Contrast
 * Mode. This service does not detect high-contrast mode as added by the Chrome "High Contrast"
 * browser extension.
 *
 * 目前，IE、Edge 和 Firefox 支持此模式。Chrome 浏览器不支持 Windows 高对比度模式。此服务无法检测到由 Chrome 的“高对比度” 扩展程序添加的高对比度模式。
 *
 */
@Injectable({providedIn: 'root'})
export class HighContrastModeDetector {
  /**
   * Figuring out the high contrast mode and adding the body classes can cause
   * some expensive layouts. This flag is used to ensure that we only do it once.
   *
   * 检测高对比度模式并添加 body 上的类可能会导致某些昂贵的布局工作。此标志用于确保我们仅执行一次。
   *
   */
  private _hasCheckedHighContrastMode: boolean;
  private _document: Document;

  constructor(private _platform: Platform, @Inject(DOCUMENT) document: any) {
    this._document = document;
  }

  /**
   * Gets the current high-contrast-mode for the page.
   *
   * 获取页面的当前高对比度模式。
   *
   */
  getHighContrastMode(): HighContrastMode {
    if (!this._platform.isBrowser) {
      return HighContrastMode.NONE;
    }

    // Create a test element with an arbitrary background-color that is neither black nor
    // white; high-contrast mode will coerce the color to either black or white. Also ensure that
    // appending the test element to the DOM does not affect layout by absolutely positioning it
    const testElement = this._document.createElement('div');
    testElement.style.backgroundColor = 'rgb(1,2,3)';
    testElement.style.position = 'absolute';
    this._document.body.appendChild(testElement);

    // Get the computed style for the background color, collapsing spaces to normalize between
    // browsers. Once we get this color, we no longer need the test element. Access the `window`
    // via the document so we can fake it in tests. Note that we have extra null checks, because
    // this logic will likely run during app bootstrap and throwing can break the entire app.
    const documentWindow = this._document.defaultView || window;
    const computedStyle = (documentWindow && documentWindow.getComputedStyle) ?
        documentWindow.getComputedStyle(testElement) : null;
    const computedColor =
        (computedStyle && computedStyle.backgroundColor || '').replace(/ /g, '');
    this._document.body.removeChild(testElement);

    switch (computedColor) {
      case 'rgb(0,0,0)': return HighContrastMode.WHITE_ON_BLACK;
      case 'rgb(255,255,255)': return HighContrastMode.BLACK_ON_WHITE;
    }
    return HighContrastMode.NONE;
  }

  /**
   * Applies CSS classes indicating high-contrast mode to document body (browser-only).
   *
   * 将指示高对比度模式的 CSS 类应用于文档正文（仅浏览器）。
   *
   */
  _applyBodyHighContrastModeCssClasses(): void {
    if (!this._hasCheckedHighContrastMode && this._platform.isBrowser && this._document.body) {
      const bodyClasses = this._document.body.classList;
      // IE11 doesn't support `classList` operations with multiple arguments
      bodyClasses.remove(HIGH_CONTRAST_MODE_ACTIVE_CSS_CLASS);
      bodyClasses.remove(BLACK_ON_WHITE_CSS_CLASS);
      bodyClasses.remove(WHITE_ON_BLACK_CSS_CLASS);
      this._hasCheckedHighContrastMode = true;

      const mode = this.getHighContrastMode();
      if (mode === HighContrastMode.BLACK_ON_WHITE) {
        bodyClasses.add(HIGH_CONTRAST_MODE_ACTIVE_CSS_CLASS);
        bodyClasses.add(BLACK_ON_WHITE_CSS_CLASS);
      } else if (mode === HighContrastMode.WHITE_ON_BLACK) {
        bodyClasses.add(HIGH_CONTRAST_MODE_ACTIVE_CSS_CLASS);
        bodyClasses.add(WHITE_ON_BLACK_CSS_CLASS);
      }
    }
  }
}
