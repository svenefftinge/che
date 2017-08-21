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

import {CheWorkspaceAgent} from '../che-workspace-agent';
import {ComposeEnvironmentManager} from '../environment/compose-environment-manager';
import {DockerFileEnvironmentManager} from '../environment/docker-file-environment-manager';
import {DockerImageEnvironmentManager} from '../environment/docker-image-environment-manager';
import {CheEnvironmentRegistry} from '../environment/che-environment-registry.factory';
import {CheJsonRpcMasterApi} from '../json-rpc/che-json-rpc-master-api';
import {CheJsonRpcApi} from '../json-rpc/che-json-rpc-api.factory';
import {CheBranding} from './../branding/che-branding.factory';
import {IObservableCallbackFn, Observable} from './../../utils/observable';

interface ICHELicenseResource<T> extends ng.resource.IResourceClass<T> {
  create: any;
  createWithNamespace: any;
  deleteWorkspace: any;
  updateWorkspace: any;
  addProject: any;
  deleteProject: any;
  stopWorkspace: any;
  startWorkspace: any;
  startTemporaryWorkspace: any;
  addCommand: any;
  getSettings: any;
}

export enum WorkspaceStatus {
  RUNNING = 1,
  STOPPED,
  PAUSED,
  STARTING,
  STOPPING,
  SNAPSHOTTING,
  ERROR
}

/**
 * This class is handling the workspace retrieval
 * It sets to the array workspaces the current workspaces which are not temporary
 * @author Florent Benoit
 */
export class CheWorkspace {
  private $resource: ng.resource.IResourceService;
  private $http: ng.IHttpService;
  private $q: ng.IQService;
  private $log: ng.ILogService;
  private $websocket: ng.websocket.IWebSocketProvider;
  private cheJsonRpcMasterApi: CheJsonRpcMasterApi;
  private listeners: Array<any>;
  private workspaces: Array<che.IWorkspace>;
  private subscribedWorkspacesIds: Array<string>;
  private workspaceAgents: Map<string, CheWorkspaceAgent>;
  private workspacesByNamespace: Map<string, Array<che.IWorkspace>>;
  private workspacesById: Map<string, che.IWorkspace>;
  private remoteWorkspaceAPI: ICHELicenseResource<any>;
  private lodash: any;
  private statusDefers: Object;
  private workspaceSettings: any;
  private jsonRpcApiLocation: string;
  /**
   * Map with instance of Observable by workspaceId.
   */
  private observables: Map<string, Observable<che.IWorkspace>> = new Map();
  /**
   * Map with promises.
   */
  private workspaceDetailsByKeyPromise: Map<string, ng.IHttpPromise<any>> = new Map();


