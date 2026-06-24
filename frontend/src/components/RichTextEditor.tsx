import { useEditor, EditorContent, ReactRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Mention from '@tiptap/extension-mention';
import { useRef, useState, useEffect, useCallback } from 'react';

export interface MentionUser { id: string; fullName: string; }

interface ToolbarBtnProps {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}

function TB({ onClick, active, title, children, disabled }: ToolbarBtnProps) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={`rte-btn${active ? ' active' : ''}`}
    >
      {children}
    </button>
  );
}

interface MentionListProps {
  items: MentionUser[];
  command: (item: { id: string; label: string }) => void;
}

function MentionList({ items, command }: MentionListProps) {
  const [selected, setSelected] = useState(0);

  useEffect(() => { setSelected(0); }, [items]);

  if (items.length === 0) return null;

  return (
    <div className="mention-list">
      {items.map((u, i) => (
        <div
          key={u.id}
          className={`mention-item${i === selected ? ' selected' : ''}`}
          onMouseDown={(e) => { e.preventDefault(); command({ id: u.id, label: u.fullName }); }}
          onMouseEnter={() => setSelected(i)}
        >
          @{u.fullName}
        </div>
      ))}
    </div>
  );
}

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  mentionUsers?: MentionUser[];
  minHeight?: number;
  className?: string;
}

export default function RichTextEditor({ value, onChange, placeholder = 'Write something…', mentionUsers = [], minHeight = 120, className }: Props) {
  const mentionUsersRef = useRef(mentionUsers);
  useEffect(() => { mentionUsersRef.current = mentionUsers; }, [mentionUsers]);

  // Track mention popup
  const [mentionPopup, setMentionPopup] = useState<{
    items: MentionUser[];
    pos: { top: number; left: number };
    command: (item: { id: string; label: string }) => void;
  } | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: { HTMLAttributes: { class: 'rte-code-block' } } }),
      Underline,
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
      Image.configure({ inline: false }),
      Placeholder.configure({ placeholder }),
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        suggestion: {
          items: ({ query }: { query: string }) =>
            mentionUsersRef.current
              .filter((u) => u.fullName.toLowerCase().includes(query.toLowerCase()))
              .slice(0, 6),
          render: () => {
            let currentCommand: ((item: { id: string; label: string }) => void) | null = null;
            return {
              onStart: (props: any) => {
                currentCommand = props.command;
                const rect = props.clientRect?.();
                if (!rect) return;
                setMentionPopup({
                  items: props.items,
                  pos: { top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX },
                  command: props.command,
                });
              },
              onUpdate: (props: any) => {
                currentCommand = props.command;
                const rect = props.clientRect?.();
                if (!rect) return;
                setMentionPopup({
                  items: props.items,
                  pos: { top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX },
                  command: props.command,
                });
              },
              onKeyDown: () => false,
              onExit: () => { setMentionPopup(null); currentCommand = null; },
            };
          },
        },
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // Sync external value changes (e.g. clear on submit)
  const prevValue = useRef(value);
  useEffect(() => {
    if (editor && value !== prevValue.current && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
    prevValue.current = value;
  }, [value, editor]);

  function setLink() {
    const prev = editor?.getAttributes('link').href ?? '';
    const url = window.prompt('Enter URL', prev);
    if (url === null) return;
    if (url === '') { editor?.chain().focus().extendMarkRange('link').unsetLink().run(); return; }
    editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }

  if (!editor) return null;

  return (
    <div className={`rte-wrap${className ? ` ${className}` : ''}`}>
      {/* Toolbar */}
      <div className="rte-toolbar">
        <TB onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold (Ctrl+B)"><b>B</b></TB>
        <TB onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic (Ctrl+I)"><i>I</i></TB>
        <TB onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline (Ctrl+U)"><u>U</u></TB>
        <TB onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough"><s>S</s></TB>
        <div className="rte-divider" />
        <TB onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">H2</TB>
        <TB onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Heading 3">H3</TB>
        <div className="rte-divider" />
        <TB onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor"/><circle cx="4" cy="12" r="1.5" fill="currentColor"/><circle cx="4" cy="18" r="1.5" fill="currentColor"/></svg>
        </TB>
        <TB onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered list">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="2" y="8" fontSize="8" fill="currentColor" stroke="none">1.</text><text x="2" y="14" fontSize="8" fill="currentColor" stroke="none">2.</text></svg>
        </TB>
        <TB onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Blockquote">❝</TB>
        <div className="rte-divider" />
        <TB onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="Inline code">&lt;/&gt;</TB>
        <TB onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Code block">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        </TB>
        <div className="rte-divider" />
        <TB onClick={setLink} active={editor.isActive('link')} title="Insert link">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        </TB>
      </div>

      {/* Editor */}
      <EditorContent
        editor={editor}
        className="rte-content"
        style={{ minHeight }}
      />

      {/* Mention popup */}
      {mentionPopup && mentionPopup.items.length > 0 && (
        <div
          className="mention-list"
          style={{
            position: 'fixed',
            top: mentionPopup.pos.top,
            left: mentionPopup.pos.left,
            zIndex: 9999,
          }}
        >
          {mentionPopup.items.map((u) => (
            <div
              key={u.id}
              className="mention-item"
              onMouseDown={(e) => { e.preventDefault(); mentionPopup.command({ id: u.id, label: u.fullName }); setMentionPopup(null); }}
            >
              @{u.fullName}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
