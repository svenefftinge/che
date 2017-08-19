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

import static java.util.Collections.emptyList;
import static java.util.Collections.emptyMap;
import static org.mockito.Matchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.google.common.collect.ImmutableList;
import com.google.common.collect.ImmutableMap;
import io.fabric8.kubernetes.api.model.Container;
import io.fabric8.kubernetes.api.model.ContainerPort;
import io.fabric8.kubernetes.api.model.ContainerPortBuilder;
import io.fabric8.kubernetes.api.model.HasMetadata;
import io.fabric8.kubernetes.api.model.IntOrString;
import io.fabric8.kubernetes.api.model.IntOrStringBuilder;
import io.fabric8.kubernetes.api.model.ObjectMeta;
import io.fabric8.kubernetes.api.model.PersistentVolumeClaim;
import io.fabric8.kubernetes.api.model.Pod;
import io.fabric8.kubernetes.api.model.PodSpec;
import io.fabric8.kubernetes.api.model.Service;
import io.fabric8.kubernetes.api.model.ServicePort;
import io.fabric8.kubernetes.api.model.ServicePortBuilder;
import io.fabric8.kubernetes.api.model.ServiceSpec;
import io.fabric8.openshift.api.model.Route;
import io.fabric8.openshift.api.model.RouteSpec;
import io.fabric8.openshift.api.model.RouteTargetReference;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.eclipse.che.api.core.model.workspace.Warning;
import org.eclipse.che.api.core.model.workspace.runtime.RuntimeIdentity;
import org.eclipse.che.api.core.notification.EventService;
import org.eclipse.che.api.workspace.server.URLRewriter;
import org.eclipse.che.api.workspace.server.hc.ServerCheckerFactory;
import org.eclipse.che.api.workspace.server.spi.InfrastructureException;
import org.eclipse.che.api.workspace.server.spi.InternalInfrastructureException;
import org.eclipse.che.workspace.infrastructure.openshift.bootstrapper.OpenShiftBootstrapperFactory;
import org.eclipse.che.workspace.infrastructure.openshift.environment.OpenShiftEnvironment;
import org.eclipse.che.workspace.infrastructure.openshift.project.OpenShiftPersistentVolumeClaims;
import org.eclipse.che.workspace.infrastructure.openshift.project.OpenShiftPods;
import org.eclipse.che.workspace.infrastructure.openshift.project.OpenShiftProject;
import org.eclipse.che.workspace.infrastructure.openshift.project.OpenShiftRoutes;
import org.eclipse.che.workspace.infrastructure.openshift.project.OpenShiftServices;
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

  private static final String WORKSPACE_ID = "workspace123";
  private static final String PVC_NAME = "che-workspace-data";
  private static final String POD_NAME = "app";
  private static final String ROUTE_NAME = "test-route";
  private static final String SERVICE_NAME = "test-service";
  private static final String POD_SELECTOR = "che.pod.name";
  private static final String CONTAINER_NAME_1 = "test1";
  private static final String CONTAINER_NAME_2 = "test2";
  private static final int EXPOSED_PORT_1 = 4401;
  private static final int EXPOSED_PORT_2 = 8081;
  private static final int NOT_EXPOSED_PORT_1 = 4411;

  @Mock private OpenShiftRuntimeContext context;
  @Mock private RuntimeIdentity identity;
  @Mock private EventService eventService;
  @Mock private ServerCheckerFactory serverCheckerFactory;
  @Mock private OpenShiftBootstrapperFactory bootstrapperFactory;
  @Mock private OpenShiftEnvironment osEnv;
  @Mock private OpenShiftProject project;
  @Mock private OpenShiftPersistentVolumeClaims pvcs;
  @Mock private OpenShiftServices services;
  @Mock private OpenShiftRoutes routes;
  @Mock private OpenShiftPods pods;

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
    when(context.getIdentity()).thenReturn(identity);
    when(identity.getWorkspaceId()).thenReturn(WORKSPACE_ID);
    doNothing().when(project).cleanUp();
    doReturn(ImmutableMap.of(PVC_NAME, mockPvc())).when(osEnv).getPersistentVolumeClaims();
    when(project.persistentVolumeClaims()).thenReturn(pvcs);
    when(project.services()).thenReturn(services);
    when(project.routes()).thenReturn(routes);
    when(project.pods()).thenReturn(pods);
    when(pvcs.get()).thenReturn(emptyList());
  }

  @Test
  public void startsOpenShiftEnvironment() throws Exception {
    final Container c1 = mockContainer(CONTAINER_NAME_1, EXPOSED_PORT_1);
    final Container c2 = mockContainer(CONTAINER_NAME_2, EXPOSED_PORT_2, NOT_EXPOSED_PORT_1);
    doReturn(ImmutableMap.of(SERVICE_NAME, mockService())).when(osEnv).getServices();
    doReturn(ImmutableMap.of(SERVICE_NAME, mockRoute())).when(osEnv).getRoutes();
    when(services.create(any())).thenAnswer(a -> a.getArguments()[0]);
    when(routes.create(any())).thenAnswer(a -> a.getArguments()[0]);
    doReturn(ImmutableMap.of(POD_NAME, mockPod(ImmutableList.of(c1, c2)))).when(osEnv).getPods();
    when(pods.create(any())).thenAnswer(a -> a.getArguments()[0]);

    internalRuntime.internalStart(emptyMap());
  }

  @Test(expectedExceptions = InfrastructureException.class)
  public void throwsInfrastructureExceptionWhenPVCsCreationFailed() throws Exception {
    doNothing().when(project).cleanUp();
    doThrow(InfrastructureException.class).when(pvcs).get();

    try {
      internalRuntime.internalStart(emptyMap());
    } catch (Exception rethrow) {
      verify(project, times(2)).cleanUp();
      verify(project, never()).services();
      verify(project, never()).routes();
      verify(project, never()).pods();
      throw rethrow;
    }
  }

  @Test(expectedExceptions = InternalInfrastructureException.class)
  public void throwsInternalInfrastructureExceptionWhenRuntimeErrorOccurs() throws Exception {
    doNothing().when(project).cleanUp();
    final OpenShiftPersistentVolumeClaims pvcs = mock(OpenShiftPersistentVolumeClaims.class);
    when(project.persistentVolumeClaims()).thenReturn(pvcs);
    doThrow(RuntimeException.class).when(pvcs).create(any(PersistentVolumeClaim.class));

    try {
      internalRuntime.internalStart(emptyMap());
    } catch (Exception rethrow) {
      verify(project, times(2)).cleanUp();
      verify(project, never()).services();
      verify(project, never()).routes();
      verify(project, never()).pods();
      throw rethrow;
    }
  }

  private static Container mockContainer(String name, int... ports) {
    final Container container = mock(Container.class);
    when(container.getName()).thenReturn(name);
    final List<ContainerPort> containerPorts = new ArrayList<>(ports.length);
    for (int port : ports) {
      containerPorts.add(new ContainerPortBuilder().withContainerPort(port).build());
    }
    when(container.getPorts()).thenReturn(containerPorts);
    return container;
  }

  private static Pod mockPod(List<Container> containers) {
    final Pod pod = mock(Pod.class);
    final PodSpec spec = mock(PodSpec.class);
    mockName(POD_NAME, pod);
    when(spec.getContainers()).thenReturn(containers);
    when(pod.getSpec()).thenReturn(spec);
    when(pod.getMetadata().getLabels()).thenReturn(ImmutableMap.of(POD_SELECTOR, POD_NAME));
    return pod;
  }

  private static PersistentVolumeClaim mockPvc() {
    final PersistentVolumeClaim pvc = mock(PersistentVolumeClaim.class);
    mockName(PVC_NAME, pvc);
    return pvc;
  }

  private static Service mockService() {
    final Service service = mock(Service.class);
    final ServiceSpec spec = mock(ServiceSpec.class);
    mockName(SERVICE_NAME, service);
    when(service.getSpec()).thenReturn(spec);
    when(spec.getSelector()).thenReturn(ImmutableMap.of(POD_SELECTOR, POD_NAME));
    final ServicePort sp1 =
        new ServicePortBuilder().withTargetPort(intOrString(EXPOSED_PORT_1)).build();
    final ServicePort sp2 =
        new ServicePortBuilder().withTargetPort(intOrString(EXPOSED_PORT_2)).build();
    when(spec.getPorts()).thenReturn(ImmutableList.of(sp1, sp2));
    return service;
  }

  private static Route mockRoute() {
    final Route route = mock(Route.class);
    final ObjectMeta metadata = mockName(ROUTE_NAME, route);
    final RouteSpec spec = mock(RouteSpec.class);
    final RouteTargetReference target = mock(RouteTargetReference.class);
    final Map<String, String> ports =
        ImmutableMap.of(
            "org.eclipse.che.server.web.port",
            EXPOSED_PORT_1 + "/tcp",
            "org.eclipse.che.server.terminal.protocol",
            EXPOSED_PORT_2 + "/tcp");
    when(metadata.getAnnotations()).thenReturn(ports);
    when(target.getName()).thenReturn(SERVICE_NAME);
    when(spec.getTo()).thenReturn(target);
    when(route.getSpec()).thenReturn(spec);
    return route;
  }

  private static ObjectMeta mockName(String name, HasMetadata mock) {
    final ObjectMeta metadata = mock(ObjectMeta.class);
    when(mock.getMetadata()).thenReturn(metadata);
    when(metadata.getName()).thenReturn(name);
    return metadata;
  }

  private static IntOrString intOrString(int port) {
    return new IntOrStringBuilder().withIntVal(port).withStrVal(String.valueOf(port)).build();
  }
}