  /**
   * Default constructor that is using resource
   * @ngInject for Dependency injection
   */
  constructor($resource: ng.resource.IResourceService, $http: ng.IHttpService, $q: ng.IQService, cheJsonRpcApi: CheJsonRpcApi,
              $websocket: ng.websocket.IWebSocketProvider, $location: ng.ILocationService, proxySettings : string, userDashboardConfig: any,
              lodash: any, cheEnvironmentRegistry: CheEnvironmentRegistry, $log: ng.ILogService, cheBranding: CheBranding) {
    // keep resource
    this.$q = $q;
    this.$resource = $resource;
    this.$http = $http;
    this.$log = $log;
    this.$websocket = $websocket;
    this.lodash = lodash;

    // current list of workspaces
    this.workspaces = [];

    // per Id
    this.workspacesById = new Map();

    // per namespace
    this.workspacesByNamespace = new Map();

    // workspace agents per workspace id:
    this.workspaceAgents = new Map();

    // listeners if workspaces are changed/updated
    this.listeners = [];

    // list of subscribed to websocket workspace Ids
    this.subscribedWorkspacesIds = [];
    this.statusDefers = {};

    // remote call
    this.remoteWorkspaceAPI = <ICHELicenseResource<any>>this.$resource('/api/workspace', {}, {
        // having 2 methods for creation to ensure namespace parameter won't be send at all if value is null or undefined
        create: {method: 'POST', url: '/api/workspace'},
        createWithNamespace: {method: 'POST', url: '/api/workspace?namespace=:namespace'},
        deleteWorkspace: {method: 'DELETE', url: '/api/workspace/:workspaceId'},
        updateWorkspace: {method: 'PUT', url: '/api/workspace/:workspaceId'},
        addProject: {method: 'POST', url: '/api/workspace/:workspaceId/project'},
        deleteProject: {method: 'DELETE', url: '/api/workspace/:workspaceId/project/:path'},
        stopWorkspace: {method: 'DELETE', url: '/api/workspace/:workspaceId/runtime?create-snapshot=:createSnapshot'},
        startWorkspace: {method: 'POST', url: '/api/workspace/:workspaceId/runtime?environment=:envName'},
        startTemporaryWorkspace: {method: 'POST', url: '/api/workspace/runtime?temporary=true'},
        addCommand: {method: 'POST', url: '/api/workspace/:workspaceId/command'},
        getSettings: {method: 'GET', url: '/api/workspace/settings'}
      }
    );

    cheEnvironmentRegistry.addEnvironmentManager('compose', new ComposeEnvironmentManager($log));
    cheEnvironmentRegistry.addEnvironmentManager('dockerfile', new DockerFileEnvironmentManager($log));
    cheEnvironmentRegistry.addEnvironmentManager('dockerimage', new DockerImageEnvironmentManager($log));

    this.fetchWorkspaceSettings();

    const CONTEXT_FETCHER_ID = 'websocketContextFetcher';
    const callback = () => {
      this.jsonRpcApiLocation = this.formJsonRpcApiLocation($location, proxySettings, userDashboardConfig.developmentMode) + cheBranding.getWebsocketContext();
      this.cheJsonRpcMasterApi = cheJsonRpcApi.getJsonRpcMasterApi(this.jsonRpcApiLocation);
      cheBranding.unregisterCallback(CONTEXT_FETCHER_ID);
    };
    cheBranding.registerCallback(CONTEXT_FETCHER_ID, callback.bind(this));
  }

  /**
   * Add callback to the list of on workspace change subscribers.
   *
   * @param {string} workspaceId
   * @param {IObservableCallbackFn<che.IWorkspace>} action the callback
   */
  subscribeOnWorkspaceChange(workspaceId: string, action: IObservableCallbackFn<che.IWorkspace>): void {
    if (!workspaceId || !action) {
      return;
    }
    if (!this.observables.has(workspaceId)) {
      this.observables.set(workspaceId, new Observable());
    }

    const observable = this.observables.get(workspaceId);
    observable.subscribe(action);
  }

  /**
   * Unregister on workspace change callback.
   *
   * @param {string} workspaceId
   * @param {IObservableCallbackFn<che.IWorkspace>} action the callback
   */
  unsubscribeOnWorkspaceChange(workspaceId: string, action: IObservableCallbackFn<che.IWorkspace>): void {
    const observable = this.observables.get(workspaceId);
    if (!observable) {
      return;
    }
    observable.unsubscribe(action);
  }

