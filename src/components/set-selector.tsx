"use client";

import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SetOption } from "@/lib/sets";

type SetSelectorProps = {
  value: string[];
  onChange: (codes: string[]) => void;
  multiple?: boolean;
  label?: string;
  allLabel?: string;
  placeholder?: string;
  className?: string;
};

let cachedOptions: SetOption[] | null = null;
let optionsRequest: Promise<SetOption[]> | null = null;

function loadOptions() {
  if (cachedOptions) return Promise.resolve(cachedOptions);
  if (!optionsRequest) {
    optionsRequest = fetch("/api/sets")
      .then(async (response) => {
        if (!response.ok) throw new Error("Set catalogue unavailable");
        const payload = await response.json() as { sets: SetOption[] };
        cachedOptions = payload.sets;
        return payload.sets;
      })
      .finally(() => {
        optionsRequest = null;
      });
  }
  return optionsRequest;
}

export function SetSelector({
  value,
  onChange,
  multiple = false,
  label = "Set",
  allLabel = "All sets",
  placeholder = "Search sets or codes…",
  className = "",
}: SetSelectorProps) {
  const root = useRef<HTMLDivElement>(null);
  const [options, setOptions] = useState<SetOption[]>(cachedOptions ?? []);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (options.length) return;
    loadOptions().then(setOptions).catch(() => setOptions([]));
  }, [options.length]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  const selected = useMemo(
    () => value
      .map((code) => options.find((option) => option.code === code))
      .filter((option): option is SetOption => Boolean(option)),
    [options, value],
  );
  const normalized = query.trim().toLowerCase();
  const filtered = useMemo(
    () => options
      .filter((option) => !normalized ||
        option.name.toLowerCase().includes(normalized) ||
        option.code.includes(normalized))
      .slice(0, 80),
    [normalized, options],
  );

  const choose = (code: string) => {
    if (!multiple) {
      onChange(code ? [code] : []);
      setOpen(false);
      setQuery("");
      return;
    }
    onChange(
      value.includes(code)
        ? value.filter((selectedCode) => selectedCode !== code)
        : [...value, code],
    );
  };

  return (
    <div className={`set-selector ${className}`} ref={root}>
      <span className="set-selector-label">{label}</span>
      <button
        type="button"
        className="set-selector-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>
          {selected.length === 0
            ? allLabel
            : multiple
              ? `${selected.length} selected`
              : `${selected[0].name} (${selected[0].code.toUpperCase()})`}
        </span>
        <ChevronsUpDown size={13} />
      </button>
      {open && (
        <div className="set-selector-popover">
          <div className="set-selector-search">
            <Search size={13} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={placeholder}
              autoFocus
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear set search">
                <X size={12} />
              </button>
            )}
          </div>
          <div className="set-selector-options" role="listbox" aria-multiselectable={multiple}>
            {!multiple && (
              <button
                type="button"
                role="option"
                aria-selected={value.length === 0}
                onClick={() => choose("")}
              >
                <span><strong>{allLabel}</strong></span>
                {value.length === 0 && <Check size={13} />}
              </button>
            )}
            {filtered.map((option) => (
              <button
                type="button"
                role="option"
                aria-selected={value.includes(option.code)}
                key={option.code}
                onClick={() => choose(option.code)}
              >
                <span>
                  <strong>{option.name}</strong>
                  <small>
                    {option.code.toUpperCase()}
                    {option.releasedAt ? ` · ${option.releasedAt}` : ""}
                    {option.digital ? " · Digital" : ""}
                  </small>
                </span>
                {value.includes(option.code) && <Check size={13} />}
              </button>
            ))}
            {filtered.length === 0 && <p>No matching sets</p>}
          </div>
        </div>
      )}
      {multiple && selected.length > 0 && (
        <div className="set-selector-chips">
          {selected.map((option) => (
            <button
              type="button"
              key={option.code}
              onClick={() => choose(option.code)}
              aria-label={`Remove ${option.name}`}
            >
              {option.code.toUpperCase()} <X size={10} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
