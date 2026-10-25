import { ANNOUNCEMENTS, DemoCabinLink, type CrewMode, type NetworkCondition } from '@hearme/shared';
import { useEffect, useReducer } from 'react';

/**
 * PROTOTYPE-ONLY controls for presenters. Visually separated from the
 * passenger UI and always labelled as simulation.
 */
export function DemoControls({ link, onClose }: { link: DemoCabinLink; onClose: () => void }) {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => link.onChange(force), [link]);
  const crew = link.simulatedCrew;
  const conditions: { id: NetworkCondition; label: string }[] = [
    { id: 'good', label: 'Good' },
    { id: 'unstable', label: 'Unstable (50% loss)' },
    { id: 'offline', label: 'No cabin network' },
  ];
  const modes: { id: CrewMode; label: string; disabled?: boolean }[] = [
    { id: 'hub', label: link.hubUrl ? 'Cabin hub (real network, every device)' : 'Cabin hub (not running: npm run demo)', disabled: !link.hubUrl },
    { id: 'simulated', label: 'Simulated crew in this browser (auto-replies)' },
    { id: 'console', label: 'Crew console tab in this browser', disabled: !DemoCabinLink.consoleSupported() },
  ];
  return (
    <div className="demo-panel" role="dialog" aria-label="Prototype controls">
      <div className="demo-panel__head">
        <strong>Prototype controls</strong>
        <span className="demo-tag">SIMULATION</span>
        <button className="demo-close" onClick={onClose} aria-label="Close prototype controls">✕</button>
      </div>
      <fieldset>
        <legend>Simulate the cabin network</legend>
        {conditions.map((c) => (
          <label key={c.id} className="demo-radio">
            <input type="radio" name="cond" checked={link.networkCondition === c.id} onChange={() => link.setCondition(c.id)} />
            {c.label}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Crew tablet</legend>
        {modes.map((m) => (
          <label key={m.id} className="demo-radio">
            <input type="radio" name="mode" disabled={m.disabled} checked={link.mode === m.id} onChange={() => link.setMode(m.id)} />
            {m.label}
          </label>
        ))}
        {link.mode === 'console' && (
          <p className="demo-note">
            Open <a href="#/crew" target="_blank" rel="noreferrer">the crew console</a> in another tab. Without it, nobody confirms
            requests — they will stay pending and then fail, as they would in the cabin.
          </p>
        )}
      </fieldset>
      {crew && (
        <fieldset>
          <legend>Simulated crew: send an announcement</legend>
          <div className="demo-buttons">
            {ANNOUNCEMENTS.map((a) => (
              <button key={a.id} onClick={() => crew.announce(a.id)}>
                {a.text.en.split('.')[0]}
              </button>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
