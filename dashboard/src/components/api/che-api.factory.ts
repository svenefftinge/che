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
import {CheSsh} from './che-ssh.factory';
'use strict';
import {CheWorkspace} from './workspace/che-workspace.factory';
import {CheProfile} from './che-profile.factory';
import {CheFactory} from './che-factory.factory';
import {CheFactoryTemplate} from './che-factory-template.factory';
import {ChePreferences} from './che-preferences.factory';
import {CheProjectTemplate} from './che-project-template.factory';
import {CheWebsocket} from './che-websocket.factory';
import {CheService} from './che-service.factory';
import {CheRecipe} from './che-recipe.factory';
import {CheRecipeTemplate} from './che-recipe-template.factory';
import {CheStack} from './che-stack.factory';
import {CheOAuthProvider} from './che-o-auth-provider.factory';
import {CheAgent} from './che-agent.factory';
import {CheUser} from './che-user.factory';


/**
 * This class is providing the entry point for accessing to Che API
 * It handles workspaces, projects, etc.
 * @author Florent Benoit
 */
export class CheAPI {

  private cheWorkspace: CheWorkspace;
  private cheProfile: CheProfile;
  private chePreferences: ChePreferences;
  private cheProjectTemplate: CheProjectTemplate;
  private cheFactory: CheFactory;
  private cheFactoryTemplate: CheFactoryTemplate;
  private cheService: CheService;
  private cheRecipe: CheRecipe;
  private cheRecipeTemplate: CheRecipeTemplate;
  private cheStack: CheStack;
  private cheOAuthProvider: CheOAuthProvider;
  private cheAgent: CheAgent;
  private cheSsh: CheSsh;
  private cheUser: CheUser;

  /**
   * Default constructor that is using resource
   * @ngInject for Dependency injection
   */
  constructor(cheWorkspace: CheWorkspace, cheFactory: CheFactory, cheFactoryTemplate: CheFactoryTemplate, cheProfile: CheProfile,
              chePreferences: ChePreferences, cheProjectTemplate: CheProjectTemplate, cheService: CheService,
              cheRecipe: CheRecipe, cheRecipeTemplate: CheRecipeTemplate, cheStack: CheStack, cheOAuthProvider: CheOAuthProvider,
              cheAgent: CheAgent, cheSsh: CheSsh, cheUser: CheUser) {
    this.cheWorkspace = cheWorkspace;
    this.cheProfile = cheProfile;
    this.cheFactory = cheFactory;
    this.cheFactoryTemplate = cheFactoryTemplate;
    this.chePreferences = chePreferences;
    this.cheProjectTemplate = cheProjectTemplate;
    this.cheService = cheService;
    this.cheRecipe = cheRecipe;
    this.cheRecipeTemplate = cheRecipeTemplate;
    this.cheStack = cheStack;
    this.cheOAuthProvider = cheOAuthProvider;
    this.cheAgent = cheAgent;
    this.cheSsh = cheSsh;
    this.cheUser = cheUser;
  }

  /**
   * The Che Workspace API
   * @returns {CheAPI.cheWorkspace}
   */
  getWorkspace(): CheWorkspace {
    return this.cheWorkspace;
  }

  /**
   * The Che oAuth Provider API
   * @returns {CheOAuthProvider}
   */
  getOAuthProvider(): CheOAuthProvider {
    return this.cheOAuthProvider;
  }

  /**
   * The Che Profile API
   * @returns {CheProfile}
   */
  getProfile(): CheProfile {
    return this.cheProfile;
  }

  /**
   * The Che Preferences API
   * @returns {ChePreferences}
   */
  getPreferences(): ChePreferences {
    return this.chePreferences;
  }

  /**
   * The Che Project Template API
   * @returns {CheProjectTemplate}
   */
  getProjectTemplate(): CheProjectTemplate {
    return this.cheProjectTemplate;
  }

  /**
   * The Che Services API
   * @returns {CheService}
   */
  getService(): CheService {
    return this.cheService;
  }

  /**
   * The Che Recipe API
   * @returns {CheRecipe}
   */
  getRecipe(): CheRecipe {
    return this.cheRecipe;
  }

  /**
   * The Che Recipe Template API
   * @returns {CheRecipeTemplate}
   */
  getRecipeTemplate(): CheRecipeTemplate {
    return this.cheRecipeTemplate;
  }

  /**
   * The Che Stack API
   * @returns {CheStack}
   */
  getStack(): CheStack {
    return this.cheStack;
  }

  /**
   * The Che Agent API
   * @returns {CheAgent}
   */
  getAgent(): CheAgent {
    return this.cheAgent;
  }

  /**
   * Gets Che ssh API
   * @returns {CheSsh}
   */
  getSsh(): CheSsh {
    return this.cheSsh;
  }

  /**
   * The Che Factory API
   * @returns {CheFactory|*}
   */
  getFactory(): CheFactory {
    return this.cheFactory;
  }

  /**
   * The Che Factory Template API
   * @returns {CheFactoryTemplate|*}
   */
  getFactoryTemplate(): CheFactoryTemplate {
    return this.cheFactoryTemplate;
  }

  /**
   * The Che use API.
   *
   * @returns {CheUser}
   */
  getUser(): CheUser {
    return this.cheUser;
  }
}