  /**
   * Gets workspace agent
   * @param workspaceId {string}
   * @returns {CheWorkspaceAgent}
   */
  getWorkspaceAgent(workspaceId: string): CheWorkspaceAgent {
    if (this.workspaceAgents.has(workspaceId)) {
      return this.workspaceAgents.get(workspaceId);
    }

    let runtimeConfig = this.getWorkspaceById(workspaceId).runtime;
    if (runtimeConfig) {
      let wsAgentLink = this.lodash.find(runtimeConfig.links, (link: any) => {
        return link.rel === 'wsagent';
      });

      if (!wsAgentLink) {
        return null;
      }

      let wsAgentWebocketLink;
      if (runtimeConfig.devMachine) {
        let websocketLink = this.lodash.find(runtimeConfig.devMachine.links, (link: any) => {
          return link.rel === 'wsagent.websocket';
        });
        wsAgentWebocketLink = websocketLink ? websocketLink.href : '';
        wsAgentWebocketLink = wsAgentWebocketLink.replace('/api/ws', '');
      }

      let workspaceAgentData = {path: wsAgentLink.href, websocket: wsAgentWebocketLink, clientId: this.cheJsonRpcMasterApi.getClientId()};
      let wsagent: CheWorkspaceAgent = new CheWorkspaceAgent(this.$resource, this.$q, this.$websocket, workspaceAgentData);
      this.workspaceAgents.set(workspaceId, wsagent);
      return wsagent;
    }
    return null;
  }

  /**
   * Gets all workspace agents of this remote
   * @returns {Map<string, CheWorkspaceAgent>}
   */
  getWorkspaceAgents(): Map<string, CheWorkspaceAgent> {
    return this.workspaceAgents;
  }

  /**
   * Add a listener that need to have the onChangeWorkspaces(workspaces: Array) method
   * @param listener {Function} a changing listener
   */
  addListener(listener: Function): void {
    this.listeners.push(listener);
  }


  /**
   * Gets the workspaces of this remote
   * @returns {Array}
   */
  getWorkspaces(): Array<che.IWorkspace> {
    return this.workspaces;
  }

  /**
   * Gets the workspaces per id
   * @returns {Map}
   */
  getWorkspacesById(): Map<string, che.IWorkspace> {
    return this.workspacesById;
  }

  getWorkspaceByName(namespace: string, name: string): che.IWorkspace {
    return this.lodash.find(this.workspaces, (workspace: che.IWorkspace) => {
      return workspace.namespace === namespace && workspace.config.name === name;
    });
  }

  /**
   * Fetches workspaces by provided namespace.
   *
   * @param namespace namespace
   */
  fetchWorkspacesByNamespace(namespace: string): ng.IPromise<any> {
    let promise = this.$http.get('/api/workspace/namespace/' + namespace);
    let resultPromise = promise.then((response: { data: che.IWorkspace[] }) => {
      const workspaces = this.getWorkspacesByNamespace(namespace);

      workspaces.length = 0;
      response.data.forEach((workspace: che.IWorkspace) => {
        workspaces.push(workspace);
        this.updateWorkspacesList(workspace);
      });
    });

    return resultPromise;
  }

  getWorkspacesByNamespace(namespace: string): Array<che.IWorkspace> {
    if (!this.workspacesByNamespace.has(namespace)) {
      this.workspacesByNamespace.set(namespace, []);
    }

    return this.workspacesByNamespace.get(namespace);
  }

  /**
   * Gets the workspace by id
   * @param id {string} - workspace id
   * @returns {che.IWorkspace}
   */
  getWorkspaceById(id: string): che.IWorkspace {
    return this.workspacesById.get(id);
  }


  /**
   * Ask for loading the workspaces in asynchronous way
   * If there are no changes, it's not updated
   * @returns {ng.IPromise<any>}
   */
  fetchWorkspaces(): ng.IPromise<any> {
    let promise = this.remoteWorkspaceAPI.query().$promise;
    let updatedPromise = promise.then((data: Array<che.IWorkspace>) => {
      this.workspaces.length = 0;
      this.workspacesById.clear();
      // add workspace if not temporary
      data.forEach((workspace: che.IWorkspace) => {
        this.updateWorkspacesList(workspace);
      });
      return this.workspaces;
    }, (error: any) => {
      if (error.status === 304) {
        return this.workspaces;
      }
      return this.$q.reject(error);
    });

    let callbackPromises = updatedPromise.then((data: any) => {
      let promises = [];
      promises.push(updatedPromise);

      this.listeners.forEach((listener: any) => {
        let promise = listener.onChangeWorkspaces(data);
        promises.push(promise);
      });
      return this.$q.all(promises);
    }, (error: any) => {
      return this.$q.reject(error);
    });

    return callbackPromises;
  }

