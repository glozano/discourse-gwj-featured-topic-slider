/* global settings */

import { withPluginApi } from "discourse/lib/plugin-api";
import {
  ensureBlockWrapper,
  ensureRowWrapper,
  isRouteEnabled,
  queryTopicListElements,
  resolvePlacementSettings,
} from "discourse/lib/gwj-slider-placement";

const OUTLET_NAME = "discovery-list-container-top";

export default {
  name: "gwj-featured-topic-slider",

  initialize() {
    withPluginApi("1.8.0", (api) => {
      const state = {
        unmount: null,
        sliderElement: null,
        rowWrapper: null,
        blockWrapper: null,
        randomTargetIndex: null,
        lastRouteKey: null,
      };

      const themeSettings = settings || {};

      function teardown() {
        state.randomTargetIndex = null;
        if (state.unmount) {
          state.unmount();
          state.unmount = null;
        }

        if (state.rowWrapper?.isConnected) {
          state.rowWrapper.remove();
        }

        if (state.blockWrapper?.isConnected) {
          state.blockWrapper.remove();
        }

        state.rowWrapper = null;
        state.blockWrapper = null;
        state.sliderElement = null;
      }

      function captureSliderElement() {
        state.sliderElement =
          document.querySelector('[data-featured-topic-slider="true"]') ||
          state.sliderElement;
        if (!state.sliderElement) {
          window.requestAnimationFrame(captureSliderElement);
        }
      }

      function ensureRendered() {
        if (state.unmount) {
          return;
        }

        state.unmount = api.renderInOutlet(OUTLET_NAME, "featured-topic-slider");
        window.requestAnimationFrame(() => {
          captureSliderElement();
          applyPlacement();
        });
      }

      function getRouteInfo() {
        const router = api.container.lookup("router:main");
        const routeName = router?.currentRouteName;
        let pathname = window.location?.pathname;

        if (router?.currentURL) {
          pathname = router.currentURL.split("?")[0];
        }

        return { routeName, pathname };
      }

      function shouldDisplayForRoute() {
        const { routeName, pathname } = getRouteInfo();
        return isRouteEnabled({
          showOn: themeSettings.show_on,
          routeName,
          pathname,
        });
      }

      function clampIndex(index, upperBound) {
        if (!upperBound || upperBound <= 0) {
          return 0;
        }

        if (index < 1) {
          return 1;
        }

        if (index > upperBound) {
          return upperBound;
        }

        return index;
      }

      function applyPlacement() {
        const sliderElement =
          state.sliderElement ||
          document.querySelector('[data-featured-topic-slider="true"]');

        if (!sliderElement) {
          return;
        }

        const topicListElements = queryTopicListElements();
        if (!topicListElements?.topicList) {
          return;
        }

        const { topicList, bodyRows, columnCount } = topicListElements;
        const listLength = bodyRows.length;
        const placementConfig = resolvePlacementSettings(themeSettings);

        if (placementConfig.insertMode === "before_list") {
          if (state.rowWrapper?.isConnected) {
            state.rowWrapper.remove();
            state.rowWrapper = null;
          }

          const wrapper = ensureBlockWrapper(sliderElement);
          if (state.blockWrapper && state.blockWrapper !== wrapper && state.blockWrapper.isConnected) {
            state.blockWrapper.remove();
          }
          state.blockWrapper = wrapper;
          const parent = topicList.parentNode || topicList.closest(".contents") || topicList;
          parent.insertBefore(wrapper, topicList);
          return;
        }

        if (placementConfig.insertMode === "list_footer") {
          if (state.rowWrapper?.isConnected) {
            state.rowWrapper.remove();
            state.rowWrapper = null;
          }

          const wrapper = ensureBlockWrapper(sliderElement);
          if (state.blockWrapper && state.blockWrapper !== wrapper && state.blockWrapper.isConnected) {
            state.blockWrapper.remove();
          }
          state.blockWrapper = wrapper;
          const parent = topicList.parentNode || topicList.closest(".contents") || topicList;
          parent.insertBefore(wrapper, topicList.nextSibling);
          return;
        }

        if (!listLength) {
          const wrapper = ensureBlockWrapper(sliderElement);
          if (state.rowWrapper?.isConnected) {
            state.rowWrapper.remove();
            state.rowWrapper = null;
          }
          if (state.blockWrapper && state.blockWrapper !== wrapper && state.blockWrapper.isConnected) {
            state.blockWrapper.remove();
          }
          state.blockWrapper = wrapper;
          const parent = topicList.parentNode || topicList.closest(".contents") || topicList;
          parent.insertBefore(wrapper, topicList);
          return;
        }

        const tbody = bodyRows[0]?.parentNode;
        if (!tbody) {
          return;
        }

        if (state.blockWrapper?.isConnected) {
          state.blockWrapper.remove();
        }
        state.blockWrapper = null;
        const minIndex = clampIndex(placementConfig.minIndex, listLength);
        const maxIndex = clampIndex(placementConfig.maxIndex, listLength);

        let targetIndex;
        if (placementConfig.randomize) {
          if (!state.randomTargetIndex) {
            const range = Math.max(maxIndex - minIndex + 1, 1);
            const offset = Math.floor(Math.random() * range);
            state.randomTargetIndex = minIndex + offset;
          }
          targetIndex = clampIndex(state.randomTargetIndex, listLength);
        } else {
          state.randomTargetIndex = null;
          targetIndex = clampIndex(placementConfig.positionIndex, listLength);
        }

        const rowWrapper = ensureRowWrapper({
          sliderElement,
          columnCount,
        });
        state.rowWrapper = rowWrapper;

        const referenceRow = bodyRows[Math.min(targetIndex, listLength) - 1];
        tbody.insertBefore(rowWrapper, referenceRow?.nextSibling || null);
      }

      const schedulePlacement = () => window.requestAnimationFrame(applyPlacement);

      function handleRouteChange() {
        const routeKey = `${window.location.pathname}::${window.location.search}`;
        if (state.lastRouteKey === routeKey) {
          return;
        }

        state.lastRouteKey = routeKey;

        if (!shouldDisplayForRoute()) {
          teardown();
          return;
        }

        ensureRendered();
        state.randomTargetIndex = null;
        schedulePlacement();
      }

      api.onPageChange(() => {
        handleRouteChange();
      });

      api.afterTopicListRender(() => {
        if (!state.unmount) {
          return;
        }

        schedulePlacement();
      });

      handleRouteChange();
    });
  },
};
