import { useState, useRef, useEffect, useMemo } from 'react';
import { avatarInitials, avatarStyle } from '../utils';

export interface UserOption {
  id: string;
  fullName: string;
  email?: string;
  role?: string;
}

interface Props {
  users: UserOption[];
  selected: UserOption[];
  onChange: (users: UserOption[]) => void;
  placeholder?: string;
  multi?: boolean;
}

const MAX_VISIBLE = 12;

export default function UserCombobox({
  users,
  selected,
  onChange,
  placeholder = 'Search users…',
  multi = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Optimistic local state — updates immediately on click, not waiting for server
  const [localSelected, setLocalSelected] = useState<UserOption[]>(selected);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Stable refs so the event listener never needs to be re-registered
  const localSelectedRef = useRef(localSelected);
  const onChangeRef = useRef(onChange);
  const openRef = useRef(open);
  useEffect(() => { localSelectedRef.current = localSelected; }, [localSelected]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { openRef.current = open; }, [open]);

  // When server data arrives and dropdown is closed, sync local state
  useEffect(() => {
    if (!openRef.current) {
      setLocalSelected(selected);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const { filtered, hiddenCount } = useMemo(() => {
    const q = query.toLowerCase();
    const all = q
      ? users.filter(
          (u) =>
            u.fullName.toLowerCase().includes(q) ||
            (u.email ?? '').toLowerCase().includes(q),
        )
      : users;
    return {
      filtered: all.slice(0, MAX_VISIBLE),
      hiddenCount: Math.max(0, all.length - MAX_VISIBLE),
    };
  }, [users, query]);

  function toggle(u: UserOption) {
    if (multi) {
      const exists = localSelected.some((s) => s.id === u.id);
      const next = exists
        ? localSelected.filter((s) => s.id !== u.id)
        : [...localSelected, u];
      setLocalSelected(next);
      onChange(next);
    } else {
      const next = localSelected[0]?.id === u.id ? [] : [u];
      setLocalSelected(next);
      onChange(next);
      setOpen(false);
      setQuery('');
    }
  }

  function remove(id: string) {
    const next = localSelected.filter((s) => s.id !== id);
    setLocalSelected(next);
    onChange(next);
  }

  // Register once — reads latest values through refs
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
      {/* Selected chips (multi) */}
      {multi && localSelected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {localSelected.map((u) => (
            <span key={u.id} className="user-chip">
              <span className="avatar avatar-sm" style={avatarStyle(u.fullName)}>
                {avatarInitials(u.fullName)}
              </span>
              <span style={{ fontSize: 12, fontWeight: 500 }}>{u.fullName}</span>
              <button
                type="button"
                className="user-chip-remove"
                onMouseDown={(e) => { e.preventDefault(); remove(u.id); }}
                title="Remove"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input trigger */}
      <div
        className={`combobox-input-wrap${open ? ' focused' : ''}`}
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        {!multi && localSelected.length > 0 && !open ? (
          <div className="user-cell" style={{ padding: '4px 6px', cursor: 'pointer', minHeight: 34 }}>
            <span className="avatar avatar-sm" style={avatarStyle(localSelected[0].fullName)}>
              {avatarInitials(localSelected[0].fullName)}
            </span>
            <span style={{ fontSize: 13 }}>{localSelected[0].fullName}</span>
          </div>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={localSelected.length === 0 || multi ? placeholder : ''}
            style={{
              border: 'none', outline: 'none', boxShadow: 'none',
              padding: '6px 8px', background: 'transparent', width: '100%', fontSize: 13,
            }}
          />
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="combobox-dropdown">
          {filtered.length === 0 ? (
            <div style={{ padding: '8px 12px', color: 'var(--text-3)', fontSize: 13 }}>
              No users found
            </div>
          ) : (
            <>
              {filtered.map((u) => {
                const isSel = localSelected.some((s) => s.id === u.id);
                return (
                  <div
                    key={u.id}
                    className={`combobox-option${isSel ? ' selected' : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); toggle(u); }}
                  >
                    <span className="avatar avatar-sm" style={avatarStyle(u.fullName)}>
                      {avatarInitials(u.fullName)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{u.fullName}</div>
                      {u.email && (
                        <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{u.email}</div>
                      )}
                    </div>
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
