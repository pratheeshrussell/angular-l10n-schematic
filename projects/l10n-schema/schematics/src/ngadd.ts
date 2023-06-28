import {
  Rule,
  SchematicContext,
  Tree,
  mergeWith,
  url,
  apply,
  move,
  chain,
  MergeStrategy,
  template,
} from '@angular-devkit/schematics';
import { normalize } from '@angular-devkit/core';
import { NodePackageInstallTask } from '@angular-devkit/schematics/tasks';

import {
  insertImport,insertAfterLastOccurrence,
  addImportToModule,findNodes
} from '@schematics/angular/utility/ast-utils';
import * as ts from 'typescript';
import { applyToUpdateRecorder } from '@schematics/angular/utility/change';
/**
 * This is executed when `ng add l10n-schema` is run.
 * It does nothing so far.
 */
export function ngAdd(): Rule {
  return (_tree: Tree, context: SchematicContext) => {
    context.logger.info('Copying config files...');

    const templateSource = apply(url(normalize('./files/init/')), [
      template({}),
      move(normalize('/src/app/')),
    ]);
    return chain([
      mergeWith(templateSource, MergeStrategy.Overwrite),
      (tree: Tree, context: SchematicContext) => {
        tree.rename(
          '/src/app/i10nconfig.ts.template',
          '/src/app/i10nconfig.ts'
        );
        context.logger.info('Adding angular-l10n package...');
        // Add package to package json
        addPackageToPackageJson(tree, 'angular-l10n', '16.0.0');
        // Run npm install
        context.addTask(new NodePackageInstallTask());
        return tree;
      },
      addL10nTranslationModule,
    ]);
  };
}

function addPackageToPackageJson(
  tree: Tree,
  pkg: string,
  version: string,
  devDependency = false
): Tree {
  if (tree.exists('package.json')) {
    const sourceText = tree.read('package.json')!.toString('utf-8');
    const json = JSON.parse(sourceText);

    const dependenciesType = devDependency ? 'devDependencies' : 'dependencies';
    const dependencies = json[dependenciesType] || {};

    if (!dependencies[pkg]) {
      dependencies[pkg] = version;
    }

    tree.overwrite('package.json', JSON.stringify(json, null, 2));
  }

  return tree;
}

function addL10nTranslationModule(): Rule {
  return (tree: Tree, context: SchematicContext) => {
    const modulePath = '/src/app/app.module.ts'; 
    // Read the module file
    const moduleContent = tree.read(modulePath);
    if (!moduleContent) {
      context.logger.error(`File not found: ${modulePath}`);
      return;
    }

    // Create an AST from the module file
    const source = ts.createSourceFile(
      modulePath,
      moduleContent.toString(),
      ts.ScriptTarget.Latest,
      true
    );
      
    // find the imports array todo: correct this
    const imports = findNodes(source, ts.SyntaxKind.Identifier)
    .filter(n => n.getText() === 'imports');
    // Update the module file with the import statement
    const changes = [
      insertImport(source, modulePath, 'L10nTranslationModule', 'angular-l10n'),
      // Try separating with a comma
      insertImport(source, modulePath, 'TranslationLoader', './i10nconfig'),
      insertImport(source, modulePath, 'l10nConfig', './i10nconfig'),
      // notice the , --> assuming there will be some module before it
      insertAfterLastOccurrence(
        imports.pop()?.parent?.getChildren()!,
        `,L10nTranslationModule.forRoot(l10nConfig, { translationLoader: TranslationLoader })`,
        modulePath,0,ts.SyntaxKind.Identifier
        ),
    ];

    // Apply the changes to the tree
    const recorder = tree.beginUpdate(modulePath);

    applyToUpdateRecorder(recorder, changes);
    applyToUpdateRecorder(
      recorder,
      addImportToModule(source, modulePath, 'L10nIntlModule', 'angular-l10n')
    );

    tree.commitUpdate(recorder);

    return tree;
  };
}