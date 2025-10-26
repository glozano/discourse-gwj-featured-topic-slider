/* global settings */

import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import { inject as service } from "@ember/service";
import { htmlSafe } from "@ember/template";
import { escapeExpression } from "@ember/string";
import I18n from "I18n";
import { fetchFeaturedTopics } from "../lib/gwj-featured-topic-data";
import { resolveTopicImage } from "../lib/gwj-topic-images";
import getURL from "discourse-common/lib/get-url";

export default class FeaturedTopicSliderComponent extends Component {
  @service site;

  themeSettings = settings;
  sliderDomId = `gwj-featured-topic-slider-${Math.random().toString(36).slice(2, 9)}`;

  @tracked isLoading = true;
  @tracked topics = [];
  @tracked error = null;
  @tracked activeIndex = 0;
  @tracked lastSignature = null;
  @tracked parallaxOffsets = new Map();
  @tracked prefersReducedMotion = false;

  #requestInFlight = null;
  #viewportElement = null;
  #motionPreferenceDisposer = null;

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

  get currentLocale() {
    return I18n?.currentLocale?.() || this.site.locale || "en";
  }

  get fetchSignature() {
    return [
      this.currentLocale,
      this.featuredTag || "none",
      this.topicQuota,
      this.themeSettings.include_pinned ? "pinned" : "no-pinned",
      this.themeSettings.shuffle_topics ? "shuffle" : "ordered",
      this.cacheContext,
    ].join("|");
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
      const fancyTitle = topic.fancy_title;
      const safeTitle = fancyTitle
        ? htmlSafe(fancyTitle)
        : htmlSafe(escapeExpression(topic.title || ""));

      return {
        topic,
        id: topic.id,
        title: topic.fancy_title || topic.title,
        titleHtml: safeTitle,
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
  async loadTopics(force = false) {
    if (!force && this.#requestInFlight) {
      return this.#requestInFlight;
    }

    if (!force && this.lastSignature === this.fetchSignature && this.hasTopics) {
      return;
    }

    this.isLoading = true;
    this.error = null;
    const signature = this.fetchSignature;
    const options = {
      tag: this.featuredTag,
      topicCount: this.topicQuota,
      includePinned: this.themeSettings.include_pinned,
      shuffle: this.themeSettings.shuffle_topics,
      cacheContext: this.cacheContext,
      locale: this.currentLocale,
    };

    const request = fetchFeaturedTopics(options)
      .then((topics) => {
        if (signature !== this.fetchSignature) {
          return;
        }

        this.topics = topics;
        this.activeIndex = 0;
        this.lastSignature = signature;
        this.#scheduleParallaxUpdate();
      })
      .catch((error) => {
        this.error = error;
        // eslint-disable-next-line no-console
        console.warn("[featured-topic-slider] Failed to load featured topics", error);
        this.lastSignature = null;
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
    this.#setupMotionWatcher();
    this.#scheduleParallaxUpdate();
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
      this.parallaxOffsets = new Map();
      return;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const viewportCenter = viewportRect.left + viewportRect.width / 2;
    const viewportWidth = viewportRect.width || 1;

    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    const nextOffsets = new Map();

    cards.forEach((card) => {
      const rect = card.getBoundingClientRect();
      const cardCenter = rect.left + rect.width / 2;
      const distanceFromCenter = cardCenter - viewportCenter;
      const normalized = Math.max(-1, Math.min(1, distanceFromCenter / viewportWidth));
      const index = Number(card.dataset.sliderIndex);
      if (Number.isNaN(index)) {
        return;
      }

      if (!this.prefersReducedMotion) {
        const imageOffset = Number((-normalized * 26).toFixed(2));
        const bodyOffset = Number((normalized * 18).toFixed(2));
        nextOffsets.set(index, {
          image: imageOffset,
          body: bodyOffset,
        });
      }

      const distance = Math.abs(cardCenter - viewportCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    this.activeIndex = closestIndex;

    if (this.prefersReducedMotion) {
      this.parallaxOffsets = new Map();
    } else {
      this.parallaxOffsets = nextOffsets;
    }
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
      this.#scheduleParallaxUpdate();
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

  @action
  handleSignatureChange() {
    if (this.fetchSignature === this.lastSignature && this.hasTopics) {
      return;
    }
    this.loadTopics(true);
  }

  @action
  cardParallaxStyle(index) {
    if (this.prefersReducedMotion) {
      return null;
    }

    const offsets = this.parallaxOffsets.get(index);
    if (!offsets) {
      return null;
    }

    return htmlSafe(
      `--gwj-parallax-image:${offsets.image}px; --gwj-parallax-body:${offsets.body}px;`
    );
  }

  #scheduleParallaxUpdate() {
    if (typeof window === "undefined") {
      return;
    }
    window.requestAnimationFrame(() => this.handleViewportScroll());
  }

  #setupMotionWatcher() {
    if (this.#motionPreferenceDisposer || typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (event) => {
      this.prefersReducedMotion = event.matches;
      if (this.prefersReducedMotion) {
        this.parallaxOffsets = new Map();
      } else {
        this.#scheduleParallaxUpdate();
      }
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
      this.#motionPreferenceDisposer = () =>
        mediaQuery.removeEventListener("change", handleChange);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleChange);
      this.#motionPreferenceDisposer = () => mediaQuery.removeListener(handleChange);
    }

    this.prefersReducedMotion = mediaQuery.matches;
    if (this.prefersReducedMotion) {
      this.parallaxOffsets = new Map();
    }
  }

  willDestroy() {
    if (typeof super.willDestroy === "function") {
      super.willDestroy(...arguments);
    }
    if (this.#motionPreferenceDisposer) {
      this.#motionPreferenceDisposer();
      this.#motionPreferenceDisposer = null;
    }
  }
}
