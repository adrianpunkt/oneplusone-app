"use client";

import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";

import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

type Mode = "read" | "edit";
type AutocompleteKind = "city" | "language";

type LocationData = {
  city: string;
  countryCode: string;
  latitude: number | null;
  longitude: number | null;
};

type CityItem = {
  aliases?: string[];
  asciiName?: string;
  country?: string;
  countryCode?: string;
  id?: number | string;
  isAllAreas?: boolean;
  lat?: number | string;
  lng?: number | string;
  name: string;
  normalizedAliases?: string[];
  normalizedAsciiName?: string;
  normalizedCountry?: string;
  normalizedName?: string;
  normalizedOriginalAsciiName?: string;
  normalizedOriginalName?: string;
  normalizedParentName?: string;
  normalizedParentStoredName?: string;
  normalizedStoredName?: string;
  originalAsciiName?: string;
  originalName?: string;
  parentId?: number | string;
  parentName?: string;
  population?: number;
  sectionName?: string;
  storedLabel?: string;
};

type LanguageItem = {
  aliases?: string[];
  code?: string;
  countries?: string[];
  name: string;
  normalizedAliases?: string[];
  normalizedCode?: string;
  normalizedName?: string;
  speakerScore?: number;
  storedLabel?: string;
};

type CityData = {
  allAreaCities: CityItem[];
  allAreaCitiesByAreaKey: Map<string, CityItem>;
  cities: CityItem[];
  removedParentCities: CityItem[];
};

type LanguageData = {
  countryLanguages: Record<string, string[]>;
  countryNames: Record<string, string>;
  languages: LanguageItem[];
};

type Selection = {
  code?: string;
  country?: string;
  countryCode?: string;
  item: CityItem | LanguageItem;
  key: string;
  label: string;
  meta?: string;
  storedLabel: string;
};

const CITY_DATA_URL = "/data/cities-100k.json";
const LANGUAGE_DATA_URL = "/data/languages.json";
const LOCATION_URL = "/api/location";
const INITIAL_RESULT_LIMIT = 30;
const RESULT_BATCH_SIZE = 30;
const ENGLISH_CODE = "en";

let cityDataPromise: Promise<CityData> | null = null;
let languageDataPromise: Promise<LanguageData> | null = null;
let locationPromise: Promise<LocationData> | null = null;

type StoryAutocompleteCopy = Dictionary["autocomplete"];

const defaultAutocompleteCopy: StoryAutocompleteCopy = {
  allAreas: "ALL AREAS",
  and: "and",
  citySuggestionPlural: "city suggestions available.",
  citySuggestionSingular: "city suggestion available.",
  close: "Close",
  closeSuggestions: "Close suggestions",
  languageSuggestionPlural: "language suggestions available.",
  languageSuggestionSingular: "language suggestion available.",
  loadingCities: "Loading cities...",
  loadingLanguages: "Loading languages...",
  noMatchingCities: "No matching cities.",
  noMatchingLanguages: "No matching languages.",
  openCitySuggestions: "Open city suggestions",
  openLanguageSuggestions: "Open language suggestions",
  removePrefix: "Remove",
  searchCities: "Search cities",
  searchLanguages: "Search languages",
};

