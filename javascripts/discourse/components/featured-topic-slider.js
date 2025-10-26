/* global settings */

import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import { inject as service } from "@ember/service";
import { fetchFeaturedTopics } from "discourse/lib/gwj-featured-topic-data";
import { resolveTopicImage } from "discourse/lib/gwj-topic-images";
import { getURL } from "discourse-common/lib/get-url";

export default class FeaturedTopicSliderComponent extends Component {
  @service site;

  themeSettings = settings;
  sliderDomId = `gwj-featured-topic-slider-${Math.random().toString(36).slice(2, 9)}`;

  @tracked isLoading = true;
  @tracked topics = [];
  @tracked error = null;
  @tracked activeIndex = 0;

  #requestInFlight = null;
  #viewportElement = null;

  get hasTopics() {
    return Array.isArray(this.topics) && this.topics.length > 0;
  }

  get showHeading() {
    return this.themeSettings.show_title && this.themeSettings.title_text?.length;
  }

  get cacheContext() {
    return this.args?.cacheContext || window.location.pathname || "default";
  }

  get featuredTag() {
    return this.themeSettings.featured_tag?.trim();
  }

  get topicQuota() {
    return Number(this.themeSettings.topic_count) || 0;
  }

  get topicCards() {
    if (!this.hasTopics) {
      return [];
    }

    return this.topics.map((topic) => {
      const image = resolveTopicImage(topic, this.site);
      const category = topic.category_id
        ? this.site.categories?.find((cat) => cat.id === topic.category_id)
        : null;

      return {
        id: topic.id,
        title: topic.fancy_title || topic.title,
        url: getURL(`/t/${topic.slug || topic.id}/${topic.id}`),
        excerpt: topic.excerpt,
        image,
        tags: topic.tags || [],
        category,
        author: topic.op_user || topic.posters?.[0],
        lastPostedAt: topic.bumped_at || topic.last_posted_at,
      };
    });
  }

  get sliderInlineStyle() {
    const desktopCount = Math.max(Number(this.themeSettings.slides_desktop) || 3, 1);
    const aspectSetting = this.themeSettings.card_aspect_ratio || "16:9";
    const [width, height] = aspectSetting.split(":").map((value) => Number(value) || 1);
    const aspectPercent = (height / width) * 100;

    return `--gwj-slider-desktop-count: ${desktopCount}; --gwj-slider-aspect-ratio: ${aspectPercent}%;`;
  }

  get showControls() {
    return this.topicCards.length > 1;
  }

  get isPrevDisabled() {
    return this.activeIndex <= 0;
  }

  get isNextDisabled() {
    return this.activeIndex >= Math.max(this.topicCards.length - 1, 0);
  }

  @action
  async loadTopics() {
    if (this.#requestInFlight) {
      return this.#requestInFlight;
    }

    this.isLoading = true;
    this.error = null;
    const options = {
      tag: this.featuredTag,
      topicCount: this.topicQuota,
      includePinned: this.themeSettings.include_pinned,
      shuffle: this.themeSettings.shuffle_topics,
      cacheContext: this.cacheContext,
    };

    const request = fetchFeaturedTopics(options)
      .then((topics) => {
        this.topics = topics;
        this.activeIndex = 0;
      })
      .catch((error) => {
        this.error = error;
        // eslint-disable-next-line no-console
        console.warn("[featured-topic-slider] Failed to load featured topics", error);
      })
      .finally(() => {
        this.isLoading = false;
        this.#requestInFlight = null;
      });

    this.#requestInFlight = request;
    return request;
  }

  @action
  registerViewport(element) {
    this.#viewportElement = element;
    element.addEventListener("scroll", this.handleViewportScroll, { passive: true });
    this.handleViewportScroll();
  }

  @action
  unregisterViewport(element) {
    element.removeEventListener("scroll", this.handleViewportScroll);
    if (this.#viewportElement === element) {
      this.#viewportElement = null;
    }
  }

  @action
  handleViewportScroll() {
    const viewport = this.#viewportElement;
    if (!viewport) {
      return;
    }

    const cards = viewport.querySelectorAll("[data-slider-index]");
    if (!cards.length) {
      return;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const viewportCenter = viewportRect.left + viewportRect.width / 2;

    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    cards.forEach((card) => {
      const rect = card.getBoundingClientRect();
      const cardCenter = rect.left + rect.width / 2;
      const distance = Math.abs(cardCenter - viewportCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = Number(card.dataset.sliderIndex);
      }
    });

    this.activeIndex = closestIndex;
  }

  scrollToIndex(targetIndex) {
    const viewport = this.#viewportElement;
    if (!viewport) {
      return;
    }

    const boundedIndex = Math.min(Math.max(targetIndex, 0), this.topicCards.length - 1);
    const targetCard = viewport.querySelector(`[data-slider-index="${boundedIndex}"]`);
    if (targetCard) {
      targetCard.scrollIntoView({
        behavior: "smooth",
        inline: "start",
        block: "nearest",
      });
      this.activeIndex = boundedIndex;
    }
  }

  @action
  focusNext() {
    this.scrollToIndex(this.activeIndex + 1);
  }

  @action
  focusPrev() {
    this.scrollToIndex(this.activeIndex - 1);
  }
}
