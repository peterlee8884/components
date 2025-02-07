/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import * as ts from 'typescript';
import {Migration} from '../../update-tool/migration';
import {PropertyNameUpgradeData} from '../data/property-names';
import {determineBaseTypes} from '../typescript/base-types';
import {getVersionUpgradeData, UpgradeData} from '../upgrade-data';

/**
 * Migration that identifies class declarations that extend CDK or Material classes
 * which had a public property change.
 *
 * 本迁移用于标识出一些类声明，它们扩展了具有公共属性更改的 CDK 或 Material 类。
 *
 */
export class ClassInheritanceMigration extends Migration<UpgradeData> {
  /**
   * Map of classes that have been updated. Each class name maps to the according property
   * change data.
   *
   * 已更新类的映射表。每个类名称都映射到相应的属性更改数据。
   *
   */
  propertyNames = new Map<string, PropertyNameUpgradeData>();

  // Only enable the migration rule if there is upgrade data.
  enabled = this.propertyNames.size !== 0;

  init(): void {
    getVersionUpgradeData(this, 'propertyNames')
        .filter(data => data.limitedTo && data.limitedTo.classes)
        .forEach(
            data => data.limitedTo.classes.forEach(name => this.propertyNames.set(name, data)));
  }

  visitNode(node: ts.Node): void {
    if (ts.isClassDeclaration(node)) {
      this._visitClassDeclaration(node);
    }
  }

  private _visitClassDeclaration(node: ts.ClassDeclaration) {
    const baseTypes = determineBaseTypes(node);
    const className = node.name ? node.name.text : '{unknown-name}';

    if (!baseTypes) {
      return;
    }

    baseTypes.forEach(typeName => {
      const data = this.propertyNames.get(typeName);

      if (data) {
        this.createFailureAtNode(
            node,
            `Found class "${className}" which extends class ` +
                `"${typeName}". Please note that the base class property ` +
                `"${data.replace}" has changed to "${data.replaceWith}". ` +
                `You may need to update your class as well.`);
      }
    });
  }
}
