import {
  painWord,
  BODY_AREAS,
  BODY_MAP_VIEWBOX,
  BODY_SHAPES,
  type BodyArea,
  CONDITIONS,
  isUrgentMedical,
  type LangCode,
  localized,
  type MedicalReport,
  emptyMedicalReport,
  translator,
  SYMPTOMS,
} from '@hearme/shared';
import { Check, ChevronLeft, HeartPulse } from 'lucide-react';
import { useState } from 'react';

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

const PAIN_COLORS = ['#1E9E6A', '#4FAF5A', '#8CBF4A', '#C2C43C', '#E3B52E', '#EF9A2B', '#EF7B2B', '#EA5A2E', '#D9402F', '#C2302F', '#A31F2B'];

/** Care Mode on the seatback: tap where it hurts, how much, and anything else. */
export function CareScreen({ lang, onBack, onSend }: { lang: LangCode; onBack: () => void; onSend: (report: MedicalReport) => void }) {
  const tr = translator(lang);
  const [r, setR] = useState<MedicalReport>(emptyMedicalReport);
  const set = (patch: Partial<MedicalReport>) => setR((x) => ({ ...x, ...patch }));
  const areaLabel = (a: BodyArea) => localized(BODY_AREAS.find((x) => x.id === a)!.label, lang);
  const urgent = isUrgentMedical(r);
  return (
    <section className="ife-care">
      <h1 tabIndex={-1} className="ife-h1">
        <HeartPulse aria-hidden /> {tr('care.title')}
      </h1>
      <div className="ife-care__grid">
        <div className="ife-care__body">
          <h2>{tr('care.where')}</h2>
          <svg viewBox={`0 0 ${BODY_MAP_VIEWBOX.width} ${BODY_MAP_VIEWBOX.height}`} role="group" aria-label={tr('care.where')}>
            {BODY_SHAPES.map((s, i) => {
              const on = r.areas.includes(s.area);
              const props = {
                className: `ife-care__part${on ? ' on' : ''}`,
                role: 'checkbox',
                'aria-checked': on,
                'aria-label': areaLabel(s.area),
                tabIndex: 0,
                onClick: () => set({ areas: toggle(r.areas, s.area) }),
                onKeyDown: (e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), set({ areas: toggle(r.areas, s.area) })),
              };
              return s.kind === 'circle' ? <circle key={i} {...props} cx={s.cx} cy={s.cy} r={s.r} /> : <rect key={i} {...props} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} />;
            })}
          </svg>
          <button className={`ife-toggle${r.areas.includes('back') ? ' on' : ''}`} aria-pressed={r.areas.includes('back')} onClick={() => set({ areas: toggle(r.areas, 'back') })}>
            {r.areas.includes('back') && <Check aria-hidden />} {tr('care.myBack')}
          </button>
          {r.areas.length > 0 && <p className="ife-care__chosen">{r.areas.map(areaLabel).join(' · ')}</p>}
        </div>
        <div className="ife-care__side">
          <h2>{tr('care.pain')}</h2>
          <div className="ife-care__pain" role="radiogroup" aria-label={tr('care.pain')}>
            {PAIN_COLORS.map((c, n) => (
              <button key={n} role="radio" aria-checked={r.pain === n} className={r.pain === n ? 'on' : ''} style={{ ['--pain' as string]: c }} onClick={() => set({ pain: r.pain === n ? null : n })}>
                {n}
              </button>
            ))}
          </div>
          <p className="ife-care__painword">{r.pain === null ? tr('care.notRated') : `${r.pain}/10 · ${painWord(r.pain, lang)}`}</p>
          <h2>{tr('care.symptoms')}</h2>
          <div className="ife-care__chips">
            {SYMPTOMS.map((s) => (
              <button key={s.id} className={`ife-toggle${r.symptoms.includes(s.id) ? ' on' : ''}`} aria-pressed={r.symptoms.includes(s.id)} onClick={() => set({ symptoms: toggle(r.symptoms, s.id) })}>
                {r.symptoms.includes(s.id) && <Check aria-hidden />} {localized(s.label, lang)}
              </button>
            ))}
          </div>
          <h2>{tr('care.conditions')}</h2>
          <div className="ife-care__chips">
            {CONDITIONS.map((c) => (
              <button key={c.id} className={`ife-toggle${r.conditions.includes(c.id) ? ' on' : ''}`} aria-pressed={r.conditions.includes(c.id)} onClick={() => set({ conditions: toggle(r.conditions, c.id) })}>
                {r.conditions.includes(c.id) && <Check aria-hidden />} {localized(c.label, lang)}
              </button>
            ))}
          </div>
        </div>
      </div>
      {urgent && (
        <p className="ife-care__urgent" role="status">
          {tr('care.urgent')}
        </p>
      )}
      <div className="ife-review__actions">
        <button className="ife-btn ife-btn--ghost" onClick={onBack}>
          <ChevronLeft aria-hidden /> {tr('common.back')}
        </button>
        <button className="ife-btn ife-btn--primary ife-btn--hero" onClick={() => onSend(r)}>
          {tr('care.send')}
        </button>
      </div>
    </section>
  );
}
