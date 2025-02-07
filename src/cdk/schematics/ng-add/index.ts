/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {Rule, SchematicContext, Tree} from '@angular-devkit/schematics';
import {NodePackageInstallTask} from '@angular-devkit/schematics/tasks';
import {addPackageToPackageJson, getPackageVersionFromPackageJson} from './package-config';

/**
 * Schematic factory entry-point for the `ng-add` schematic. The ng-add schematic will be
 * automatically executed if developers run `ng add @angular/cdk`.
 *
 * `ng-add` 原理图的工厂入口点。如果开发人员运行 `ng add @angular/cdk`，则 ng-add 原理图将自动执行。
 *
 * By default, the CLI already installs the package that has been specified with `ng add`.
 * We just store the version in the `package.json` in case the package manager didn't. Also
 * this ensures that there will be no error that says that the CDK does not support `ng add`.
 *
 * 默认情况下，CLI 已经安装了 `ng add` 指定的软件包。我们只是将版本存储在 `package.json` 中，以防软件包管理器没这么做。这也确保不会出现任何错误说 CDK 不支持 `ng add`。
 *
 */
export default function(): Rule {
  return (host: Tree, context: SchematicContext) => {
    // The CLI inserts `@angular/cdk` into the `package.json` before this schematic runs. This
    // means that we do not need to insert the CDK into `package.json` files again. In some cases
    // though, it could happen that this schematic runs outside of the CLI `ng add` command, or
    // the CDK is only listed as a dev dependency. If that is the case, we insert a version based
    // on the current build version (substituted version placeholder).
    if (getPackageVersionFromPackageJson(host, '@angular/cdk') === null) {
      // In order to align the CDK version with other Angular dependencies that are setup by
      // `@schematics/angular`, we use tilde instead of caret. This is default for Angular
      // dependencies in new CLI projects.
      addPackageToPackageJson(host, '@angular/cdk', `~0.0.0-PLACEHOLDER`);

      // Add a task to run the package manager. This is necessary because we updated the
      // workspace "package.json" file and we want lock files to reflect the new version range.
      context.addTask(new NodePackageInstallTask());
    }
  };
}
