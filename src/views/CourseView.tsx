import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useFolio, selectCourseCommitments, selectLinksFor } from '../store';
import { Field, FInput, FSelect } from '../components/Field';
import { Stamp } from '../components/Stamp';
import { QuickAdd } from '../components/QuickAdd';
import { courseColorVar } from '../lib/colors';
import { estimateRatio, remainingMinutes, reversePlan } from '../lib/schedule';
import { resourceDeepLink, appBadge } from '../lib/links';
import {
  fmtMinutes,
  stampDate,
  todayISO,
  isoAtTime,
  cn,
} from '../lib/utils';
import type { CommitmentType, LinkedApp } from '../lib/types';
import { ExternalLink, Link2, Pin, X } from 'lucide-react';

/**
 * Course dossier — the single-course source of truth: every commitment, the
 * resource links stapled to them, grade position, and planned-vs-actual effort
 * calibration.
 */
export function CourseView({ courseId, onInspect }: { courseId: string; onInspect: (id: string) => void }) {
  const s = useFolio();
  const course = s.courses[courseId];
  const commitments = useFolio(useShallow((st) => selectCourseCommitments(st, courseId)));
  const links = useFolio(useShallow((st) => selectLinksFor(st, undefined, courseId)));
  const [adding, setAdding] = useState(false);
  const [linking, setLinking] = useState(false);

  const blocks = useMemo(
    () => Object.values(s.blocks).filter((b) => commitments.some((c) => c.id === b.commitmentId)),
    [s.blocks, commitments],
  );

  const ratio = useMemo(
    () => estimateRatio(Object.values(s.blocks), courseId, s.commitments),
    [s.blocks, courseId, s.commitments],
  );

  if (!course) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <p className="slab text-lg text-[color:var(--color-ink-soft)]">This dossier is empty — the course may have been removed.</p>
      </div>
    );
  }

  const open = commitments.filter((c) => c.status === 'open');
  const done = commitments.filter((c) => c.status === 'done');
  const remainMin = open.reduce((sum, c) => sum + remainingMinutes(c), 0);
  const plannedMin = blocks.reduce((sum, b) => sum + b.plannedMinutes, 0);
  const actualMin = blocks.reduce((sum, b) => sum + (b.actualMinutes ?? 0), 0);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      {/* dossier cover */}
      <div className="relative pl-5">
        <span
          className="absolute left-0 top-1 bottom-1 w-[10px] rounded-[2px]"
          style={{ background: courseColorVar(course.color) }}
          aria-hidden
        />
        <div className="kicker mb-1">COURSE DOSSIER</div>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="slab text-[30px] font-semibold leading-none">
              <span className="mono text-[15px] font-semibold tracking-[0.08em] align-middle mr-2 text-[color:var(--color-ink-soft)]">
                {course.code}
              </span>
              {course.name}
            </h1>
            <p className="text-[13px] text-[color:var(--color-ink-soft)] mt-1.5">
              {[course.instructor, course.meetingPattern].filter(Boolean).join(' · ')}
              {course.targetGrade && ` · target ${course.targetGrade}`}
            </p>
          </div>
          <Stamp text={course.archived ? 'WITHDRAWN' : 'ACTIVE'} tone={course.archived ? 'ink' : 'ok'} className="mt-2" />
        </div>
      </div>

      {/* effort ledger */}
      <section className="mt-6 grid grid-cols-3 gap-3" aria-label="Effort ledger">
        {[
          { k: 'Remaining', v: fmtMinutes(remainMin) },
          { k: 'Planned', v: fmtMinutes(plannedMin) },
          { k: 'Logged', v: fmtMinutes(actualMin) },
        ].map((m) => (
          <div key={m.k} className="slip !shadow-none pl-4 pr-3 py-2.5">
            <div className="kicker !text-[9px]">{m.k}</div>
            <div className="mono text-[19px] font-semibold mt-0.5">{m.v}</div>
          </div>
        ))}
      </section>
      {ratio != null && (
        <p className="mono text-[11px] text-[color:var(--color-ink-soft)] mt-2 pl-1">
          Calibration: estimates run ×{ratio.toFixed(2)} of actual
          {ratio > 1.15 ? ' — plan bigger blocks' : ratio < 0.85 ? ' — estimates are generous' : ' — well calibrated'}
        </p>
      )}

      {/* commitment register */}
      <section className="mt-7" aria-label="Commitments">
        <div className="flex items-center justify-between mb-3">
          <div className="hrule kicker flex-1 mr-4">COMMITMENT REGISTER</div>
          <button className="btn btn--ghost !py-1.5 !px-3" onClick={() => setAdding((a) => !a)}>
            + Commitment
          </button>
        </div>

        <div className="mb-3">
          <QuickAdd courses={[course]} />
        </div>

        {adding && <NewCommitmentForm courseId={courseId} onDone={() => setAdding(false)} />}

        <ol className="space-y-2">
          {open.map((c) => {
            const late = c.dueAt.slice(0, 10) < todayISO();
            return (
              <li key={c.id}>
                <button
                  onClick={() => onInspect(c.id)}
                  className="slip w-full text-left pl-6 pr-4 py-3 flex items-center gap-3 group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="kicker !text-[9px]">{c.type}</span>
                      {c.pinned && <Pin size={11} className="text-[color:var(--color-ink-soft)]" aria-label="Pinned" />}
                      {c.weight > 0 && <span className="mono text-[9.5px] text-[color:var(--color-ink-faint)]">w{c.weight}</span>}
                    </div>
                    <span className="slab text-[16px] font-medium group-hover:underline decoration-1 underline-offset-2">
                      {c.title}
                    </span>
                    <div className="mono text-[10.5px] text-[color:var(--color-ink-faint)] mt-0.5">
                      {fmtMinutes(remainingMinutes(c))} of {fmtMinutes(c.estimatedMinutes)} remain
                    </div>
                  </div>
                  <span className={cn('mono text-[11.5px] font-semibold shrink-0', late && 'text-[color:var(--color-late)]')}>
                    {late ? 'LATE · ' : ''}
                    {stampDate(c.dueAt.slice(0, 10))}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        {open.length === 0 && (
          <p className="text-[12.5px] text-[color:var(--color-ink-faint)] pl-1 py-3">
            Register is clear — file a commitment above.
          </p>
        )}

        {done.length > 0 && (
          <details className="mt-4">
            <summary className="mono text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--color-ink-faint)] cursor-pointer hover:text-[color:var(--color-ink-soft)]">
              Filed away ({done.length})
            </summary>
            <ol className="mt-2 space-y-1.5 opacity-70">
              {done.map((c) => (
                <li key={c.id} className="flex items-center gap-2 pl-2">
                  <Stamp text="DONE" tone="ok" className="!text-[8px]" />
                  <span className="slab text-[13.5px] line-through text-[color:var(--color-ink-soft)]">{c.title}</span>
                  <span className="mono text-[9.5px] text-[color:var(--color-ink-faint)] ml-auto">{stampDate(c.dueAt.slice(0, 10))}</span>
                </li>
              ))}
            </ol>
          </details>
        )}
      </section>

      {/* stapled resources */}
      <section className="mt-8" aria-label="Linked resources">
        <div className="flex items-center justify-between mb-3">
          <div className="hrule kicker flex-1 mr-4">STAPLED RESOURCES</div>
          <button className="btn btn--ghost !py-1.5 !px-3 inline-flex items-center gap-1.5" onClick={() => setLinking((v) => !v)}>
            <Link2 size={12} /> Staple
          </button>
        </div>
        {linking && <LinkForm courseId={courseId} onDone={() => setLinking(false)} />}
        {links.length === 0 && !linking ? (
          <p className="text-[12.5px] text-[color:var(--color-ink-faint)] pl-1">
            Nothing stapled yet — attach Ink notes, Modular AI sources, Flashcards decks, or GradeStack assessments.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {links.map((l) => (
              <li key={l.id} className="slip pl-6 pr-3 py-2 flex items-center gap-2.5">
                <span className="mono text-[9px] font-semibold tracking-[0.1em] border border-[color:var(--color-rule-dark)] rounded-[2px] px-1 py-0.5 text-[color:var(--color-ink-soft)]">
                  {appBadge(l.app)}
                </span>
                <a
                  href={l.deepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="slab text-[14px] hover:underline decoration-1 underline-offset-2 flex items-center gap-1 min-w-0 truncate"
                >
                  {l.label} <ExternalLink size={11} className="shrink-0 text-[color:var(--color-ink-faint)]" />
                </a>
                <button className="xbtn ml-auto" onClick={() => s.removeLink(l.id)} aria-label={`Remove ${l.label}`}>
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function NewCommitmentForm({ courseId, onDone }: { courseId: string; onDone: () => void }) {
  const s = useFolio();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<CommitmentType>('assignment');
  const [due, setDue] = useState(todayISO());
  const [weight, setWeight] = useState(10);
  const [minutes, setMinutes] = useState(60);
  const [plan, setPlan] = useState(true);

  const file = () => {
    if (!title.trim()) return;
    const c = s.addCommitment({
      courseId,
      type,
      title: title.trim(),
      dueAt: isoAtTime(due, '23:59'),
      weight,
      estimatedMinutes: Math.max(15, minutes),
    });
    if (plan) {
      const proposals = reversePlan(c, {
        today: todayISO(),
        startTime: s.settings.studyWindowStart,
        maxBlock: s.settings.maxBlockMinutes,
      });
      if (proposals.length) s.acceptProposals(proposals);
    }
    onDone();
  };

  return (
    <form
      className="slip pl-6 pr-4 py-4 mb-3 animate-[slip-in_0.3s_cubic-bezier(0.22,0.9,0.3,1)_both]"
      onSubmit={(e) => { e.preventDefault(); file(); }}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Title" className="col-span-2 sm:col-span-4">
          <FInput autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Problem set 4" />
        </Field>
        <Field label="Type">
          <FSelect value={type} onChange={(e) => setType(e.target.value as CommitmentType)}>
            {(['assignment', 'exam', 'quiz', 'reading', 'project', 'lab', 'custom'] as const).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </FSelect>
        </Field>
        <Field label="Due">
          <FInput type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Weight" hint="grade pts">
          <FInput type="number" min={0} max={100} value={weight} onChange={(e) => setWeight(Number(e.target.value) || 0)} className="mono" />
        </Field>
        <Field label="Est. effort" hint="minutes">
          <FInput type="number" min={15} step={15} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 15)} className="mono" />
        </Field>
      </div>
      <label className="mt-3 flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={plan} onChange={(e) => setPlan(e.target.checked)} className="accent-[#33302a]" />
        <span className="text-[12.5px] text-[color:var(--color-ink-soft)]">
          Reverse-plan into work blocks (review → practice → final check)
        </span>
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn btn--ghost" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn">File commitment</button>
      </div>
    </form>
  );
}

function LinkForm({ courseId, commitmentId, onDone }: { courseId?: string; commitmentId?: string; onDone: () => void }) {
  const s = useFolio();
  const [app, setApp] = useState<LinkedApp>('ink');
  const [label, setLabel] = useState('');
  const [resource, setResource] = useState('');

  const file = () => {
    if (!label.trim() || !resource.trim()) return;
    const deepLink = resource.startsWith('http') ? resource : resourceDeepLink(app, resource.trim(), s.settings);
    s.addLink({
      courseId,
      commitmentId,
      app,
      resourceType: 'note',
      resourceId: resource.trim(),
      label: label.trim(),
      deepLink,
    });
    onDone();
  };

  return (
    <form className="slip pl-6 pr-4 py-3.5 mb-3" onSubmit={(e) => { e.preventDefault(); file(); }}>
      <div className="grid grid-cols-[110px_1fr_1fr] gap-2.5 items-end">
        <Field label="App">
          <FSelect value={app} onChange={(e) => setApp(e.target.value as LinkedApp)}>
            <option value="ink">Ink</option>
            <option value="modular">Modular AI</option>
            <option value="flashcards">Flashcards</option>
            <option value="gradestack">GradeStack</option>
            <option value="other">Other</option>
          </FSelect>
        </Field>
        <Field label="Label">
          <FInput autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ch. 4 notes" />
        </Field>
        <Field label="Resource id or URL">
          <FInput value={resource} onChange={(e) => setResource(e.target.value)} placeholder="note_abc or https://…" className="mono text-[12px]" />
        </Field>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="btn btn--ghost !py-1.5" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn !py-1.5">Staple</button>
      </div>
    </form>
  );
}

export { LinkForm };
