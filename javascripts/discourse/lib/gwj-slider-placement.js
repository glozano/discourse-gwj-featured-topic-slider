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
  // Creates a synthetic table row that spans all topic-list columns so the slider
  // can be injected after the configured row index when using the after_n mode.
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
