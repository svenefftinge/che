/*
 * Copyright (c) 2015-2017 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */
'use strict';
import {CheWorkspace, WorkspaceStatus} from '../../../components/api/che-workspace.factory';
import {CheNotification} from '../../../components/notification/che-notification.factory';
import IdeSvc from '../../ide/ide.service';
import {CreateWorkspaceSvc} from '../create-workspace/create-workspace.service';
import {IObservable, Observable} from '../../../components/utils/observable';
import {WorkspaceDetailsProjectsService} from './workspace-projects/workspace-details-projects.service';

interface IPage {
  title: string;
  content: string;
  icon: string;
  index: number;
}

interface ISection {
 title: string;
 description: string;
 content: string;
}

/**
 * This class is handling the data for workspace details sections (tabs)
 *
 * @author Ann Shumilova
 */
export class WorkspaceDetailsService {
  /**
   * Logging service.
   */
  private $log: ng.ILogService;
  /**
   * Promises service.
   */
  private $q: ng.IQService;
  /**
   * Workspace API interaction.
   */
  private cheWorkspace: CheWorkspace;
  /**
   * Notification factory.
   */
  private cheNotification: CheNotification;
  /**
   * IDE service.
   */
  private ideSvc: IdeSvc;
  /**
   * Workspace creation service.
   */
  private createWorkspaceSvc: CreateWorkspaceSvc;
  /**
   * Service for projects of workspace.
   */
  private workspaceDetailsProjectsService: WorkspaceDetailsProjectsService;
  /**
   * Instance of Observable.
   */
  private observable: IObservable<any>;

  private pages: IPage[];
  private sections: ISection[];

  /**
   * Default constructor that is using resource
   * @ngInject for Dependency injection
   */
  constructor (
    $log: ng.ILogService,
    $q: ng.IQService,
    cheWorkspace: CheWorkspace,
    cheNotification: CheNotification,
    ideSvc: IdeSvc,
    createWorkspaceSvc: CreateWorkspaceSvc,
    workspaceDetailsProjectsService: WorkspaceDetailsProjectsService
  ) {
    this.$log = $log;
    this.$q = $q;
    this.cheWorkspace = cheWorkspace;
    this.cheNotification = cheNotification;
    this.ideSvc = ideSvc;
    this.createWorkspaceSvc = createWorkspaceSvc;
    this.workspaceDetailsProjectsService = workspaceDetailsProjectsService;

    this.observable =  new Observable<any>();

    this.pages = [];
    this.sections = [];
  }

  /**
   * Add new page(tab) to the workspace details.
   *
   * @param title page title
   * @param content page html content
   * @param icon page icon
   * @param index optional page index (order)
   */
  addPage(title: string, content: string, icon: string, index: number): void {
    let page: IPage = {
      title: title,
      content: content,
      icon: icon,
      index: index || this.pages.length
    };
    this.pages.push(page);
  }

  /**
   * Adds new section in workspace details.
   *
   * @param title title of the section
   * @param description description of teh section (optional)
   * @param content html content of the section
   */
  addSection(title: string, description: string, content: string): void {
    let section: ISection = {
      title: title,
      description: description,
      content: content
    };

    this.sections.push(section);
  }

  /**
   * Returns workspace details pages(tabs).
   *
   * @returns {Array} array of pages(tabs)
   */
  getPages(): IPage[] {
    return this.pages;
  }

  /**
   * Returns the array of workspace details sections.
   *
   * @returns {ISection[]} list of sections
   */
  getSections(): ISection[] {
    return this.sections;
  }

  /**
   * Returns current status of workspace.
   *
   * @param {string} workspaceId workspace ID
   * @return {string}
   */
  getWorkspaceStatus(workspaceId: string): string {
    const unknownStatus = 'unknown';
    const workspace = this.cheWorkspace.getWorkspaceById(workspaceId);
    return workspace ? workspace.status : unknownStatus;
  }

  /**
   * Returns <code>true</code> if workspace has to be running to apply changes.
   *
   * @return {boolean}
   */
  needRunningToUpdate(): boolean {
    return this.workspaceDetailsProjectsService.getProjectTemplates().length > 0 || this.workspaceDetailsProjectsService.getProjectNamesToDelete().length > 0;
  }