  /**
   * Fetch workspace details by workspace's key.
   *
   * @param workspaceKey {string} workspace key: can be just id or namespace:workspaceName pair
   * @returns {ng.IPromise<any>}
   */
  fetchWorkspaceDetails(workspaceKey: string): ng.IPromise<any> {
    if (this.workspaceDetailsByKeyPromise.has(workspaceKey)) {
      return this.workspaceDetailsByKeyPromise.get(workspaceKey);
    }
    const defer = this.$q.defer();
    const promise: ng.IHttpPromise<any> = this.$http.get('/api/workspace/' + workspaceKey);
    this.workspaceDetailsByKeyPromise.set(workspaceKey, promise);

    promise.then((response: ng.IHttpPromiseCallbackArg<che.IWorkspace>) => {
      const workspace = response.data;
      this.workspacesById.set(workspace.id, workspace);
      this.updateWorkspacesList(workspace);
      defer.resolve();
    }, (error: any) => {
      if (error.status === 304) {
        defer.resolve();
        return;
      }
      defer.reject(error);
    }).finally(() => {
      this.workspaceDetailsByKeyPromise.delete(workspaceKey);
    });

    return defer.promise;
  }

  /**
   * Adds a project on the workspace
   * @param workspaceId {string} the workspace ID required to add a project
   * @param project {che.IProject} the project JSON entry to add
   * @returns {ng.IPromise<any>}
   */
  addProject(workspaceId: string, project: che.IProject): ng.IPromise<any> {
    return this.remoteWorkspaceAPI.addProject({workspaceId: workspaceId}, project).$promise;
  }

  /**
   * Deletes a project of the workspace by it's path
   * @param workspaceId {string} the workspace ID required to delete a project
   * @param path {string} path to project to be deleted
   * @returns {ng.IPromise<any>}
   */
  deleteProject(workspaceId: string, path: string): ng.IPromise<any> {
    return this.remoteWorkspaceAPI.deleteProject({workspaceId: workspaceId, path: path}).$promise;
  }

  /**
   * Prepares workspace config using the data in provided one,
   * workspace name, machine source, RAM.
   *
   * @param config {any} provided base workspace config
   * @param workspaceName {string} workspace name
   * @param source {any} machine source
   * @param ram {number} workspace's RAM
   * @returns {any} prepared workspace config
   */
  formWorkspaceConfig(config: any, workspaceName: string, source: any, ram: number): any {
    config = config || {};
    config.name = workspaceName;
    config.projects = [];
    config.defaultEnv = config.defaultEnv || workspaceName;
    config.description = null;
    ram = ram || 2 * Math.pow(1024, 3);

    // check environments were provided in config:
    config.environments = (config.environments && Object.keys(config.environments).length > 0) ? config.environments : {};

    let defaultEnvironment = config.environments[config.defaultEnv];

    // check default environment is provided and add if there is no:
    if (!defaultEnvironment) {
      defaultEnvironment = {
        'recipe': null,
        'machines': {
          'dev-machine': {
            'attributes': {'memoryLimitBytes': ram},
            'agents': ['org.eclipse.che.ws-agentItem', 'org.eclipse.che.exec', 'org.eclipse.che.terminal', 'org.eclipse.che.ssh']
          }
        }
      };

      config.environments[config.defaultEnv] = defaultEnvironment;
    }

    if (source && source.type && source.type === 'environment') {
      let contentType = source.format === 'dockerfile' ? 'text/x-dockerfile' : 'application/x-yaml';
      defaultEnvironment.recipe = {
        'type': source.format,
        'contentType': contentType
      };

      defaultEnvironment.recipe.content = source.content || null;
      defaultEnvironment.recipe.location = source.location || null;
    }

    if (defaultEnvironment.recipe && defaultEnvironment.recipe.type === 'compose') {
      return config;
    }

    let devMachine = this.lodash.find(defaultEnvironment.machines, (machine: any) => {
      return machine.agents.indexOf('org.eclipse.che.ws-agentItem') >= 0;
    });

    // check dev machine is provided and add if there is no:
    if (!devMachine) {
      devMachine = {
        'name': 'ws-machine',
        'attributes': {'memoryLimitBytes': ram},
        'type': 'docker',
        'agents': ['org.eclipse.che.ws-agentItem', 'org.eclipse.che.exec', 'org.eclipse.che.terminal', 'org.eclipse.che.ssh']
      };
      defaultEnvironment.machines[devMachine.name] = devMachine;
    } else {
      if (devMachine.attributes) {
        if (!devMachine.attributes.memoryLimitBytes) {
          devMachine.attributes.memoryLimitBytes = ram;
        }
      } else {
        devMachine.attributes = {'memoryLimitBytes': ram};
      }
    }
    if (source) {
      devMachine.source = source;
    }

    return config;
  }

