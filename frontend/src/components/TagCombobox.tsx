import { useState, useRef, useEffect, useMemo } from 'react';

interface TagOption {
  name: string;
  color?: string;
}

interface Props {
  options: TagOption[];       // all available tag options (from config or allTags)
  selected: TagOption[];      // currently applied tags
  onToggle: (name: string) => void;
  placeholder?: string;
}

const MAX_VISIBLE = 12;
const DEFAULT_COLOR = '#6366f1';

export default function TagCombobox({
  options,
  selected,
  onToggle,
  placeholder = 'Add tag…',
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedNames = useMemo(() => new Set(selected.map((t) => t.name)), [selected]);

  const { filtered, hiddenCount } = useMemo(() => {
    const q = query.toLowerCase();
    const all = q
      ? options.filter((o) => o.name.toLowerCase().includes(q))
      : options;
    return {
      filtered: all.slice(0, MAX_VISIBLE),
      hiddenCount: Math.max(0, all.length - MAX_VISIBLE),
    };
  }, [options, query]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Selected chips */}
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {selected.map((t) => {
            const c = t.color ?? DEFAULT_COLOR;
            return (
              <span
                key={t.name}
                className="tag-chip tag-chip-removable"
                style={{ background: c + '22', color: c, borderColor: c + '44' }}
                title="Click to remove"
                onMouseDown={(e) => { e.preventDefault(); onToggle(t.name); }}
              >
                {t.name} ×
              </span>
            );
          })}
        </div>
      )}

      {/* Input trigger */}
      <div
        className={`combobox-input-wrap${open ? ' focused' : ''}`}
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          style={{
            border: 'none', outline: 'none', boxShadow: 'none',
            padding: '6px 8px', background: 'transparent', width: '100%', fontSize: 13,
          }}
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="combobox-dropdown">
          {filtered.length === 0 ? (
            <div style={{ padding: '8px 12px', color: 'var(--text-3)', fontSize: 13 }}>
              {query ? `No tag matching "${query}"` : 'No tags configured'}
            </div>
          ) : (
            <>
              {filtered.map((o) => {
                const isSel = selectedNames.has(o.name);
                const c = o.color ?? DEFAULT_COLOR;
                return (
                  <div
                    key={o.name}
                    className={`combobox-option${isSel ? ' selected' : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); onToggle(o.name); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <span
                      style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: c, flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 13, flex: 1 }}>{o.name}</span>
                    {isSel && <span style={{ color: 'var(--brand)', fontSize: 14 }}>✓</span>}
                  </div>
                );
              })}
              {hiddenCount > 0 && (
                <div
                  style={{
                    padding: '6px 12px', color: 'var(--text-3)', fontSize: 12,
                    borderTop: '1px solid var(--border)', fontStyle: 'italic',
                  }}
                >
                  {hiddenCount} more — type to filter
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
