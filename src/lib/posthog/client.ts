"use client";

import posthog, { type PostHogConfig } from "posthog-js";

import {
  getPostHogProjectToken,
  isPostHogConfigured,
  posthogConfig,
} from "@/lib/posthog/config";

type PostHogClient = typeof posthog;

let posthogInitialized = false;

function initPostHog() {
  if (!isPostHogConfigured()) return null;

  if (!posthogInitialized) {
    const options = {
      advanced_disable_feature_flags: false,
      advanced_disable_feature_flags_on_first_load: false,
      advanced_disable_flags: false,
      api_host: posthogConfig.host,
      autocapture: true,
      capture_pageleave: false,
      capture_pageview: "history_change",
      consent_persistence_name: posthogConfig.consentStorageName,
      cookieless_mode: "on_reject",
      cross_subdomain_cookie: true,
      defaults: "2026-01-30",
      disable_product_tours: true,
      disable_session_recording: false,
      disable_surveys: true,
      disable_surveys_automatic_display: true,
      disable_web_experiments: true,
      enable_heatmaps: true,
      mask_all_element_attributes: true,
      mask_all_text: true,
      opt_out_capturing_persistence_type: "cookie",
      persistence: "cookie",
      person_profiles: "identified_only",
      secure_cookie: window.location.protocol === "https:",
      ui_host: posthogConfig.uiHost,
    } satisfies Partial<PostHogConfig>;

    posthog.init(getPostHogProjectToken(), options);
    posthogInitialized = true;

    if (process.env.NODE_ENV === "development") {
      posthog.debug();
    }
  }

  return posthog;
}

export function loadPostHog(): Promise<PostHogClient | null> {
  return Promise.resolve(initPostHog());
}

export function resetPostHogIdentity() {
  const client = initPostHog();
  client?.reset();
}

export function getPostHogPersistedUserId() {
  const client = initPostHog();
  const persistedUserId = client?.get_property("$user_id");
  return typeof persistedUserId === "string" && persistedUserId
    ? persistedUserId
    : null;
}
