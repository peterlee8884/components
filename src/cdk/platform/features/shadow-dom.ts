/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

let shadowDomIsSupported: boolean;

/**
 * Checks whether the user's browser support Shadow DOM.
 *
 * 检查用户的浏览器是否支持 Shadow DOM。
 *
 */
export function _supportsShadowDom(): boolean {
  if (shadowDomIsSupported == null) {
    const head = typeof document !== 'undefined' ? document.head : null;
    shadowDomIsSupported = !!(head && ((head as any).createShadowRoot || head.attachShadow));
  }

  return shadowDomIsSupported;
}

/**
 * Gets the shadow root of an element, if supported and the element is inside the Shadow DOM.
 *
 * 获取元素的 Shadow DOM 根（如果支持并且该元素在 Shadow DOM 内）。
 *
 */
export function _getShadowRoot(element: HTMLElement): ShadowRoot | null {
  if (_supportsShadowDom()) {
    const rootNode = element.getRootNode ? element.getRootNode() : null;

    // Note that this should be caught by `_supportsShadowDom`, but some
    // teams have been able to hit this code path on unsupported browsers.
    if (typeof ShadowRoot !== 'undefined' && ShadowRoot && rootNode instanceof ShadowRoot) {
      return rootNode;
    }
  }

  return null;
}
