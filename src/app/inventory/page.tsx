"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowLeft,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  Filter,
  LoaderCircle,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { AuthControl } from "@/components/auth-control";
import { MagicBrainLogo } from "@/components/brand-logo";
import { useCardDetail } from "@/components/card-detail-provider";
import { SetSelector } from "@/components/set-selector";
import { CARD_RARITIES } from "@/lib/card-filters";
import type { CatalogCard } from "@/lib/catalog";
import { formatCurrency } from "@/lib/data";

type CatalogResponse = {
  cards: CatalogCard[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const initialData: CatalogResponse = {
  cards: [],
  total: 0,
  page: 1,
  pageSize: 48,
  totalPages: 0,
};

const rarityOptions = ["", ...CARD_RARITIES];

export default function InventoryPage({
  defaultReserved = false,
}: {
  defaultReserved?: boolean;
}) {
  const { locale, t } = useLanguage();
  const { openCard } = useCardDetail();
  const es = locale === "es";
  const [data, setData] = useState(initialData);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [rarity, setRarity] = useState("");
  const [setCodes, setSetCodes] = useState<string[]>([]);
  const [color, setColor] = useState("");
  const [language, setLanguage] = useState("");
  const [cardType, setCardType] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [foilOnly, setFoilOnly] = useState(false);
  const [reservedOnly, setReservedOnly] = useState(defaultReserved);
  const [sort, setSort] = useState("price_desc");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<CatalogCard[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const filterButton = useRef<HTMLButtonElement>(null);
  const filterClose = useRef<HTMLButtonElement>(null);
  const filterSheet = useRef<HTMLElement>(null);
  const [draftFilters, setDraftFilters] = useState({
    rarity: "",
    setCodes: [] as string[],
    color: "",
    language: "",
    cardType: "",
    minPrice: "",
    maxPrice: "",
    foilOnly: false,
    reservedOnly: defaultReserved,
    sort: "price_desc",
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(new URLSearchParams(window.location.search).get("q") ?? "");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (query === debouncedQuery) return;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setDebouncedQuery(query);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, debouncedQuery]);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSuggestionsLoading(true);
      fetch(`/api/cards/search?q=${encodeURIComponent(normalized)}${setCodes[0] ? `&set=${encodeURIComponent(setCodes[0])}` : ""}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Search unavailable");
          return response.json() as Promise<{ cards: CatalogCard[] }>;
        })
        .then((result) => {
          setSuggestions(result.cards);
          setActiveSuggestion(-1);
        })
        .catch((suggestionError: Error) => {
          if (suggestionError.name !== "AbortError") setSuggestions([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSuggestionsLoading(false);
        });
    }, 140);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, setCodes]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      page: String(page),
      limit: "48",
      sort,
    });
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (rarity) params.set("rarity", rarity);
    if (setCodes[0]) params.set("set", setCodes[0]);
    if (color) params.set("color", color);
    if (language) params.set("language", language);
    if (cardType) params.set("type", cardType);
    if (minPrice) params.set("minPrice", minPrice);
    if (maxPrice) params.set("maxPrice", maxPrice);
    if (foilOnly) params.set("foil", "true");
    if (reservedOnly) params.set("reserved", "true");

    fetch(`/api/cards?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load the catalogue");
        return (await response.json()) as CatalogResponse;
      })
      .then((result) => {
        setData(result);
        setError("");
      })
      .catch((fetchError: Error) => {
        if (fetchError.name !== "AbortError") setError(fetchError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [
    debouncedQuery,
    rarity,
    setCodes,
    color,
    language,
    cardType,
    minPrice,
    maxPrice,
    foilOnly,
    reservedOnly,
    sort,
    page,
  ]);

  useEffect(() => {
    if (!filtersOpen) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = filterButton.current;
    document.body.style.overflow = "hidden";
    filterClose.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
      if (event.key === "Tab") {
        const focusable = filterSheet.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [filtersOpen]);

  const pageRange = useMemo(() => {
    const start = Math.max(1, page - 2);
    const end = Math.min(data.totalPages, start + 4);
    return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
  }, [page, data.totalPages]);

  const openFilters = () => {
    setDraftFilters({
      rarity,
      setCodes,
      color,
      language,
      cardType,
      minPrice,
      maxPrice,
      foilOnly,
      reservedOnly,
      sort,
    });
    setFiltersOpen(true);
  };

  const applyFilters = () => {
    setLoading(true);
    setRarity(draftFilters.rarity);
    setSetCodes(draftFilters.setCodes);
    setColor(draftFilters.color);
    setLanguage(draftFilters.language);
    setCardType(draftFilters.cardType);
    setMinPrice(draftFilters.minPrice);
    setMaxPrice(draftFilters.maxPrice);
    setFoilOnly(draftFilters.foilOnly);
    setReservedOnly(draftFilters.reservedOnly);
    setSort(draftFilters.sort);
    setPage(1);
    setFiltersOpen(false);
  };

  const clearFilters = () => {
    const cleared = {
      rarity: "",
      setCodes: [] as string[],
      color: "",
      language: "",
      cardType: "",
      minPrice: "",
      maxPrice: "",
      foilOnly: false,
      reservedOnly: false,
      sort: "price_desc",
    };
    setDraftFilters(cleared);
    setLoading(true);
    setRarity("");
    setSetCodes([]);
    setColor("");
    setLanguage("");
    setCardType("");
    setMinPrice("");
    setMaxPrice("");
    setFoilOnly(false);
    setReservedOnly(false);
    setSort("price_desc");
    setPage(1);
  };

  const activeFilters = [
    rarity && { key: "rarity", label: `${t("Rarity")}: ${rarity}` },
    setCodes[0] && { key: "setCodes", label: `${es ? "Edición" : "Set"}: ${setCodes[0].toUpperCase()}` },
    color && { key: "color", label: `${es ? "Color" : "Colour"}: ${color}` },
    language && { key: "language", label: `${es ? "Idioma" : "Language"}: ${language.toUpperCase()}` },
    cardType && { key: "cardType", label: `${es ? "Tipo" : "Type"}: ${cardType}` },
    minPrice && { key: "minPrice", label: `Min €${minPrice}` },
    maxPrice && { key: "maxPrice", label: `Max €${maxPrice}` },
    foilOnly && { key: "foilOnly", label: "Foil" },
    reservedOnly && { key: "reservedOnly", label: t("Reserved List") },
  ].filter(Boolean) as Array<{ key: string; label: string }>;

  const removeFilter = (key: string) => {
    setLoading(true);
    setPage(1);
    if (key === "rarity") setRarity("");
    if (key === "setCodes") setSetCodes([]);
    if (key === "color") setColor("");
    if (key === "language") setLanguage("");
    if (key === "cardType") setCardType("");
    if (key === "minPrice") setMinPrice("");
    if (key === "maxPrice") setMaxPrice("");
    if (key === "foilOnly") setFoilOnly(false);
    if (key === "reservedOnly") setReservedOnly(false);
  };

  const selectSuggestion = (card: CatalogCard) => {
    setQuery(card.name);
    setDebouncedQuery(card.name);
    openCard(card);
    setSuggestions([]);
    setSearchFocused(false);
    setActiveSuggestion(-1);
  };

  return (
    <main className="inventory-page">
      <header className="inventory-topbar">
        <Link href="/" className="inventory-brand">
          <MagicBrainLogo />
        </Link>
        <div className="inventory-search">
          <Search size={17} />
          <input
            ref={searchInput}
            value={query}
            onChange={(event) => {
              const value = event.target.value;
              setQuery(value);
              setSearchFocused(true);
              if (value.trim().length < 2) {
                setSuggestions([]);
                setActiveSuggestion(-1);
              }
            }}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" && suggestions.length) {
                event.preventDefault();
                setActiveSuggestion((value) =>
                  Math.min(value + 1, suggestions.length - 1),
                );
              }
              if (event.key === "ArrowUp" && suggestions.length) {
                event.preventDefault();
                setActiveSuggestion((value) => Math.max(value - 1, 0));
              }
              if (event.key === "Enter" && activeSuggestion >= 0) {
                event.preventDefault();
                selectSuggestion(suggestions[activeSuggestion]);
              }
              if (event.key === "Escape") {
                setSearchFocused(false);
                setActiveSuggestion(-1);
                searchInput.current?.blur();
              }
            }}
            placeholder={t("Search all 117,000+ cards, sets, or set codes...")}
            role="combobox"
            aria-expanded={searchFocused && query.trim().length >= 2}
            aria-controls="inventory-search-results"
            aria-autocomplete="list"
            autoFocus
          />
          {suggestionsLoading
            ? <LoaderCircle className="spin" size={15} />
            : query && <button onClick={() => {
              setQuery("");
              setSuggestions([]);
              searchInput.current?.focus();
            }} aria-label="Clear search"><X size={15} /></button>}
          {searchFocused && query.trim().length >= 2 && (
            <div
              className="inventory-search-results"
              id="inventory-search-results"
              role="listbox"
            >
              <span className="search-results-label">
                {suggestionsLoading
                  ? es ? "Buscando en todo el catálogo…" : "Searching the full catalogue…"
                  : suggestions.length
                    ? es ? "Mejores coincidencias" : "Best matches"
                    : es ? "Sin coincidencias" : "No matching cards"}
              </span>
              {suggestions.map((card, suggestionIndex) => (
                <button
                  key={card.id}
                  className={suggestionIndex === activeSuggestion ? "active" : ""}
                  role="option"
                  aria-selected={suggestionIndex === activeSuggestion}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveSuggestion(suggestionIndex)}
                  onClick={() => selectSuggestion(card)}
                >
                  {card.imageUrl ? <img src={card.imageUrl} alt="" /> : <span className="search-image-placeholder" />}
                  <span>
                    <strong>{card.name}</strong>
                    <small>{card.setCode.toUpperCase()} · {card.setName}</small>
                  </span>
                  <b>{card.price === null ? "—" : formatCurrency(card.price)}</b>
                </button>
              ))}
              {!suggestionsLoading && (
                <button
                  className="search-all-results"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setSearchFocused(false);
                    setActiveSuggestion(-1);
                  }}
                >
                  <Search size={13} />
                  {es ? `Ver todos los resultados para “${query.trim()}”` : `See all results for “${query.trim()}”`}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="inventory-actions">
          <LanguageToggle />
          <AuthControl compact />
          <Link href="/" className="back-dashboard"><ArrowLeft size={15} /> {t("Dashboard")}</Link>
        </div>
      </header>

      <div className="inventory-content">
        <div className="inventory-heading">
          <div>
            <span className="eyebrow">{reservedOnly ? t("Reserved List") : t("Complete market catalogue")}</span>
            <h1>{reservedOnly ? t("Reserved List market") : t("Card inventory")}</h1>
            <p>
              {loading && !data.total
                ? locale === "es" ? "Conectando con tu base de datos…" : "Connecting to your market database…"
                : `${data.total.toLocaleString(locale === "es" ? "es-ES" : "en-GB")} ${locale === "es" ? "impresiones encontradas" : "printings found"}`}
            </p>
          </div>
          <div className="inventory-freshness"><span /> Live from Railway PostgreSQL</div>
        </div>

        <div className="inventory-mobile-controls">
          <button ref={filterButton} type="button" aria-haspopup="dialog" aria-expanded={filtersOpen} onClick={openFilters}>
            <Filter size={17} />
            {t("Filters")}
            {activeFilters.length > 0 && <span>{activeFilters.length}</span>}
          </button>
          <span>{data.total.toLocaleString(locale === "es" ? "es-ES" : "en-GB")} {es ? "resultados" : "results"}</span>
        </div>
        {activeFilters.length > 0 && (
          <div className="active-filter-chips" aria-label={es ? "Filtros activos" : "Active filters"}>
            {activeFilters.map((filter) => (
              <button key={filter.key} onClick={() => removeFilter(filter.key)}>
                {filter.label}<X size={13} aria-hidden="true" />
                <span className="sr-only">{es ? "Quitar filtro" : "Remove filter"}</span>
              </button>
            ))}
          </div>
        )}

        <div className="inventory-toolbar">
          <div className="filter-label"><Filter size={15} /> {t("Filters")}</div>
          <label>
            {t("Rarity")}
            <select value={rarity} onChange={(event) => { setLoading(true); setRarity(event.target.value); setPage(1); }}>
              {rarityOptions.map((option) => (
                <option value={option} key={option}>{option ? `${option[0].toUpperCase()}${option.slice(1)}` : t("All rarities")}</option>
              ))}
            </select>
          </label>
          <SetSelector
            value={setCodes}
            onChange={(codes) => {
              setLoading(true);
              setSetCodes(codes);
              setPage(1);
            }}
            label={es ? "Edición" : "Set"}
            allLabel={es ? "Todas" : "All sets"}
          />
          <label>
            {locale === "es" ? "Color" : "Colour"}
            <select value={color} onChange={(event) => { setLoading(true); setColor(event.target.value); setPage(1); }}>
              <option value="">{locale === "es" ? "Todos" : "All colours"}</option>
              <option value="W">{locale === "es" ? "Blanco" : "White"}</option>
              <option value="U">{locale === "es" ? "Azul" : "Blue"}</option>
              <option value="B">{locale === "es" ? "Negro" : "Black"}</option>
              <option value="R">{locale === "es" ? "Rojo" : "Red"}</option>
              <option value="G">{locale === "es" ? "Verde" : "Green"}</option>
            </select>
          </label>
          <label>
            {locale === "es" ? "Idioma" : "Language"}
            <select value={language} onChange={(event) => { setLoading(true); setLanguage(event.target.value); setPage(1); }}>
              <option value="">{locale === "es" ? "Todos" : "All languages"}</option>
              <option value="en">English</option><option value="es">Español</option>
              <option value="de">Deutsch</option><option value="fr">Français</option>
              <option value="it">Italiano</option><option value="ja">日本語</option>
            </select>
          </label>
          <label className="compact-filter">
            {locale === "es" ? "Tipo" : "Type"}
            <input value={cardType} onChange={(event) => { setLoading(true); setCardType(event.target.value); setPage(1); }} placeholder="Creature…" />
          </label>
          <label className="compact-filter">
            Min €
            <input value={minPrice} onChange={(event) => { setLoading(true); setMinPrice(event.target.value); setPage(1); }} inputMode="decimal" placeholder="0" />
          </label>
          <label className="compact-filter">
            Max €
            <input value={maxPrice} onChange={(event) => { setLoading(true); setMaxPrice(event.target.value); setPage(1); }} inputMode="decimal" placeholder="∞" />
          </label>
          <button className={foilOnly ? "filter-chip active" : "filter-chip"} onClick={() => { setLoading(true); setFoilOnly(!foilOnly); setPage(1); }}>Foil</button>
          <button className={reservedOnly ? "filter-chip reserved active" : "filter-chip reserved"} onClick={() => { setLoading(true); setReservedOnly(!reservedOnly); setPage(1); }}>{t("Reserved List")}</button>
          <label>
            {t("Sort by")}
            <select value={sort} onChange={(event) => { setLoading(true); setSort(event.target.value); setPage(1); }}>
              <option value="price_desc">{t("Highest price")}</option>
              <option value="price_asc">{t("Lowest price")}</option>
              <option value="change_desc">{t("Biggest 7-day gain")}</option>
              <option value="name_asc">{t("Card name")}</option>
              <option value="release_desc">{t("Newest release")}</option>
            </select>
          </label>
          <span className="results-count"><SlidersHorizontal size={13} /> Page {page.toLocaleString()} of {data.totalPages.toLocaleString()}</span>
        </div>

        {error ? (
          <div className="inventory-error">
            <strong>Catalogue unavailable</strong>
            <p>{error}. Check the Railway database connection and try again.</p>
            <button onClick={() => window.location.reload()}>Retry</button>
          </div>
        ) : (
          <div className={`card-grid ${loading ? "loading" : ""}`}>
            {loading && !data.cards.length
              ? Array.from({ length: 16 }, (_, index) => <div className="card-skeleton" key={index} />)
              : data.cards.map((card) => (
                  <button type="button" className="inventory-card" key={card.id} onClick={() => openCard(card)}>
                    <div className="inventory-image">
                      {card.imageUrl ? <img src={card.imageUrl} alt={card.name} loading="lazy" /> : <div className="image-missing"><BrainCircuit size={28} />No image</div>}
                      <span className={`rarity rarity-${card.rarity}`}>{card.rarity}</span>
                    </div>
                    <div className="inventory-card-copy">
                      <strong title={card.name}>{card.name}</strong>
                      <span>{card.setCode.toUpperCase()} · #{card.collectorNumber}</span>
                      <div>
                        <b>{card.price === null ? "No price" : formatCurrency(card.price)}</b>
                        {card.change7d !== null && (
                          <em className={card.change7d >= 0 ? "up" : "down"}>
                            {card.change7d >= 0 ? "+" : ""}{card.change7d.toFixed(1)}%
                          </em>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
          </div>
        )}

        {!error && data.totalPages > 1 && (
          <nav className="pagination" aria-label="Inventory pages">
            <button disabled={page === 1 || loading} onClick={() => { setLoading(true); setPage((current) => Math.max(1, current - 1)); }}>
              <ChevronLeft size={15} /> {t("Previous")}
            </button>
            <div>
              {pageRange.map((number) => (
                <button key={number} className={number === page ? "active" : ""} onClick={() => { setLoading(true); setPage(number); }}>{number}</button>
              ))}
            </div>
            <button disabled={page === data.totalPages || loading} onClick={() => { setLoading(true); setPage((current) => Math.min(data.totalPages, current + 1)); }}>
              {t("Next")} <ChevronRight size={15} />
            </button>
          </nav>
        )}
      </div>

      {filtersOpen && (
        <div className="mobile-sheet-backdrop inventory-filter-backdrop" onMouseDown={() => setFiltersOpen(false)}>
          <section
            ref={filterSheet}
            className="inventory-filter-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-filter-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mobile-sheet-handle" aria-hidden="true" />
            <header>
              <div>
                <span>{data.total.toLocaleString(locale === "es" ? "es-ES" : "en-GB")} {es ? "resultados" : "results"}</span>
                <h2 id="inventory-filter-title">{t("Filters")}</h2>
              </div>
              <button ref={filterClose} onClick={() => setFiltersOpen(false)} aria-label={es ? "Cerrar filtros" : "Close filters"}><X size={20} /></button>
            </header>
            <div className="inventory-filter-fields">
              <label>{t("Rarity")}<select value={draftFilters.rarity} onChange={(event) => setDraftFilters((current) => ({ ...current, rarity: event.target.value }))}>{rarityOptions.map((option) => <option value={option} key={option}>{option ? `${option[0].toUpperCase()}${option.slice(1)}` : t("All rarities")}</option>)}</select></label>
              <SetSelector
                value={draftFilters.setCodes}
                onChange={(codes) => setDraftFilters((current) => ({ ...current, setCodes: codes }))}
                label={es ? "Edición" : "Set"}
                allLabel={es ? "Todas las ediciones" : "All sets"}
              />
              <label>{es ? "Color" : "Colour"}<select value={draftFilters.color} onChange={(event) => setDraftFilters((current) => ({ ...current, color: event.target.value }))}><option value="">{es ? "Todos" : "All colours"}</option><option value="W">{es ? "Blanco" : "White"}</option><option value="U">{es ? "Azul" : "Blue"}</option><option value="B">{es ? "Negro" : "Black"}</option><option value="R">{es ? "Rojo" : "Red"}</option><option value="G">{es ? "Verde" : "Green"}</option></select></label>
              <label>{es ? "Idioma" : "Language"}<select value={draftFilters.language} onChange={(event) => setDraftFilters((current) => ({ ...current, language: event.target.value }))}><option value="">{es ? "Todos" : "All languages"}</option><option value="en">English</option><option value="es">Español</option><option value="de">Deutsch</option><option value="fr">Français</option><option value="it">Italiano</option><option value="ja">日本語</option></select></label>
              <label>{es ? "Tipo" : "Type"}<input value={draftFilters.cardType} onChange={(event) => setDraftFilters((current) => ({ ...current, cardType: event.target.value }))} placeholder="Creature…" /></label>
              <div className="inventory-price-fields">
                <label>Min €<input value={draftFilters.minPrice} onChange={(event) => setDraftFilters((current) => ({ ...current, minPrice: event.target.value }))} inputMode="decimal" placeholder="0" /></label>
                <label>Max €<input value={draftFilters.maxPrice} onChange={(event) => setDraftFilters((current) => ({ ...current, maxPrice: event.target.value }))} inputMode="decimal" placeholder="∞" /></label>
              </div>
              <label>{t("Sort by")}<select value={draftFilters.sort} onChange={(event) => setDraftFilters((current) => ({ ...current, sort: event.target.value }))}><option value="price_desc">{t("Highest price")}</option><option value="price_asc">{t("Lowest price")}</option><option value="change_desc">{t("Biggest 7-day gain")}</option><option value="name_asc">{t("Card name")}</option><option value="release_desc">{t("Newest release")}</option></select></label>
              <div className="inventory-filter-toggles">
                <button className={draftFilters.foilOnly ? "active" : ""} onClick={() => setDraftFilters((current) => ({ ...current, foilOnly: !current.foilOnly }))}>Foil</button>
                <button className={draftFilters.reservedOnly ? "active reserved" : "reserved"} onClick={() => setDraftFilters((current) => ({ ...current, reservedOnly: !current.reservedOnly }))}>{t("Reserved List")}</button>
              </div>
            </div>
            <footer>
              <button type="button" onClick={clearFilters}>{es ? "Limpiar" : "Clear all"}</button>
              <button type="button" onClick={applyFilters}>{es ? "Aplicar filtros" : "Apply filters"}</button>
            </footer>
          </section>
        </div>
      )}

    </main>
  );
}