  createWorkspace(namespace: string, workspaceName: string, source: any, ram: number, attributes: any): ng.IPromise<any> {
    let data = this.formWorkspaceConfig({}, workspaceName, source, ram);
    let attrs = this.lodash.map(this.lodash.pairs(attributes || {}), (item: any) => {
      return item[0] + ':' + item[1];
    });
    let promise = namespace ? this.remoteWorkspaceAPI.createWithNamespace({
      namespace: namespace,
      attribute: attrs
    }, data).$promise :
      this.remoteWorkspaceAPI.create({attribute: attrs}, data).$promise;
    return promise;
  }

  createWorkspaceFromConfig(namespace: string, workspaceConfig: che.IWorkspaceConfig, attributes: any): ng.IPromise<any> {
    let attrs = this.lodash.map(this.lodash.pairs(attributes || {}), (item: any) => {
      return item[0] + ':' + item[1];
    });
    return namespace ? this.remoteWorkspaceAPI.createWithNamespace({
      namespace: namespace,
      attribute: attrs
    }, workspaceConfig).$promise :
      this.remoteWorkspaceAPI.create({attribute: attrs}, workspaceConfig).$promise;
  }

  /**
   * Add a command into the workspace
   * @param workspaceId {string} the id of the workspace on which we want to add the command
   * @param command {any} the command object that contains attribute like name, type, etc.
   * @returns {ng.IPromise<any>}
   */
  addCommand(workspaceId: string, command: any): ng.IPromise<any> {
    return this.remoteWorkspaceAPI.addCommand({workspaceId: workspaceId}, command).$promise;
  }

  /**
   * Starts the given workspace by specifying the ID and the environment name
   * @param workspaceId the workspace ID
   * @param envName the name of the environment
   * @returns {ng.IPromise<any>} promise
   */
  startWorkspace(workspaceId: string, envName: string): ng.IPromise<any> {
    return this.remoteWorkspaceAPI.startWorkspace({workspaceId: workspaceId, envName: envName}, {}).$promise;
  }

  /**
   * Starts a temporary workspace by specifying configuration
   * @param workspaceConfig {che.IWorkspaceConfig}
   * @returns {ng.IPromise<any>} promise
   */
  startTemporaryWorkspace(workspaceConfig: che.IWorkspaceConfig): ng.IPromise<any> {
    return this.remoteWorkspaceAPI.startTemporaryWorkspace({}, workspaceConfig).$promise;
  }

  /**
   * Stop workspace
   * @param workspaceId {string}
   * @returns {ng.IPromise<any>} promise
   */
  stopWorkspace(workspaceId: string, createSnapshot: boolean): ng.IPromise<any> {
    createSnapshot = createSnapshot === undefined ? this.getAutoSnapshotSettings() : createSnapshot;
    return this.remoteWorkspaceAPI.stopWorkspace({
      workspaceId: workspaceId,
      createSnapshot: createSnapshot
    }, {}).$promise;
  }

