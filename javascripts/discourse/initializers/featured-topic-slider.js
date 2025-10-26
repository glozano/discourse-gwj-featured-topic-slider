/* global settings */

import { withPluginApi } from "discourse/lib/plugin-api";
import {
  ensureBlockWrapper,
  ensureRowWrapper,
  isRouteEnabled,
  queryTopicListElements,
  resolvePlacementSettings,
} from "../lib/gwj-slider-placement";

const ANCHOR_SELECTOR = '[data-featured-topic-slider-anchor="true"]';
const SLIDER_SELECTOR = '[data-featured-topic-slider="true"]';

export default {
  name: "gwj-featured-topic-slider",

  initialize() {
    withPluginApi("1.8.0", (api) => {
      const themeSettings = settings || {};
      const state = {
        anchor: null,
        sliderElement: null,
        rowWrapper: null,
        blockWrapper: null,
        randomTargetIndex: null,
        observer: null,
        observerTarget: null,
        lastRouteKey: null,
      };

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

      function restoreSliderToAnchor() {
        if (state.anchor && state.sliderElement) {
          const parent = state.sliderElement.parentNode;
          if (parent !== state.anchor) {
            state.anchor.appendChild(state.sliderElement);
          }
        }

        if (state.anchor) {
          state.anchor.style.display = "";
        }
      }

      function disconnectObserver() {
        if (state.observer) {
          state.observer.disconnect();
          state.observer = null;
          state.observerTarget = null;
        }
      }

      function teardown({ hideOnly = false } = {}) {
        state.randomTargetIndex = null;

        if (state.rowWrapper?.isConnected) {
          state.rowWrapper.remove();
        }

        if (state.blockWrapper?.isConnected) {
          state.blockWrapper.remove();
        }

        restoreSliderToAnchor();
        if (hideOnly && state.anchor) {
          state.anchor.style.display = "none";
        }

        state.rowWrapper = null;
        state.blockWrapper = null;

        disconnectObserver();

        if (!hideOnly) {
          state.sliderElement = null;
        }
      }

      function ensureElementsReady(callback) {
        if (!state.anchor) {
          state.anchor = document.querySelector(ANCHOR_SELECTOR);
        }

        if (!state.anchor) {
          window.requestAnimationFrame(() => ensureElementsReady(callback));
          return;
        }

        if (!state.sliderElement) {
          state.sliderElement =
            document.querySelector(SLIDER_SELECTOR) ||
            state.anchor.querySelector(SLIDER_SELECTOR);
        }

        if (!state.sliderElement) {
          window.requestAnimationFrame(() => ensureElementsReady(callback));
          return;
        }

        callback?.();
      }

      function ensureObserver() {
        const listArea = document.querySelector("#list-area");
        if (!listArea) {
          disconnectObserver();
          return;
        }

        if (state.observer && state.observerTarget === listArea) {
          return;
        }

        disconnectObserver();

        state.observer = new MutationObserver(() => {
          schedulePlacement();
        });

        state.observer.observe(listArea, {
          childList: true,
          subtree: true,
        });
        state.observerTarget = listArea;
      }

      function runPlacement() {
        if (!state.sliderElement) {
          return;
        }

        const topicListElements = queryTopicListElements();
        const listArea = topicListElements?.listArea || document.querySelector("#list-area");
        const placementConfig = resolvePlacementSettings(themeSettings);

        if (!topicListElements?.topicList) {
          if (state.rowWrapper?.isConnected) {
            state.rowWrapper.remove();
            state.rowWrapper = null;
          }

          if (!listArea) {
            restoreSliderToAnchor();
            return;
          }

          const wrapper = ensureBlockWrapper(state.sliderElement);
          if (state.blockWrapper && state.blockWrapper !== wrapper && state.blockWrapper.isConnected) {
            state.blockWrapper.remove();
          }

          state.blockWrapper = wrapper;
          listArea.insertBefore(wrapper, listArea.firstChild || null);

          if (state.anchor && state.sliderElement.parentNode !== state.anchor) {
            state.anchor.style.display = "none";
          }

          return;
        }

        const { topicList, bodyRows, columnCount } = topicListElements;
        const listLength = bodyRows.length;

        if (placementConfig.insertMode === "before_list") {
          if (state.rowWrapper?.isConnected) {
            state.rowWrapper.remove();
            state.rowWrapper = null;
          }

          const wrapper = ensureBlockWrapper(state.sliderElement);
          if (state.blockWrapper && state.blockWrapper !== wrapper && state.blockWrapper.isConnected) {
            state.blockWrapper.remove();
          }
          state.blockWrapper = wrapper;

          const parent = topicList.parentNode || topicList.closest(".contents") || topicList;
          parent.insertBefore(wrapper, topicList);

          if (state.anchor && state.sliderElement.parentNode !== state.anchor) {
            state.anchor.style.display = "none";
          }
          return;
        }

        if (placementConfig.insertMode === "list_footer") {
          if (state.rowWrapper?.isConnected) {
            state.rowWrapper.remove();
            state.rowWrapper = null;
          }

          const wrapper = ensureBlockWrapper(state.sliderElement);
          if (state.blockWrapper && state.blockWrapper !== wrapper && state.blockWrapper.isConnected) {
            state.blockWrapper.remove();
          }
          state.blockWrapper = wrapper;
          const parent = topicList.parentNode || topicList.closest(".contents") || topicList;
          parent.insertBefore(wrapper, topicList.nextSibling);

          if (state.anchor && state.sliderElement.parentNode !== state.anchor) {
            state.anchor.style.display = "none";
          }
          return;
        }

        if (!listLength) {
          const wrapper = ensureBlockWrapper(state.sliderElement);
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

          if (state.anchor && state.sliderElement.parentNode !== state.anchor) {
            state.anchor.style.display = "none";
          }
          return;
        }

        if (state.blockWrapper?.isConnected) {
          state.blockWrapper.remove();
        }
        state.blockWrapper = null;

        const tbody = bodyRows[0]?.parentNode;
        if (!tbody) {
          restoreSliderToAnchor();
          return;
        }

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
          sliderElement: state.sliderElement,
          columnCount,
        });
        state.rowWrapper = rowWrapper;

        const referenceRow = bodyRows[Math.min(targetIndex, listLength) - 1];
        tbody.insertBefore(rowWrapper, referenceRow?.nextSibling || null);

        if (state.anchor && state.sliderElement.parentNode !== state.anchor) {
          state.anchor.style.display = "none";
        }
      }

      function schedulePlacement() {
        ensureElementsReady(() => window.requestAnimationFrame(runPlacement));
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

      function handleRouteChange() {
        const routeKey = `${window.location.pathname}::${window.location.search}`;
        if (state.lastRouteKey === routeKey) {
          return;
        }

        state.lastRouteKey = routeKey;

        if (!shouldDisplayForRoute()) {
          teardown({ hideOnly: true });
          return;
        }

        ensureElementsReady(() => {
          if (state.anchor) {
            state.anchor.style.display = "";
          }
          ensureObserver();
          state.randomTargetIndex = null;
          schedulePlacement();
        });
      }

      api.onPageChange(() => {
        handleRouteChange();
      });

      handleRouteChange();
    });
  },
};
