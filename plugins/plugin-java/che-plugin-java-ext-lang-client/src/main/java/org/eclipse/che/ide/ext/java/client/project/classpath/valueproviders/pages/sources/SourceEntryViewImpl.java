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
package org.eclipse.che.ide.ext.java.client.project.classpath.valueproviders.pages.sources;

import static com.google.gwt.dom.client.Style.Visibility.HIDDEN;

import com.google.gwt.core.client.GWT;
import com.google.gwt.dom.client.DivElement;
import com.google.gwt.dom.client.Document;
import com.google.gwt.dom.client.Element;
import com.google.gwt.dom.client.SpanElement;
import com.google.gwt.dom.client.Style;
import com.google.gwt.event.dom.client.ClickEvent;
import com.google.gwt.event.dom.client.ClickHandler;
import com.google.gwt.uibinder.client.UiBinder;
import com.google.gwt.uibinder.client.UiField;
import com.google.gwt.user.client.Event;
import com.google.gwt.user.client.EventListener;
import com.google.gwt.user.client.ui.Button;
import com.google.gwt.user.client.ui.Composite;
import com.google.gwt.user.client.ui.FlowPanel;
import com.google.gwt.user.client.ui.Widget;
import com.google.inject.Inject;
import com.google.inject.Singleton;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.eclipse.che.ide.ext.java.client.JavaResources;
import org.eclipse.che.ide.ext.java.client.project.classpath.ProjectClasspathResources;
import org.eclipse.che.ide.ext.java.client.project.classpath.valueproviders.node.NodeWidget;
import org.eclipse.che.ide.ext.java.shared.dto.classpath.ClasspathEntryDto;
import org.eclipse.che.ide.ui.list.CategoriesList;
import org.eclipse.che.ide.ui.list.Category;
import org.eclipse.che.ide.ui.list.CategoryRenderer;

/**
 * The implementation of {@link SourceEntryView}.
 *
 * @author Valeriy Svydenko
 */
@Singleton
public class SourceEntryViewImpl extends Composite implements SourceEntryView {
  private static SourceEntryViewImplUiBinder ourUiBinder =
      GWT.create(SourceEntryViewImplUiBinder.class);

  private final JavaResources javaResources;
  private final ProjectClasspathResources classpathResources;

  @UiField(provided = true)
  ProjectClasspathResources.ClasspathStyles styles;

  @UiField FlowPanel buttonsPanel;
  @UiField FlowPanel sourcePanel;
  @UiField Button addSourceBtn;

  private final Category.CategoryEventDelegate<ClasspathEntryDto> librariesDelegate =
      new Category.CategoryEventDelegate<ClasspathEntryDto>() {
        @Override
        public void onListItemClicked(Element listItemBase, ClasspathEntryDto itemData) {}
      };

  private final CategoryRenderer<ClasspathEntryDto> classpathEntryRenderer =
      new CategoryRenderer<ClasspathEntryDto>() {
        @Override
        public void renderElement(Element element, ClasspathEntryDto data) {}

        @Override
        public Element renderCategory(final Category<ClasspathEntryDto> category) {
          DivElement categoryHeaderElement = Document.get().createDivElement();

          categoryHeaderElement.setClassName(classpathResources.getCss().categoryHeader());

          SpanElement iconElement = Document.get().createSpanElement();
          iconElement.appendChild(javaResources.sourceFolder().getSvg().getElement());
          categoryHeaderElement.appendChild(iconElement);

          SpanElement textElement = Document.get().createSpanElement();
          categoryHeaderElement.appendChild(textElement);
          Element text = createNameOfElement(category.getTitle());
          text.addClassName(classpathResources.getCss().classpathCategoryLabel());
          textElement.appendChild(text);

          final SpanElement buttonElement = Document.get().createSpanElement();
          buttonElement.addClassName(classpathResources.getCss().removeButton());
          buttonElement.appendChild(classpathResources.removeNode().getSvg().getElement());
          buttonElement.getStyle().setVisibility(HIDDEN);
          categoryHeaderElement.appendChild(buttonElement);

          Event.sinkEvents(categoryHeaderElement, Event.MOUSEEVENTS);
          Event.setEventListener(
              categoryHeaderElement,
              new EventListener() {
                @Override
                public void onBrowserEvent(Event event) {
                  if (!delegate.isPlainJava()) {
                    return;
                  }
                  if (Event.ONMOUSEOVER == event.getTypeInt()) {
                    buttonElement.getStyle().setVisibility(Style.Visibility.VISIBLE);
                  } else if (Event.ONMOUSEOUT == event.getTypeInt()) {
                    buttonElement.getStyle().setVisibility(HIDDEN);
                  }
                }
              });

          Event.sinkEvents(buttonElement, Event.ONCLICK);
          Event.setEventListener(
              buttonElement,
              new EventListener() {
                @Override
                public void onBrowserEvent(Event event) {
                  if (Event.ONCLICK == event.getTypeInt()) {
                    event.stopPropagation();
                    delegate.onRemoveClicked(category.getTitle());
                  }
                }
              });

          return categoryHeaderElement;
        }
      };

  private Element createNameOfElement(String fullPath) {
    DivElement textElement = Document.get().createDivElement();
    textElement.setInnerText(fullPath);

    return textElement;
  }

  private ActionDelegate delegate;
  private CategoriesList list;
  private List<Category<?>> categoriesList;

  @Inject
  public SourceEntryViewImpl(
      org.eclipse.che.ide.Resources resources,
      JavaResources javaResources,
      ProjectClasspathResources classpathResources) {
    this.javaResources = javaResources;
    this.classpathResources = classpathResources;
    styles = classpathResources.getCss();
    styles.ensureInjected();

    initWidget(ourUiBinder.createAndBindUi(this));

    list = new CategoriesList(resources);
    categoriesList = new ArrayList<>();
    sourcePanel.add(list);

    addSourceBtn.addClickHandler(
        new ClickHandler() {
          @Override
          public void onClick(ClickEvent event) {
            delegate.onAddSourceClicked();
          }
        });
  }

  @Override
  public void renderNodes() {
    list.clear();
    list.render(categoriesList, false);
  }

  @Override
  public void setData(Map<String, ClasspathEntryDto> data) {
    categoriesList.clear();
    for (Map.Entry<String, ClasspathEntryDto> elem : data.entrySet()) {
      categoriesList.add(
          new Category<>(
              elem.getKey(),
              classpathEntryRenderer,
              elem.getValue().getExpandedEntries(),
              librariesDelegate));

      Collections.reverse(categoriesList);
    }
  }

  @Override
  public void setDelegate(ActionDelegate delegate) {
    this.delegate = delegate;
  }

  @Override
  public void removeNode(NodeWidget nodeWidget) {
    sourcePanel.remove(nodeWidget);
  }

  @Override
  public void setAddSourceButtonState(boolean enabled) {
    addSourceBtn.setEnabled(enabled);
  }

  @Override
  public void clear() {
    sourcePanel.clear();
  }

  interface SourceEntryViewImplUiBinder extends UiBinder<Widget, SourceEntryViewImpl> {}
}