  /**
   * Performs workspace config update by the given workspaceId and new data.
   * @param workspaceId {string} the workspace ID
   * @param data {che.IWorkspace} the new workspace details
   * @returns {ng.IPromise<any>}
   */
  updateWorkspace(workspaceId: string, data: che.IWorkspace): ng.IPromise<any> {
    let defer = this.$q.defer();
    let promise = this.remoteWorkspaceAPI.updateWorkspace({workspaceId: workspaceId}, data).$promise;
    promise.then((data: che.IWorkspace) => {
      this.updateWorkspacesList(data);
      this.startUpdateWorkspaceStatus(data.id);
      defer.resolve(data);
    }, (error: any) => {
      defer.reject(error);
    });

    return defer.promise;
  }

  /**
   * Performs workspace deleting by the given workspaceId.
   * @param workspaceId {string} the workspace ID
   * @returns {ng.IPromise<any>}
   */
  deleteWorkspaceConfig(workspaceId: string): ng.IPromise<any> {
    let defer = this.$q.defer();
    let promise = this.remoteWorkspaceAPI.deleteWorkspace({workspaceId: workspaceId}).$promise;
    promise.then(() => {
      this.listeners.forEach((listener: any) => {
        listener.onDeleteWorkspace(workspaceId);
      });
      defer.resolve();
    }, (error: any) => {
      defer.reject(error);
    });

    return defer.promise;
  }

  /**
   * Gets the map of projects by workspace id.
   * @returns {che.IWorkspaceProjects}
   */
  getWorkspaceProjects(): che.IWorkspaceProjects {
    let workspaceProjects: che.IWorkspaceProjects = {};
    this.workspacesById.forEach((workspace: che.IWorkspace) => {
      let projects = workspace.config.projects;
      projects.forEach((project: che.IProject) => {
        project.workspaceId = workspace.id;
        project.workspaceName = workspace.config.name;
      });

      workspaceProjects[workspace.id] = projects;
    });

    return workspaceProjects;
  }

  getAllProjects(): Array<che.IProject> {
    let projects = this.lodash.pluck(this.workspaces, 'config.projects');
    return [].concat.apply([], projects);
  }

  /**
   * Gets IDE Url
   * @param namespace {string}
   * @param workspaceName {string}
   * @returns {string}
   */
  getIdeUrl(namespace: string, workspaceName: string): string {
    return '/ide/' + namespace + '/' + workspaceName;
  }

  /**
   * Creates deferred object which will be resolved
   * when workspace change it's status to given
   * @param workspaceId {string}
   * @param status {string} needed to resolve deferred object
   * @returns {ng.IPromise<any>}
   */
  fetchStatusChange(workspaceId: string, status: string): ng.IPromise<any> {
    let defer = this.$q.defer();
    const workspace = this.getWorkspaceById(workspaceId);
    if (workspace && workspace.status === status) {
      defer.resolve();
    } else {
      if (!this.statusDefers[workspaceId]) {
        this.statusDefers[workspaceId] = {};
      }
      if (!this.statusDefers[workspaceId][status]) {
        this.statusDefers[workspaceId][status] = [];
      }
      this.statusDefers[workspaceId][status].push(defer);
    }

    return defer.promise;
  }

