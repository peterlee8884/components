/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {browser} from 'protractor';
import {getElement, FinderResult, Point} from './query';

/**
 * Presses a single key or a sequence of keys.
 *
 * 按一个键或一系列键。
 *
 */
export async function pressKeys(...keys: string[]) {
  const actions = browser.actions();
  await actions.sendKeys(...keys).perform();
}

/**
 * Clicks an element at a specific point. Useful if there's another element
 * that covers part of the target and can catch the click.
 *
 * 单击特定位置的元素。如果还有另一个元素覆盖了目标的一部分并且可以捕获点击，这就很有用。
 *
 */
export async function clickElementAtPoint(element: FinderResult, coords: Point) {
  const webElement = await getElement(element).getWebElement();
  await browser.actions().mouseMove(webElement, coords).click().perform();
}
