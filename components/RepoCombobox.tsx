"use client";

import { useState, useEffect, useRef, useId } from "react";

export interface RepoComboboxProps {
  value: string;
  onChange: (repo: string) => void;
  suggestions?: string[];
  id?: string;
}

export function RepoCombobox({
  value,
  onChange,
  suggestions = [],
  id,
}: RepoComboboxProps) {
  const [inputText, setInputText] = useState(value);
  const [items, setItems] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchCounterRef = useRef(0);
  const generatedId = useId();

  // Sync inputText when value prop changes externally (e.g. modal re-seeds).
  // Uses the render-time "adjust state on prop change" pattern to avoid a
  // cascading render caused by setState inside useEffect.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setInputText(value);
  }

  // Click-outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleInputChange(text: string) {
    setInputText(text);
    setHighlightedIndex(-1);
    setIsOpen(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = text.trim();
    if (trimmed.length < 2) {
      // Invalidate any in-flight fetch so a slower earlier response can't
      // render results under a query that should now show nothing.
      fetchCounterRef.current++;
      setItems([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const thisRequest = ++fetchCounterRef.current;

    debounceRef.current = setTimeout(() => {
      fetch(`/api/repos?q=${encodeURIComponent(trimmed)}`)
        .then((res) => res.json())
        .then((data: string[]) => {
          if (thisRequest !== fetchCounterRef.current) return;
          setItems(data);
          setIsSearching(false);
        })
        .catch(() => {
          if (thisRequest !== fetchCounterRef.current) return;
          setItems([]);
          setIsSearching(false);
        });
    }, 300);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) return;
    const displayItems =
      inputText.trim().length === 0 ? suggestions : items;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < displayItems.length - 1 ? prev + 1 : prev,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < displayItems.length) {
        select(displayItems[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  }

  function select(repo: string) {
    setInputText(repo);
    onChange(repo);
    setIsOpen(false);
    setHighlightedIndex(-1);
  }

  const displayItems =
    inputText.trim().length === 0 ? suggestions : items;

  // Namespace all DOM ids to this instance so multiple comboboxes (e.g. one
  // per repo-override row) never emit colliding option ids / aria targets.
  const baseId = id ?? generatedId;
  const listboxId = `${baseId}-listbox`;
  const optionId = (i: number) => `${baseId}-option-${i}`;

  return (
    <div ref={containerRef} className="relative flex-1">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-label="Repository"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={
          highlightedIndex >= 0 ? optionId(highlightedIndex) : undefined
        }
        value={inputText}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => {
          setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Search repositories…"
        className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
      />
      {isOpen && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Repository suggestions"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-surface shadow-lg"
        >
          {isSearching && (
            <li className="px-3 py-2 text-sm text-muted">Searching…</li>
          )}
          {!isSearching &&
            displayItems.length === 0 &&
            inputText.trim().length >= 2 && (
              <li className="px-3 py-2 text-sm text-muted">No matches</li>
            )}
          {!isSearching &&
            displayItems.map((repo, i) => (
              <li
                key={repo}
                id={optionId(i)}
                role="option"
                aria-selected={i === highlightedIndex}
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(repo);
                }}
                onMouseEnter={() => setHighlightedIndex(i)}
                className={`flex min-h-[44px] cursor-pointer items-center px-3 py-2 text-sm ${
                  i === highlightedIndex
                    ? "bg-accent/10 text-foreground"
                    : "text-foreground hover:bg-surface"
                }`}
              >
                {repo}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