export function StoryAutocompleteField({
  copy = defaultAutocompleteCopy,
  defaultValue,
  kind,
  label,
  mode,
  name,
  onDirty,
  placeholder,
}: {
  copy?: StoryAutocompleteCopy;
  defaultValue?: string;
  kind: AutocompleteKind;
  label: string;
  mode: Mode;
  name: string;
  onDirty?: () => void;
  placeholder: string;
}) {
  const reactId = useId();
  const listId = `${reactId}-list`;
  const statusId = `${reactId}-status`;
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [resultLimit, setResultLimit] = useState(INITIAL_RESULT_LIMIT);
  const [cityData, setCityData] = useState<CityData | null>(null);
  const [languageData, setLanguageData] = useState<LanguageData | null>(null);
  const [location, setLocation] = useState<LocationData>({
    city: "",
    countryCode: "",
    latitude: null,
    longitude: null,
  });
  const [selected, setSelected] = useState<Selection[]>(() =>
    parseStoredParts(defaultValue, kind).map((value) =>
      makeStoredSelection(kind, value, copy.allAreas),
    ),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const userChangedRef = useRef(false);
  const canonicalizedRef = useRef(false);

  const hiddenValue = selected.map((item) => item.storedLabel).join("; ");
  const isLoaded = kind === "city" ? Boolean(cityData) : Boolean(languageData);
  const suggestions = useMemo(() => {
    if (kind === "city") {
      return cityData
        ? getCitySuggestions(cityData, selected, location, query, copy.allAreas)
        : [];
    }

    return languageData ? getLanguageSuggestions(languageData, selected, location, query) : [];
  }, [cityData, copy.allAreas, kind, languageData, location, query, selected]);
  const visibleSuggestions = suggestions.slice(0, resultLimit);
  const suggestionText =
    kind === "city"
      ? visibleSuggestions.length === 1
        ? copy.citySuggestionSingular
        : copy.citySuggestionPlural
      : visibleSuggestions.length === 1
        ? copy.languageSuggestionSingular
        : copy.languageSuggestionPlural;
  const statusText = isLoaded
    ? visibleSuggestions.length
      ? `${visibleSuggestions.length} ${suggestionText}`
      : kind === "city"
        ? copy.noMatchingCities
        : copy.noMatchingLanguages
    : kind === "city"
      ? copy.loadingCities
      : copy.loadingLanguages;

  const loadResources = useCallback(() => {
    if (kind === "city") {
      void Promise.all([loadLocation(), loadCityData()]).then(([nextLocation, data]) => {
        setLocation(nextLocation);
        setCityData(data);
        if (canonicalizedRef.current || userChangedRef.current) return;
        canonicalizedRef.current = true;
        setSelected((current) =>
          canonicalizeCitySelections(data, current, nextLocation, copy.allAreas),
        );
      });
    } else {
      void loadLocation().then(setLocation);
      void loadLanguageData().then((data) => {
        setLanguageData(data);
        if (canonicalizedRef.current || userChangedRef.current) return;
        canonicalizedRef.current = true;
        setSelected((current) => canonicalizeLanguageSelections(data, current));
      });
    }
  }, [copy.allAreas, kind]);

  useEffect(() => {
    if (isOpen) loadResources();
  }, [isOpen, loadResources]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      setIsOpen(false);
      setQuery("");
      setActiveIndex(0);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  if (mode === "read") {
    return (
      <span
        className={cn(
          "mx-1 inline max-w-full break-words px-1 font-semibold text-lipstick",
          !selected.length && "text-faint",
        )}
      >
        {selected.length
          ? joinLabels(selected.map((item) => item.label), copy.and)
          : placeholder}
      </span>
    );
  }

  function openList() {
    setIsOpen(true);
    setResultLimit(INITIAL_RESULT_LIMIT);
    window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }

  function closeList() {
    setIsOpen(false);
    setQuery("");
    setActiveIndex(0);
  }

  function selectSuggestion(item: Selection) {
    userChangedRef.current = true;
    onDirty?.();
    setSelected((current) => {
      const withoutDuplicate = current.filter((selectedItem) => selectedItem.key !== item.key);
      if (kind === "city") {
        return [...removeConflictingCitySelections(withoutDuplicate, item), item];
      }
      return [...withoutDuplicate, item];
    });
    closeList();
  }

  function removeSelected(key: string) {
    userChangedRef.current = true;
    onDirty?.();
    setSelected((current) => current.filter((item) => item.key !== key));
    setActiveIndex(0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isOpen) openList();
      setActiveIndex((current) => Math.min(current + 1, Math.max(visibleSuggestions.length - 1, 0)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) openList();
      setActiveIndex((current) =>
        current <= 0 ? Math.max(visibleSuggestions.length - 1, 0) : current - 1,
      );
      return;
    }

    if (event.key === "Enter" && isOpen) {
      event.preventDefault();
      const suggestion = visibleSuggestions[activeIndex];
      if (suggestion) selectSuggestion(suggestion);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeList();
      inputRef.current?.blur();
      return;
    }

    if (event.key === "Backspace" && !query && selected.length) {
      removeSelected(selected[selected.length - 1].key);
    }
  }

  return (
    <span className="relative inline max-w-full align-baseline">
      <input name={name} type="hidden" value={hiddenValue} />
      <span className="inline max-w-full">
        {selected.map((item, index) => (
          <span key={item.key}>
            <button
              className="mx-1 inline max-w-full cursor-pointer break-words border-0 bg-transparent px-1 py-0 align-baseline font-semibold leading-tight text-lipstick underline decoration-dotted decoration-[1.5px] underline-offset-[0.28em] transition hover:text-wine hover:decoration-solid"
              onClick={openList}
              type="button"
            >
              {item.label}
            </button>
            {delimiterAfter(index, selected.length, copy.and)}
          </span>
        ))}
      </span>
      <button
        aria-label={
          kind === "city"
            ? copy.openCitySuggestions
            : copy.openLanguageSuggestions
        }
        className={cn(
          "inline-flex cursor-pointer items-center border-0 bg-transparent p-0 font-semibold leading-tight text-lipstick transition hover:text-wine",
          selected.length
            ? "ml-[0.05em] mr-[0.12em] h-[1em] w-[1em] justify-center rounded-full bg-lipstick align-[-0.08em] text-white hover:bg-wine hover:text-white"
            : "mx-1 gap-2 px-1 align-baseline underline decoration-dotted decoration-[1.5px] underline-offset-[0.28em]",
        )}
        onClick={openList}
        type="button"
      >
        {!selected.length ? placeholder : null}
        <span
          className={cn(
            "inline-grid place-items-center rounded-full text-white",
            selected.length ? "h-full w-full bg-transparent" : "h-[1.05em] w-[1.05em] bg-lipstick",
          )}
        >
          <Plus className={selected.length ? "h-[0.52em] w-[0.52em]" : "h-[0.62em] w-[0.62em]"} strokeWidth={3.25} />
        </span>
      </button>

      {isOpen ? (
        <>
          <div
            className="fixed inset-0 z-50 cursor-pointer bg-wine/10 backdrop-blur-[1px]"
            aria-hidden="true"
            onPointerDown={closeList}
          />
          <label className="sr-only" htmlFor={reactId}>
            {label}
          </label>
          <div
            className="fixed left-1/2 top-24 z-[60] w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 text-base md:top-1/2 md:-translate-y-1/2"
            ref={popoverRef}
          >
            <div className="relative">
              <input
                aria-activedescendant={
                  visibleSuggestions[activeIndex] ? `${listId}-option-${activeIndex}` : undefined
                }
                aria-autocomplete="list"
                aria-controls={listId}
                aria-describedby={statusId}
                aria-expanded="true"
                className="h-14 w-full rounded-t-lg border border-lipstick/30 border-b-wine/10 bg-white px-4 pr-20 text-base font-semibold text-ink shadow-none outline-none placeholder:text-faint"
                id={reactId}
                inputMode="search"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                  setResultLimit(INITIAL_RESULT_LIMIT);
                }}
                onKeyDown={handleKeyDown}
                placeholder={
                  kind === "city" ? copy.searchCities : copy.searchLanguages
                }
                ref={inputRef}
                role="combobox"
                type="text"
                value={query}
              />
              <button
                aria-label={copy.closeSuggestions}
                className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer border-0 bg-transparent px-0 text-sm font-semibold leading-none text-lipstick underline underline-offset-4 transition hover:text-wine"
                onClick={() => {
                  closeList();
                  inputRef.current?.blur();
                }}
                type="button"
              >
                {copy.close}
              </button>
            </div>
            <div
              className="grid max-h-[min(23rem,50vh)] gap-1 overflow-y-auto rounded-b-lg border border-lipstick/30 border-t-wine/10 bg-white p-2 shadow-[0_18px_45px_rgba(68,10,18,0.14)]"
              id={listId}
              onMouseDown={(event) => event.preventDefault()}
              onScroll={(event) => {
                const target = event.currentTarget;
                if (target.scrollTop + target.clientHeight >= target.scrollHeight - 24) {
                  setResultLimit((current) => Math.min(current + RESULT_BATCH_SIZE, suggestions.length));
                }
              }}
              ref={listRef}
              role="listbox"
            >
              {selected.length ? (
                <div className="mb-1 grid gap-1 border-b border-wine/10 pb-1">
                  {selected.map((item) => (
                    <div
                      className="grid min-h-10 grid-cols-[minmax(0,1fr)_2rem] items-center gap-3 px-2 py-1 text-sm font-semibold text-wine"
                      key={item.key}
                    >
                      <span className="min-w-0 truncate">{item.label}</span>
                      <button
                        aria-label={`${copy.removePrefix} ${item.label}`}
                        className="inline-grid h-7 w-7 cursor-pointer place-items-center rounded-full bg-lipstick text-white transition hover:bg-wine"
                        onClick={() => removeSelected(item.key)}
                        type="button"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {!isLoaded ? (
                <p className="px-3 py-3 text-sm font-semibold text-muted">
                  {kind === "city" ? copy.loadingCities : copy.loadingLanguages}
                </p>
              ) : visibleSuggestions.length ? (
                visibleSuggestions.map((item, index) => (
                  <button
                    className="grid min-h-12 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md px-3 py-2 text-left text-ink transition hover:bg-lipstick/8 data-[active=true]:bg-lipstick/8"
                    data-active={index === activeIndex}
                    aria-selected={index === activeIndex}
                    id={`${listId}-option-${index}`}
                    key={item.key}
                    onClick={() => selectSuggestion(item)}
                    role="option"
                    type="button"
                  >
                    <span className="grid min-w-0 gap-0.5">
                      <strong className="truncate text-sm font-semibold text-wine">{item.label}</strong>
                      {item.meta ? (
                        <span className="truncate text-xs font-medium text-muted">{item.meta}</span>
                      ) : null}
                    </span>
                    {item.code ? (
                      <span className="rounded-full border border-lipstick/20 bg-lipstick/8 px-2 py-1 text-xs font-semibold uppercase text-lipstick">
                        {item.code}
                      </span>
                    ) : null}
                  </button>
                ))
              ) : (
                <p className="px-3 py-3 text-sm font-semibold text-muted">
                  {kind === "city" ? copy.noMatchingCities : copy.noMatchingLanguages}
                </p>
              )}
            </div>
          </div>
          <span className="sr-only" id={statusId} role="status">
            {statusText}
          </span>
        </>
      ) : null}
    </span>
  );
}

function normalize(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function normalizeLanguageCode(value: unknown) {
  return String(value || "").replace(/_/g, "-").toLowerCase();
}

function parseStoredParts(rawValue: string | undefined, kind: AutocompleteKind) {
  const value = String(rawValue || "").trim();
  if (!value) return [];
  const separator = value.includes(";") ? ";" : kind === "language" ? "," : "";
  if (!separator) return [value];
  return value
    .split(separator)
    .map((part) => part.trim())
    .filter(Boolean);
}

function localizeAllAreasLabel(value: string, allAreasLabel = "ALL AREAS") {
  return value.replace(/\bALL AREAS\b/g, allAreasLabel);
}

function makeStoredSelection(kind: AutocompleteKind, value: string, allAreasLabel = "ALL AREAS"): Selection {
  const item =
    kind === "city"
      ? ({
          country: "",
          countryCode: "",
          name: value,
          storedLabel: value,
        } satisfies CityItem)
      : ({
          code: "",
          name: value,
          storedLabel: value,
        } satisfies LanguageItem);

  return {
    item,
    key: `custom:${normalize(value)}`,
    label: kind === "city" ? localizeAllAreasLabel(value, allAreasLabel) : value,
    storedLabel: value,
  };
}

function delimiterAfter(index: number, length: number, and: string) {
  if (index >= length - 1) return "";
  if (index === length - 2) return ` ${and} `;
  return ", ";
}

function joinLabels(labels: string[], and: string) {
  if (labels.length <= 2) return labels.join(labels.length === 2 ? ` ${and} ` : "");
  return `${labels.slice(0, -1).join(", ")} ${and} ${labels[labels.length - 1]}`;
}

async function loadLocation() {
  if (!locationPromise) {
    locationPromise = fetch(LOCATION_URL, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : {}))
      .catch(() => ({}))
      .then((payload: unknown) => {
        const location = isObjectRecord(payload) ? payload : {};
        return {
          city: String(location.city || ""),
          countryCode: String(location.countryCode || getLocaleCountryCode() || "").toUpperCase(),
          latitude: Number.isFinite(Number(location.latitude)) ? Number(location.latitude) : null,
          longitude: Number.isFinite(Number(location.longitude)) ? Number(location.longitude) : null,
        };
      });
  }

  return locationPromise;
}

async function loadCityData() {
  if (!cityDataPromise) {
    cityDataPromise = fetch(CITY_DATA_URL, { cache: "no-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`City data failed with ${response.status}`);
        return response.json();
      })
      .then((payload) => prepareCityData(payload))
      .catch(() => ({
        allAreaCities: [],
        allAreaCitiesByAreaKey: new Map(),
        cities: [],
        removedParentCities: [],
      }));
  }

  return cityDataPromise;
}

async function loadLanguageData() {
  if (!languageDataPromise) {
    languageDataPromise = fetch(LANGUAGE_DATA_URL, { cache: "no-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`Language data failed with ${response.status}`);
        return response.json();
      })
      .then((payload) => ({
        countryLanguages: payload.countryLanguages || {},
        countryNames: payload.countryNames || {},
        languages: (payload.languages || []).map((language: LanguageItem) => ({
          ...language,
          normalizedAliases: (language.aliases || [])
            .flatMap((alias) => [normalize(alias), normalizeLanguageCode(alias)])
            .filter(Boolean),
          normalizedCode: normalizeLanguageCode(language.code),
          normalizedName: normalize(language.name),
        })),
      }))
      .catch(() => ({
        countryLanguages: {},
        countryNames: {},
        languages: [],
      }));
  }

  return languageDataPromise;
}

function prepareCityData(payload: { cities?: CityItem[]; removedParentCities?: CityItem[] }) {
  const removedParentCities = (payload.removedParentCities || []).map((city) => ({
    ...city,
    normalizedAsciiName: normalize(city.asciiName),
    normalizedName: normalize(city.name),
    normalizedStoredName: normalize(formatStoredCity(city)),
  }));
  const cities = (payload.cities || []).map((city) => ({
    ...city,
    normalizedAliases: (city.aliases || [])
      .flatMap((alias) => [
        normalize(alias),
        normalize(city.country ? `${alias}, ${city.country}` : alias),
      ])
      .filter(Boolean),
    normalizedAsciiName: normalize(city.asciiName),
    normalizedCountry: normalize(city.country),
    normalizedName: normalize(city.name),
    normalizedOriginalAsciiName: normalize(city.originalAsciiName),
    normalizedOriginalName: normalize(city.originalName),
    normalizedParentName: normalize(city.parentName),
  }));
  const allAreaCities = buildAllAreaCities(cities, removedParentCities);

  return {
    allAreaCities,
    allAreaCitiesByAreaKey: new Map(allAreaCities.map((city) => [parentAreaKey(city), city])),
    cities,
    removedParentCities,
  };
}

function buildAllAreaCities(cities: CityItem[], removedParentCities: CityItem[]) {
  const childrenByParentId = cities.reduce<Map<string, CityItem[]>>((groups, city) => {
    if (!city.parentId) return groups;
    const parentId = String(city.parentId);
    const group = groups.get(parentId) || [];
    group.push(city);
    groups.set(parentId, group);
    return groups;
  }, new Map());

  return removedParentCities
    .filter((city) => (childrenByParentId.get(String(city.id)) || []).length > 1)
    .map((city) => makeAllAreasCity(city, childrenByParentId.get(String(city.id)) || []));
}

function makeAllAreasCity(city: CityItem, childCities: CityItem[]) {
  const parentName = String(city.name || "").trim();
  const parentAsciiName = String(city.asciiName || parentName).trim();
  const country = String(city.country || "").trim();
  const label = `${parentName} - ALL AREAS`;
  const asciiLabel = `${parentAsciiName} - ALL AREAS`;
  const storedLabel = country ? `${label}, ${country}` : label;
  const coordinates = inferAllAreaCoordinates(city, childCities);
  const aliasValues = [
    parentName,
    parentAsciiName,
    `${parentName} all areas`,
    `${parentAsciiName} all areas`,
    country ? `${parentName} all areas, ${country}` : "",
    `${parentName} todas las zonas`,
    `${parentAsciiName} todas las zonas`,
    country ? `${parentName} todas las zonas, ${country}` : "",
  ];

  return {
    ...city,
    asciiName: asciiLabel,
    id: `all:${city.id || normalize(storedLabel)}`,
    isAllAreas: true,
    lat: coordinates.lat,
    lng: coordinates.lng,
    name: label,
    normalizedAliases: aliasValues.flatMap((alias) => [normalize(alias)]).filter(Boolean),
    normalizedAsciiName: normalize(asciiLabel),
    normalizedCountry: normalize(country),
    normalizedName: normalize(label),
    normalizedOriginalAsciiName: normalize(parentAsciiName),
    normalizedOriginalName: normalize(parentName),
    normalizedParentName: normalize(parentName),
    normalizedStoredName: normalize(storedLabel),
    originalAsciiName: parentAsciiName,
    originalName: parentName,
    parentId: city.id,
    parentName,
    sectionName: "ALL AREAS",
    storedLabel,
  } satisfies CityItem;
}

function inferAllAreaCoordinates(city: CityItem, childCities: CityItem[]) {
  const cityLat = Number(city.lat);
  const cityLng = Number(city.lng);
  if (Number.isFinite(cityLat) && Number.isFinite(cityLng)) {
    return { lat: cityLat, lng: cityLng };
  }

  let weightedLat = 0;
  let weightedLng = 0;
  let totalWeight = 0;
  childCities.forEach((childCity) => {
    const lat = Number(childCity.lat);
    const lng = Number(childCity.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const population = Number(childCity.population || 0);
    const weight = Number.isFinite(population) && population > 0 ? population : 1;
    weightedLat += lat * weight;
    weightedLng += lng * weight;
    totalWeight += weight;
  });

  if (!totalWeight) return { lat: city.lat, lng: city.lng };
  return { lat: weightedLat / totalWeight, lng: weightedLng / totalWeight };
}

function formatStoredCity(city: CityItem) {
  if (city.storedLabel) return city.storedLabel;
  return city.country ? `${city.name}, ${city.country}` : city.name;
}

function formatVisibleCity(city: CityItem, allAreasLabel = "ALL AREAS") {
  if (city.isAllAreas) {
    return `${city.parentName || city.originalName || city.name} - ${allAreasLabel}`;
  }
  const parentName = String(city.parentName || "").trim();
  const sectionName = String(city.sectionName || "").trim();
  if (parentName && sectionName && normalize(parentName) !== normalize(sectionName)) {
    return `${parentName} - ${sectionName}`;
  }

  const label = String(city.storedLabel || city.name || formatStoredCity(city) || "").trim();
  const parts = label
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join(" - ") : label;
}

function selectedCityKey(city: CityItem) {
  return city.id ? `id:${city.id}` : `custom:${normalize(formatStoredCity(city))}`;
}

function selectedLanguageKey(language: LanguageItem) {
  return language.code
    ? `code:${normalizeLanguageCode(language.code)}`
    : `custom:${normalize(formatStoredLanguage(language))}`;
}

function parentAreaKey(city: CityItem | Selection) {
  const item = "item" in city ? (city.item as CityItem) : city;
  if (!item || !item.parentId) return "";
  return `${String(item.countryCode || "").toUpperCase()}:${String(item.parentId)}`;
}

function makeCitySelection(city: CityItem, allAreasLabel = "ALL AREAS"): Selection {
  return {
    country: city.country,
    countryCode: city.countryCode,
    item: city,
    key: selectedCityKey(city),
    label: formatVisibleCity(city, allAreasLabel),
    meta: city.country,
    storedLabel: formatStoredCity(city),
  };
}

function cityMatchesStoredValue(city: CityItem, normalizedValue: string) {
  if (!city || !normalizedValue) return false;

  return (
    normalize(formatStoredCity(city)) === normalizedValue ||
    city.normalizedStoredName === normalizedValue ||
    city.normalizedParentStoredName === normalizedValue ||
    (city.originalName && normalize(`${city.originalName}, ${city.country}`) === normalizedValue) ||
    (city.normalizedAliases || []).includes(normalizedValue) ||
    city.normalizedName === normalizedValue ||
    city.normalizedAsciiName === normalizedValue ||
    city.normalizedOriginalName === normalizedValue ||
    city.normalizedOriginalAsciiName === normalizedValue
  );
}

function findCityFromStored(data: CityData, value: string, location?: LocationData) {
  const normalizedValue = normalize(value);
  if (!normalizedValue) return null;
  const matches = [...data.allAreaCities, ...data.cities].filter((city) =>
    cityMatchesStoredValue(city, normalizedValue),
  );

  if (!matches.length) return null;
  if (!location) return matches[0];

  return [...matches].sort((a, b) => compareCitiesByLocation(a, b, location, ""))[0];
}

function canonicalizeCitySelections(
  data: CityData,
  selections: Selection[],
  location?: LocationData,
  allAreasLabel = "ALL AREAS",
) {
  return selections.map((selection) => {
    const city = findCityFromStored(data, selection.storedLabel, location);
    return city ? makeCitySelection(city, allAreasLabel) : selection;
  });
}

function isSameCountry(city: CityItem, location: LocationData) {
  return Boolean(location.countryCode && city.countryCode === location.countryCode);
}

function isLocatedCity(city: CityItem, location: LocationData) {
  const locatedCity = normalize(location.city);
  if (!locatedCity) return false;
  return (
    isSameCountry(city, location) &&
    (city.normalizedName === locatedCity ||
      city.normalizedAsciiName === locatedCity ||
      city.normalizedOriginalName === locatedCity ||
      city.normalizedOriginalAsciiName === locatedCity)
  );
}

function cityDistanceKm(city: CityItem, location: LocationData) {
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return null;
  const cityLat = Number(city.lat);
  const cityLng = Number(city.lng);
  if (!Number.isFinite(cityLat) || !Number.isFinite(cityLng)) return null;

  const earthRadiusKm = 6371;
  const lat1 = toRadians(location.latitude);
  const lat2 = toRadians(cityLat);
  const deltaLat = toRadians(cityLat - Number(location.latitude));
  const deltaLng = toRadians(cityLng - Number(location.longitude));
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h));
}

function toRadians(value: unknown) {
  return Number(value) * Math.PI / 180;
}

function cityMatchRank(city: CityItem, query: string) {
  if (!query) return 0;
  const names = [
    city.normalizedName,
    city.normalizedAsciiName,
    city.normalizedOriginalName,
    city.normalizedOriginalAsciiName,
    city.normalizedCountry,
    ...(city.normalizedAliases || []),
  ].filter(isNonEmptyString);

  if (city.isAllAreas && city.normalizedParentName === query) return -2;
  if (city.normalizedParentName && city.normalizedParentName === query) return -1;
  if (names.some((name) => name === query)) return 0;
  if (names.some((name) => name.startsWith(query))) return 1;
  if (names.some((name) => name.split(/\s+/).some((part) => part.startsWith(query)))) return 2;
  if (names.some((name) => name.includes(query))) return 3;
  return null;
}

function getCitySuggestions(
  data: CityData,
  selected: Selection[],
  location: LocationData,
  rawQuery: string,
  allAreasLabel = "ALL AREAS",
) {
  const query = normalize(rawQuery);
  return [...data.cities, ...data.allAreaCities]
    .filter((city) => !isCitySelected(city, selected) && cityMatchRank(city, query) !== null)
    .sort((a, b) => compareCitiesByLocation(a, b, location, query))
    .map((city) => makeCitySelection(city, allAreasLabel));
}

function isCitySelected(city: CityItem, selected: Selection[]) {
  const cityKey = selectedCityKey(city);
  const cityStoredLabel = normalize(formatStoredCity(city));
  const cityVisibleLabel = normalize(formatVisibleCity(city));
  const cityCountry = normalize(city.country);

  return selected.some((selection) => {
    const selectedLabel = normalize(selection.label);
    const selectedStoredLabel = normalize(selection.storedLabel);

    if (selection.key === cityKey || selectedStoredLabel === cityStoredLabel) return true;
    if (selection.countryCode && city.countryCode && selection.countryCode === city.countryCode) {
      return selectedLabel === cityVisibleLabel;
    }
    if (selection.country && city.country && normalize(selection.country) === cityCountry) {
      return selectedLabel === cityVisibleLabel;
    }
    if (!selection.countryCode && !selection.country && selectedLabel === cityVisibleLabel) return true;

    return false;
  });
}

function compareCitiesByLocation(
  a: CityItem,
  b: CityItem,
  location: LocationData,
  query: string,
) {
  const rankDifference = Number(cityMatchRank(a, query)) - Number(cityMatchRank(b, query));
  if (query && rankDifference) return rankDifference;

  const sameParentArea = parentAreaKey(a) && parentAreaKey(a) === parentAreaKey(b);
  if (sameParentArea) {
    const allAreasDifference = Number(Boolean(b.isAllAreas)) - Number(Boolean(a.isAllAreas));
    if (allAreasDifference) return allAreasDifference;
  }

  const locatedDifference = Number(isLocatedCity(b, location)) - Number(isLocatedCity(a, location));
  if (locatedDifference) return locatedDifference;

  const distanceA = cityDistanceKm(a, location);
  const distanceB = cityDistanceKm(b, location);
  if (distanceA !== null || distanceB !== null) {
    if (distanceA === null) return 1;
    if (distanceB === null) return -1;
    const difference = distanceA - distanceB;
    if (Math.abs(difference) > 1) return difference;
  }

  const countryDifference = Number(isSameCountry(b, location)) - Number(isSameCountry(a, location));
  if (countryDifference) return countryDifference;

  if (rankDifference) return rankDifference;

  const populationDifference = Number(b.population || 0) - Number(a.population || 0);
  if (populationDifference) return populationDifference;

  return String(a.name).localeCompare(String(b.name));
}

function removeConflictingCitySelections(selected: Selection[], nextSelection: Selection) {
  const areaKey = parentAreaKey(nextSelection);
  if (!areaKey) return selected;
  const nextCity = nextSelection.item as CityItem;

  if (nextCity.isAllAreas) {
    return selected.filter((selectedItem) => parentAreaKey(selectedItem) !== areaKey);
  }

  return selected.filter((selectedItem) => {
    const selectedCity = selectedItem.item as CityItem;
    return !selectedCity.isAllAreas || parentAreaKey(selectedItem) !== areaKey;
  });
}

function formatStoredLanguage(language: LanguageItem) {
  return language.storedLabel || language.name;
}

function makeLanguageSelection(language: LanguageItem, currentLanguageLabel = ""): Selection {
  const code = normalizeLanguageCode(language.code);
  const label = code === "en" && currentLanguageLabel ? currentLanguageLabel : formatStoredLanguage(language);
  return {
    code: language.code ? displayLanguageCode(language.code) : undefined,
    item: language,
    key: selectedLanguageKey(language),
    label,
    storedLabel: formatStoredLanguage(language),
  };
}

function displayLanguageCode(code: unknown) {
  return String(code || "").split("-")[0].toUpperCase();
}

function findLanguageFromStored(data: LanguageData, value: string) {
  const normalizedValue = normalize(value);
  const normalizedCode = normalizeLanguageCode(value);
  if (!normalizedValue) return null;

  return (
    data.languages.find((language) => language.normalizedName === normalizedValue) ||
    data.languages.find((language) => language.normalizedCode === normalizedCode) ||
    data.languages.find((language) => (language.normalizedAliases || []).includes(normalizedValue)) ||
    data.languages.find((language) => (language.normalizedAliases || []).includes(normalizedCode)) ||
    null
  );
}

function canonicalizeLanguageSelections(data: LanguageData, selections: Selection[]) {
  return selections.map((selection) => {
    const language = findLanguageFromStored(data, selection.storedLabel);
    return language ? makeLanguageSelection(language) : selection;
  });
}

function getLanguageSuggestions(
  data: LanguageData,
  selected: Selection[],
  location: LocationData,
  rawQuery: string,
) {
  const query = normalize(rawQuery);
  return data.languages
    .filter(
      (language) =>
        !isLanguageSelected(language, selected) && languageMatchRank(language, query) !== null,
    )
    .sort((a, b) => {
      const preferredDifference =
        preferredLanguageIndex(a, data, location) - preferredLanguageIndex(b, data, location);
      if (preferredDifference) return preferredDifference;

      const rankDifference = Number(languageMatchRank(a, query)) - Number(languageMatchRank(b, query));
      if (rankDifference) return rankDifference;

      const speakerDifference = Number(b.speakerScore || 0) - Number(a.speakerScore || 0);
      if (speakerDifference) return speakerDifference;

      return String(a.name).localeCompare(String(b.name));
    })
    .map((language) => makeLanguageSelection(language));
}

function isLanguageSelected(language: LanguageItem, selected: Selection[]) {
  const languageKey = selectedLanguageKey(language);
  const languageCode = normalizeLanguageCode(language.code);
  const languageName = normalize(formatStoredLanguage(language));
  const languageAliases = new Set(
    [language.normalizedName, language.normalizedCode, ...(language.normalizedAliases || [])]
      .filter(isNonEmptyString)
      .flatMap((value) => [value, normalizeLanguageCode(value)]),
  );

  return selected.some((selection) => {
    const selectedCode = normalizeLanguageCode(selection.code);
    const selectedLabel = normalize(selection.label);
    const selectedStoredLabel = normalize(selection.storedLabel);
    const selectedStoredCode = normalizeLanguageCode(selection.storedLabel);

    return (
      selection.key === languageKey ||
      Boolean(languageCode && (selectedCode === languageCode || selectedStoredCode === languageCode)) ||
      selectedLabel === languageName ||
      selectedStoredLabel === languageName ||
      languageAliases.has(selectedLabel) ||
      languageAliases.has(selectedStoredLabel) ||
      languageAliases.has(selectedStoredCode)
    );
  });
}

function preferredLanguageIndex(language: LanguageItem, data: LanguageData, location: LocationData) {
  const normalizedCode = normalizeLanguageCode(language.code);
  const preferredCodes = [
    ...(data.countryLanguages[location.countryCode] || []),
    ENGLISH_CODE,
    ...getLocaleLanguageCodes(),
  ];
  const seen = new Set<string>();
  const uniqueCodes = preferredCodes.filter((code) => {
    const key = normalizeLanguageCode(code);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const index = uniqueCodes.findIndex((code) => normalizeLanguageCode(code) === normalizedCode);
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}

function languageMatchRank(language: LanguageItem, query: string) {
  if (!query) return 0;
  const names = [
    language.normalizedName,
    language.normalizedCode,
    normalizeLanguageCode(language.code),
    ...(language.normalizedAliases || []),
  ].filter(isNonEmptyString);

  if (names.some((name) => name === query)) return 0;
  if (names.some((name) => name.startsWith(query))) return 1;
  if (names.some((name) => name.split(/\s+/).some((part) => part.startsWith(query)))) return 2;
  if (names.some((name) => name.includes(query))) return 3;
  return null;
}

function getLocaleCountryCode() {
  if (typeof navigator === "undefined") return "";
  const match = String(navigator.language || "").match(/-([a-z]{2})$/i);
  return match ? match[1].toUpperCase() : "";
}

function getLocaleLanguageCodes() {
  if (typeof navigator === "undefined") return [];
  return (navigator.languages?.length ? navigator.languages : [navigator.language])
    .map((language) => normalizeLanguageCode(String(language || "").split("-")[0]))
    .filter(Boolean);
}
