import { useState, useRef, useEffect } from 'react';
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

export default function UserCombobox({ users, selected, onChange, placeholder = 'Search users…', multi = true }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = users.filter((u) => {
    const q = query.toLowerCase();
    return (
      u.fullName.toLowerCase().includes(q) ||
      (u.email ?? '').toLowerCase().includes(q)
    );
  });

  function toggle(u: UserOption) {
    if (multi) {
      const exists = selected.some((s) => s.id === u.id);
      onChange(exists ? selected.filter((s) => s.id !== u.id) : [...selected, u]);
    } else {
      onChange(selected[0]?.id === u.id ? [] : [u]);
      setOpen(false);
      setQuery('');
    }
  }

  function remove(id: string) {
    onChange(selected.filter((s) => s.id !== id));
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Selected chips */}
      {multi && selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {selected.map((u) => (
            <span key={u.id} className="user-chip">
              <span className="avatar avatar-sm" style={avatarStyle(u.fullName)}>{avatarInitials(u.fullName)}</span>
              <span style={{ fontSize: 12, fontWeight: 500 }}>{u.fullName}</span>
              <button
                type="button"
                className="user-chip-remove"
                onClick={() => remove(u.id)}
                title="Remove"
              >×</button>
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      <div
        className={`combobox-input-wrap${open ? ' focused' : ''}`}
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        {!multi && selected.length > 0 && !open ? (
          <div className="user-cell" style={{ padding: '4px 6px', cursor: 'pointer', minHeight: 34 }}>
            <span className="avatar avatar-sm" style={avatarStyle(selected[0].fullName)}>{avatarInitials(selected[0].fullName)}</span>
            <span style={{ fontSize: 13 }}>{selected[0].fullName}</span>
          </div>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={selected.length === 0 || multi ? placeholder : ''}
            style={{ border: 'none', outline: 'none', boxShadow: 'none', padding: '6px 8px', background: 'transparent', width: '100%', fontSize: 13 }}
          />
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="combobox-dropdown">
          {filtered.length === 0 ? (
            <div style={{ padding: '8px 12px', color: 'var(--text-3)', fontSize: 13 }}>No users found</div>
          ) : (
            filtered.map((u) => {
              const isSelected = selected.some((s) => s.id === u.id);
              return (
                <div
                  key={u.id}
                  className={`combobox-option${isSelected ? ' selected' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); toggle(u); }}
                >
                  <span className="avatar avatar-sm" style={avatarStyle(u.fullName)}>{avatarInitials(u.fullName)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{u.fullName}</div>
                    {u.email && <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{u.email}</div>}
                  </div>
                  {isSelected && <span style={{ color: 'var(--brand)', fontSize: 14 }}>✓</span>}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
