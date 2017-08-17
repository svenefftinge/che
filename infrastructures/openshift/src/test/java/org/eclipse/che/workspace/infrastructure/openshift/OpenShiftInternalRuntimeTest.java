/*
 * Copyright (c) 2012-2017 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */
package org.eclipse.che.workspace.infrastructure.openshift;

import static java.util.Collections.emptyMap;
import static org.mockito.Matchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.google.common.collect.ImmutableList;
import com.google.common.collect.ImmutableMap;
import io.fabric8.kubernetes.api.model.Container;
import io.fabric8.kubernetes.api.model.ObjectMeta;
import io.fabric8.kubernetes.api.model.PersistentVolumeClaim;
import io.fabric8.kubernetes.api.model.Pod;
import io.fabric8.kubernetes.api.model.PodSpec;
import io.fabric8.kubernetes.api.model.Service;
import io.fabric8.openshift.api.model.Route;
import java.util.List;
import org.eclipse.che.api.core.notification.EventService;
import org.eclipse.che.api.workspace.server.URLRewriter;
import org.eclipse.che.api.workspace.server.hc.ServerCheckerFactory;
import org.eclipse.che.api.workspace.server.spi.InfrastructureException;
import org.eclipse.che.workspace.infrastructure.openshift.bootstrapper.OpenShiftBootstrapperFactory;
import org.eclipse.che.workspace.infrastructure.openshift.environment.OpenShiftEnvironment;
import org.eclipse.che.workspace.infrastructure.openshift.project.OpenShiftPersistentVolumeClaims;
import org.eclipse.che.workspace.infrastructure.openshift.project.OpenShiftProject;
import org.mockito.Mock;
import org.mockito.testng.MockitoTestNGListener;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Listeners;
import org.testng.annotations.Test;

/**
 * Tests {@link OpenShiftInternalRuntime}.
 *
 * @author Anton Korneta
 */
@Listeners(MockitoTestNGListener.class)
public class OpenShiftInternalRuntimeTest {

  private static final String PVC_NAME = "che-workspace-data";
  private static final String POD_NAME = "app/test";
  private static final String CONTAINER_NAME_1 = "container1";
  private static final String CONTAINER_NAME_2 = "container2";

  @Mock private OpenShiftRuntimeContext context;
  @Mock private EventService eventService;
  @Mock private ServerCheckerFactory serverCheckerFactory;
  @Mock private OpenShiftBootstrapperFactory bootstrapperFactory;
  @Mock private OpenShiftProject project;
  @Mock private OpenShiftEnvironment osEnv;

  private OpenShiftInternalRuntime internalRuntime;

  @BeforeMethod
  public void setup() throws Exception {
    internalRuntime =
        new OpenShiftInternalRuntime(
            context,
            project,
            new URLRewriter.NoOpURLRewriter(),
            eventService,
            bootstrapperFactory,
            serverCheckerFactory,
            13);
    when(context.getOpenShiftEnvironment()).thenReturn(osEnv);
    doNothing().when(project).cleanUp();
    doReturn(ImmutableMap.of(PVC_NAME, mockPvc(PVC_NAME))).when(osEnv).getPersistentVolumeClaims();
  }

  @Test
  public void startsOpenShiftEnvironment() throws Exception {
    final Container c1 = mockContainer(CONTAINER_NAME_1);
    final Container c2 = mockContainer(CONTAINER_NAME_2);
    final Pod pod = mockPod(POD_NAME, ImmutableList.of(c1, c2));

//    internalRuntime.internalStart(emptyMap());
  }

  @Test(expectedExceptions = InfrastructureException.class)
  public void throwsInfrastructureExceptionWhenPVCsCreationFailed() throws Exception {
    doNothing().when(project).cleanUp();
    final OpenShiftPersistentVolumeClaims pvcs = mock(OpenShiftPersistentVolumeClaims.class);
    when(project.persistentVolumeClaims()).thenReturn(pvcs);
    doThrow(InfrastructureException.class).when(pvcs).create(any(PersistentVolumeClaim.class));

    internalRuntime.internalStart(emptyMap());
  }

  @Test
  public void test2() throws Exception {}

  private static Container mockContainer(String name) {
    final Container container = mock(Container.class);
    when(container.getName()).thenReturn(name);
    return container;
  }

  private static Pod mockPod(String name, List<Container> containers) {
    final Pod pod = mock(Pod.class);
    final PodSpec spec = mock(PodSpec.class);
    final ObjectMeta metadata = mock(ObjectMeta.class);
    when(spec.getContainers()).thenReturn(containers);
    when(metadata.getName()).thenReturn(name);
    when(pod.getSpec()).thenReturn(spec);
    when(pod.getMetadata()).thenReturn(metadata);
    return pod;
  }

  private static PersistentVolumeClaim mockPvc(String pvcName) {
    final PersistentVolumeClaim pvc = mock(PersistentVolumeClaim.class);
    final ObjectMeta metadata = mock(ObjectMeta.class);
    when(metadata.getName()).thenReturn(pvcName);
    when(pvc.getMetadata()).thenReturn(metadata);
    return pvc;
  }

  private static Service mockService() {
    final Service service = mock(Service.class);
    return service;
  }

  private static Route mockRoute() {
    final Route route = mock(Route.class);
    return route;
  }
}