  /**
   * Updates workspace with config's changes, creates and/or removes projects.
   *
   * @param {che.IWorkspace} oldWorkspace old workspace details
   * @param {che.IWorkspace} newWorkspace new workspace details
   * @return {angular.IPromise<any>}
   */
  applyChanges(oldWorkspace: che.IWorkspace, newWorkspace: che.IWorkspace): ng.IPromise<any> {
    const projectTemplatesToAdd = this.workspaceDetailsProjectsService.getProjectTemplates(),
          hasProjectsToAdd = projectTemplatesToAdd.length > 0,
          projectNamesToDelete = this.workspaceDetailsProjectsService.getProjectNamesToDelete(),
          hasProjectsToDelete = projectNamesToDelete.length > 0,
          hasConfigChanges = !projectTemplatesToAdd.length && !projectNamesToDelete.length && false === angular.equals(oldWorkspace.config, newWorkspace.config);

    return this.$q.when().then(() => {
      /* Stop workspace */

      const status = this.getWorkspaceStatus(newWorkspace.id);

      if (WorkspaceStatus[status] === WorkspaceStatus.STARTING || WorkspaceStatus[status] === WorkspaceStatus.RUNNING) {
        this.stopWorkspace(newWorkspace.id);
        return this.cheWorkspace.fetchStatusChange(newWorkspace.id, WorkspaceStatus[WorkspaceStatus.STOPPED]);
      }

      if (WorkspaceStatus[status] === WorkspaceStatus.STOPPING || WorkspaceStatus[status] === WorkspaceStatus.SNAPSHOTTING) {
        return this.cheWorkspace.fetchStatusChange(newWorkspace.id, WorkspaceStatus[WorkspaceStatus.STOPPED]);
      }

      return this.$q.when();

    }).then(() => {
      /* Apply config changes, add projects */

      if (!hasProjectsToAdd && !hasConfigChanges) {
        return this.$q.when();
      }

      return this.applyConfigChanges(newWorkspace);

    }).then(() => {
      /* Run workspace */

      const status = this.getWorkspaceStatus(newWorkspace.id);

      if (WorkspaceStatus[status] === WorkspaceStatus.RUNNING) {
        return this.$q.when();
      }

      if (WorkspaceStatus[status] === WorkspaceStatus.STARTING) {
        return this.cheWorkspace.fetchStatusChange(newWorkspace.id, WorkspaceStatus[WorkspaceStatus.RUNNING]);
      }

      this.cheWorkspace.startWorkspace(newWorkspace.id, newWorkspace.config.defaultEnv);
      return this.cheWorkspace.fetchStatusChange(newWorkspace.id, WorkspaceStatus[WorkspaceStatus.RUNNING]).then(() => {
        return this.cheWorkspace.fetchWorkspaceDetails(newWorkspace.id);
      });

    }).then(() => {
      /* Delete projects */

      if (projectNamesToDelete.length === 0) {
        return this.$q.when();
      }

      return this.workspaceDetailsProjectsService.deleteSelectedProjects(newWorkspace.id, projectNamesToDelete);

    }).then(() => {
      /* Add project commands if there are new projects added */

      if (!hasProjectsToDelete) {
        return this.$q.when();
      }

      // add commands
      return this.createWorkspaceSvc.addProjectCommands(newWorkspace.id, projectTemplatesToAdd);
    });
  }

  /**
   * Updates workspace config.
   *
   * @param {che.IWorkspace} workspace new workspace details
   * @return {angular.IPromise<any>}
   */
  applyConfigChanges(workspace: che.IWorkspace): ng.IPromise<any> {
    delete workspace.links;

    return this.cheWorkspace.updateWorkspace(workspace.id, workspace).catch((error: any) => {
      this.$log.error(error);
      return this.$q.reject(error);
    });
  }

  /**
   * Starts the workspace.
   *
   * @param {che.IWorkspace} workspace
   * @return {angular.IPromise<any>}
   */
  runWorkspace(workspace: che.IWorkspace): ng.IPromise<any> {
    return this.ideSvc.startIde(workspace).catch((error: any) => {
      let errorMessage;

      if (!error || !(error.data || error.error)) {
        errorMessage = 'Unable to start this workspace.';
      } else if (error.error) {
        errorMessage = error.error;
      } else if (error.data.errorCode === 10000 && error.data.attributes) {
        let attributes = error.data.attributes;

        errorMessage = 'Unable to start this workspace.' +
          ' There are ' + attributes.workspaces_count + ' running workspaces consuming ' +
          attributes.used_ram + attributes.ram_unit + ' RAM.' +
          ' Your current RAM limit is ' + attributes.limit_ram + attributes.ram_unit +
          '. This workspace requires an additional ' +
          attributes.required_ram + attributes.ram_unit + '.' +
          '  You can stop other workspaces to free resources.';
      } else {
        errorMessage = error.data.message;
      }

      this.cheNotification.showError(errorMessage);
      this.$log.error(error);

      return this.$q.reject({message: errorMessage});
    });
  }

  /**
   * Stops the workspace.
   *
   * @param {string} workspaceId
   * @param {boolean} isCreateSnapshot
   * @return {angular.IPromise<any>}
   */
  stopWorkspace(workspaceId: string, isCreateSnapshot?: boolean): ng.IPromise<any> {
    if (this.getWorkspaceStatus(workspaceId) === 'STARTING') {
      isCreateSnapshot = false;
    } else if (angular.isUndefined(isCreateSnapshot)) {
      isCreateSnapshot = this.getAutoSnapshot();
    }

    return this.cheWorkspace.stopWorkspace(workspaceId, isCreateSnapshot).catch((error: any) => {
      this.cheNotification.showError('Stop workspace failed.', error);
      this.$log.error(error);

      return this.$q.reject(error);
    });
  }

  /**
   * Returns the value of workspace auto-snapshot property.
   *
   * @returns {boolean} workspace auto-snapshot property value
   */
  getAutoSnapshot(): boolean {
    return this.cheWorkspace.getAutoSnapshotSettings();
  }

}
