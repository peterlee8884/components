/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {ComponentHarness, HarnessPredicate} from '@angular/cdk/testing';
import {IconHarnessFilters, IconType} from './icon-harness-filters';

/**
 * Harness for interacting with a standard mat-icon in tests.
 *
 * 在测试中用来与标准 mat-icon 进行交互的测试工具。
 *
 */
export class MatIconHarness extends ComponentHarness {
  /**
   * The selector for the host element of a `MatIcon` instance.
   *
   * `MatIcon` 实例的宿主元素选择器。
   *
   */
  static hostSelector = '.mat-icon';

  /**
   * Gets a `HarnessPredicate` that can be used to search for a `MatIconHarness` that meets
   * certain criteria.
   *
   * 获取一个 `HarnessPredicate`，可用于搜索满足某些条件的 `MatIconHarness`。
   *
   * @param options Options for filtering which icon instances are considered a match.
   *
   * 用于过滤哪些图标实例应该视为匹配的选项。
   *
   * @return a `HarnessPredicate` configured with the given options.
   *
   * 用指定选项配置过的 `HarnessPredicate` 服务。
   */
  static with(options: IconHarnessFilters = {}): HarnessPredicate<MatIconHarness> {
    return new HarnessPredicate(MatIconHarness, options)
        .addOption('type', options.type,
            async (harness, type) => (await harness.getType()) === type)
        .addOption('name', options.name,
            (harness, text) => HarnessPredicate.stringMatches(harness.getName(), text))
        .addOption('namespace', options.namespace,
            (harness, text) => HarnessPredicate.stringMatches(harness.getNamespace(), text));
  }

  /**
   * Gets the type of the icon.
   *
   * 获取此图标的类型。
   *
   */
  async getType(): Promise<IconType> {
    const type = await (await this.host()).getAttribute('data-mat-icon-type');
    return type === 'svg' ? IconType.SVG : IconType.FONT;
  }

  /**
   * Gets the name of the icon.
   *
   * 获取此图标的名称。
   *
   */
  async getName(): Promise<string | null> {
    const host = await this.host();
    const nameFromDom = await host.getAttribute('data-mat-icon-name');

    // If we managed to figure out the name from the attribute, use it.
    if (nameFromDom) {
      return nameFromDom;
    }

    // Some icons support defining the icon as a ligature.
    // As a fallback, try to extract it from the DOM text.
    if (await this.getType() === IconType.FONT) {
      return host.text();
    }

    return null;
  }

  /**
   * Gets the namespace of the icon.
   *
   * 获取此图标的命名空间。
   *
   */
  async getNamespace(): Promise<string | null> {
    return (await this.host()).getAttribute('data-mat-icon-namespace');
  }

  /**
   * Gets whether the icon is inline.
   *
   * 获取此图标是否为嵌入式。
   *
   */
  async isInline(): Promise<boolean> {
    return (await this.host()).hasClass('mat-icon-inline');
  }
}
