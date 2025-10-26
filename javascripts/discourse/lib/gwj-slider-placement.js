const ROUTE_MATCHERS = {
  custom_homepage(routeName, pathname) {
    if (!routeName && !pathname) {
      return false;
    }

    return (
      routeName === "discovery.home" ||
      routeName === "discovery.latest" && pathname === "/" ||
      pathname === "/" ||
      routeName === "home"
    );
  },
  latest(routeName) {
    return routeName?.startsWith("discovery.latest");
  },
  top(routeName) {
    return routeName?.startsWith("discovery.top");
  },
  new(routeName) {
    return routeName?.startsWith("discovery.new");
  },
  categories(routeName) {
    return routeName === "discovery.categories";
  },
  tags(routeName, pathname) {
    return routeName?.startsWith("tag.") || pathname?.startsWith?.("/tag/");
  },
};

function normalizeRouteSet(showOnSetting) {
  if (!showOnSetting) {
    return new Set();
  }

  if (Array.isArray(showOnSetting)) {
    return new Set(showOnSetting);
  }

  if (typeof showOnSetting === "string") {
    return new Set(
      showOnSetting
        .split("|")
        .map((token) => token.trim())
        .filter(Boolean)
    );
  }

  return new Set();
}

export function isRouteEnabled({ showOn, routeName, pathname }) {
  const enabledRoutes = normalizeRouteSet(showOn);
  if (!enabledRoutes.size) {
    return false;
  }

  for (const key of enabledRoutes) {
    const matcher = ROUTE_MATCHERS[key];
    if (matcher && matcher(routeName, pathname)) {
      return true;
    }
  }

  return false;
}

function coercePositiveInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.floor(numeric);
}

export function resolvePlacementSettings(settings) {
  const insertMode = settings.insert_mode || "after_n";
  const randomize = !!settings.randomize_position;
  const positionIndex = coercePositiveInteger(settings.position_index, 1);
  let minIndex = coercePositiveInteger(settings.random_min_index, 1);
  let maxIndex = coercePositiveInteger(settings.random_max_index, minIndex);

  if (minIndex > maxIndex) {
    [minIndex, maxIndex] = [maxIndex, minIndex];
  }

  return {
    insertMode,
    randomize,
    positionIndex,
    minIndex,
    maxIndex,
  };
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

export function determineInsertionIndex({
  listLength,
  settings,
  randomSelector = Math.random,
}) {
  const config = resolvePlacementSettings(settings);

  if (config.insertMode === "before_list") {
    return { mode: "before_list", index: 0 };
  }

  if (config.insertMode === "list_footer") {
    return { mode: "list_footer", index: clampIndex(listLength, listLength) };
  }

  if (listLength <= 0) {
    return { mode: "after_n", index: 1 };
  }

  if (config.randomize) {
    const minIndex = clampIndex(config.minIndex, listLength);
    const maxIndex = clampIndex(config.maxIndex, listLength);

    const range = Math.max(maxIndex - minIndex + 1, 1);
    const selection = Math.floor(randomSelector() * range);
    return { mode: "after_n", index: minIndex + selection };
  }

  const index = clampIndex(config.positionIndex, listLength);
  return { mode: "after_n", index };
}

export function queryTopicListElements(root = document) {
  const listArea = root.querySelector?.("#list-area");
  if (!listArea) {
    return null;
  }

  const topicList = listArea.querySelector(".topic-list");
  if (!topicList) {
    return { listArea, topicList: null, bodyRows: [] };
  }

  const bodyRows = Array.from(topicList.querySelectorAll("tbody tr.topic-list-item"));
  const columnCount =
    topicList.querySelector("thead tr")?.children?.length ||
    topicList.querySelector("colgroup")?.children?.length ||
    1;

  return {
    listArea,
    topicList,
    bodyRows,
    columnCount,
  };
}

export function ensureRowWrapper({ sliderElement, columnCount }) {
  let row = sliderElement.closest?.("tr.gwj-featured-topic-slider-row");
  if (row) {
    return row;
  }

  row = document.createElement("tr");
  row.className = "gwj-featured-topic-slider-row";
  const cell = document.createElement("td");
  cell.colSpan = columnCount || 1;
  row.appendChild(cell);
  cell.appendChild(sliderElement);
  return row;
}

export function ensureBlockWrapper(sliderElement) {
  const wrapper =
    sliderElement.closest?.(".gwj-featured-topic-slider-block") ||
    document.createElement("div");

  if (!wrapper.classList.contains("gwj-featured-topic-slider-block")) {
    wrapper.className = "gwj-featured-topic-slider-block";
    sliderElement.parentNode?.insertBefore(wrapper, sliderElement);
    wrapper.appendChild(sliderElement);
  }

  return wrapper;
}
