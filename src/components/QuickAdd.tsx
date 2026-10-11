import { useEffect, useRef, useState } from 'react';
import { useFolio } from '../store';
import type { Course, CommitmentType } from '../lib/types';
import { isoAtTime, todayISO } from '../lib/utils';
import { CornerDownLeft } from 'lucide-react';

/**
 * Quick intake — one line files a commitment without leaving the keyboard.
 * Tokens: @code course · #type · due:YYYY-MM-DD|today|tomorrow|+Nd · ~90m · !pin
 *   “PS4 problem set @math211 #assignment due:+7 ~120m”
 */
export function QuickAdd({ courses, autoFocusKey }: { courses: Course[]; autoFocusKey?: string }) {
  const addCommitment = useFolio((s) => s.addCommitment);
  const [value, setValue] = useState('');
  const [flash, setFlash] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFocusKey) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return;
      if (e.key.toLowerCase() === autoFocusKey.toLowerCase()) {
        e.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [autoFocusKey]);

  const parse = () => {
    let rest = value.trim();
    if (!rest) return;
    let courseId: string | undefined;
    let type: CommitmentType = 'assignment';
    let due = todayISO();
    let minutes = 60;
    let pinned = false;

    const courseMatch = rest.match(/@(\w[\w-]*)/i);
    if (courseMatch) {
      const code = courseMatch[1].toLowerCase();
      const c = courses.find((c) => c.code.toLowerCase() === code || c.code.toLowerCase().startsWith(code));
      if (c) courseId = c.id;
      rest = rest.replace(courseMatch[0], '');
    }
    const typeMatch = rest.match(/#(\w+)/);
    if (typeMatch) {
      const t = typeMatch[1].toLowerCase();
      const known: CommitmentType[] = ['assignment', 'exam', 'quiz', 'reading', 'project', 'lab', 'custom'];
      if (known.includes(t as CommitmentType)) type = t as CommitmentType;
      rest = rest.replace(typeMatch[0], '');
    }
    const dueMatch = rest.match(/due:(\S+)/i);
    if (dueMatch) {
      const d = dueMatch[1].toLowerCase();
      if (d === 'today') due = todayISO();
      else if (d === 'tomorrow') due = addDays(todayISO(), 1);
      else if (/^\+(\d+)d?$/.test(d)) due = addDays(todayISO(), Number(d.slice(1).replace('d', '')));
      else if (/^\d{4}-\d{2}-\d{2}$/.test(d)) due = d;
      else if (/^(\d{1,2})\/(\d{1,2})$/.test(d)) {
        const [m, dd] = d.split('/').map(Number);
        const y = new Date().getFullYear();
        const cand = `${y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
        due = cand >= todayISO() ? cand : `${y + 1}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
      }
      rest = rest.replace(dueMatch[0], '');
    }
    const minMatch = rest.match(/~(\d+)\s*m?(?:in)?/i);
    if (minMatch) {
      minutes = Math.max(15, Number(minMatch[1]));
      rest = rest.replace(minMatch[0], '');
    }
    const hourMatch = rest.match(/~(\d+(?:\.\d+)?)h/i);
    if (hourMatch) {
      minutes = Math.max(15, Math.round(Number(hourMatch[1]) * 60));
      rest = rest.replace(hourMatch[0], '');
    }
    if (/!/.test(rest)) pinned = true;
    rest = rest.replace(/!/g, '').replace(/\s+/g, ' ').trim();

    if (!rest) return;
    if (!courseId) {
      setFlash(`needs @course — e.g. @${courses[0]?.code.toLowerCase() ?? 'math211'}`);
      setTimeout(() => setFlash(''), 2600);
      return;
    }

    addCommitment({
      courseId,
      type,
      title: rest,
      dueAt: isoAtTime(due, '23:59'),
      weight: type === 'exam' ? 25 : type === 'project' ? 20 : 10,
      estimatedMinutes: minutes,
      pinned,
    });
    setValue('');
    setFlash(`filed — ${rest}`);
    setTimeout(() => setFlash(''), 2200);
  };

  if (!open) {
    return (
      <button
        className="w-full slip pl-6 pr-4 py-3 text-left group"
        onClick={() => { setOpen(true); requestAnimationFrame(() => inputRef.current?.focus()); }}
      >
        <span className="mono text-[11px] text-[color:var(--color-ink-faint)] group-hover:text-[color:var(--color-ink-soft)] transition-colors">
          {autoFocusKey ? `press ${autoFocusKey.toUpperCase()} — ` : ''}quick file a commitment…
        </span>
      </button>
    );
  }

  return (
    <div className="slip pl-6 pr-3 py-2 flex items-center gap-2">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') parse();
          if (e.key === 'Escape') { setOpen(false); setValue(''); }
        }}
        onBlur={() => { if (!value.trim()) setOpen(false); }}
        placeholder="Title @course #type due:+7 ~90m"
        className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-[color:var(--color-ink-faint)]"
        aria-label="Quick-file a commitment"
      />
      {flash ? (
        <span className="mono text-[10.5px] text-[color:var(--color-ok)]">{flash}</span>
      ) : (
        <span className="mono text-[9.5px] text-[color:var(--color-ink-faint)] hidden sm:block">
          @course #type due: ~min !pin
        </span>
      )}
      <button className="xbtn" onClick={parse} title="File it" aria-label="File commitment">
        <CornerDownLeft size={15} />
      </button>
    </div>
  );
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
