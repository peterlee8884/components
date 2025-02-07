/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {HarnessPredicate} from '@angular/cdk/testing';
import {
  _MatSlideToggleHarnessBase,
  SlideToggleHarnessFilters
} from '@angular/material/slide-toggle/testing';


/** Harness for interacting with a MDC-based mat-slide-toggle in tests. */
export class MatSlideToggleHarness extends _MatSlideToggleHarnessBase {
  static hostSelector = '.mat-mdc-slide-toggle';

  /**
   * Gets a `HarnessPredicate` that can be used to search for a slide-toggle w/ specific attributes.
   * @param options Options for narrowing the search:
   *   - `selector` finds a slide-toggle whose host element matches the given selector.
   *   - `label` finds a slide-toggle with specific label text.
   * @return a `HarnessPredicate` configured with the given options.
   *
   * 用指定选项配置过的 `HarnessPredicate` 服务。
   */
  static with(options: SlideToggleHarnessFilters = {}): HarnessPredicate<MatSlideToggleHarness> {
    return new HarnessPredicate(MatSlideToggleHarness, options)
        .addOption('label', options.label,
            (harness, label) => HarnessPredicate.stringMatches(harness.getLabelText(), label))
        // We want to provide a filter option for "name" because the name of the slide-toggle is
        // only set on the underlying input. This means that it's not possible for developers
        // to retrieve the harness of a specific checkbox with name through a CSS selector.
        .addOption('name', options.name, async (harness, name) => await harness.getName() === name);
  }

  private _inputContainer = this.locatorFor('.mdc-switch');

  async toggle(): Promise<void> {
    const elToClick = await this.isDisabled() ? this._inputContainer() : this._input();
    return (await elToClick).click();
  }
}