  /**
   * Add subscribe to websocket channel for specified workspaceId
   * to handle workspace's status changes.
   * @param workspaceId {string}
   */
  startUpdateWorkspaceStatus(workspaceId: string): void {
    if (this.subscribedWorkspacesIds.indexOf(workspaceId) < 0) {
      this.subscribedWorkspacesIds.push(workspaceId);
      this.cheJsonRpcMasterApi.subscribeWorkspaceStatus(workspaceId, (message: any) => {
        // filter workspace events, which really indicate the status change:
        if (WorkspaceStatus[<string>message.eventType] >= 0) {
          this.getWorkspaceById(workspaceId).status = message.eventType;
        } else if (message.eventType === 'SNAPSHOT_CREATING') {
          this.getWorkspaceById(workspaceId).status = WorkspaceStatus[WorkspaceStatus.SNAPSHOTTING];
        } else if (message.eventType === 'SNAPSHOT_CREATED') {
          // snapshot can be created for RUNNING workspace only.
          this.getWorkspaceById(workspaceId).status = WorkspaceStatus[WorkspaceStatus.RUNNING];
        }

        if (!this.statusDefers[workspaceId] || !this.statusDefers[workspaceId][message.eventType]) {
          return;
        }

        this.statusDefers[workspaceId][message.eventType].forEach((defer: any) => {
          defer.resolve(message);
        });

        this.statusDefers[workspaceId][message.eventType].length = 0;
      });
    }
  }

  /**
   * Fetches the system settings for workspaces.
   *
   * @returns {IPromise<any>}
   */
  fetchWorkspaceSettings(): ng.IPromise<any> {
    const promise = this.remoteWorkspaceAPI.getSettings().$promise;
    return promise.then((settings: any) => {
      this.workspaceSettings = settings;
      return this.workspaceSettings;
    }, (error: any) => {
      if (error.status === 304) {
        return this.workspaceSettings;
      }
      return this.$q.reject(error);
    });
  }

  /**
   * Returns the system settings for workspaces.
   *
   * @returns {any} the system settings for workspaces
   */
  getWorkspaceSettings(): any {
    return this.workspaceSettings;
  }

  /**
   * Returns the value of autosnapshot system property.
   *
   * @returns {boolean} 'che.workspace.auto_snapshot' property value
   */
  getAutoSnapshotSettings(): boolean {
    return this.workspaceSettings ? this.workspaceSettings['che.workspace.auto_snapshot'] === 'true' : true;
  }

  getJsonRpcApiLocation(): string {
    return this.jsonRpcApiLocation;
  }

  private updateWorkspacesList(workspace: che.IWorkspace): void {
    // add workspace if not temporary
    if (!workspace.temporary) {
      this.lodash.remove(this.workspaces, (_workspace: che.IWorkspace) => {
        return _workspace.id === workspace.id;
      });
      this.workspaces.push(workspace);
      // publish change
      if (this.observables.has(workspace.id)) {
        this.observables.get(workspace.id).publish(workspace);
      }
    }

    const workspaceDetails = this.getWorkspaceById(workspace.id);
    if (workspaceDetails && WorkspaceStatus[workspaceDetails.status] === WorkspaceStatus.RUNNING && workspaceDetails.runtime && !workspace.runtime) {
      const runtime = angular.copy(workspaceDetails.runtime);
      this.workspacesById.set(workspace.id, workspace);
      this.getWorkspaceById(workspace.id).runtime = runtime;
    } else {
      this.workspacesById.set(workspace.id, workspace);
    }

    this.startUpdateWorkspaceStatus(workspace.id);

    const controlStatuses = [WorkspaceStatus.RUNNING, WorkspaceStatus.STOPPED];
    controlStatuses.forEach((statusIndex: number) => {
      if (workspace.status !== WorkspaceStatus[statusIndex]) {
        this.fetchStatusChange(workspace.id, WorkspaceStatus[statusIndex]).then(() => {
          return this.fetchWorkspaceDetails(workspace.id);
        });
      }
    });
  }

  private formJsonRpcApiLocation($location: ng.ILocationService, proxySettings : string, devmode: boolean): string {
    let wsUrl;

    if (devmode) {
      // it handle then http and https
      wsUrl = proxySettings.replace('http', 'ws');
    } else {
      let wsProtocol;
      wsProtocol = 'http' === $location.protocol() ? 'ws' : 'wss';
      wsUrl = wsProtocol + '://' + $location.host() + ':' + $location.port();
    }
    return wsUrl;
  }
}
