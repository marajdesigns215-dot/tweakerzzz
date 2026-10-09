import { useState } from 'react';
import { matchGame } from '../data/game-profiles';

export function RunningProgramPicker({ programs, selected, onSelect }: { programs: string[]; selected: string; onSelect: (name: string) => void }) {
  const [query, setQuery] = useState('');
  const games = programs.filter(name => matchGame(name).id !== 'generic');
  const [scope, setScope] = useState<'games' | 'all'>(() => games.length ? 'games' : 'all');
  const search = query.trim().toLowerCase();
  const visible = (scope === 'games' ? games : programs).filter(name => {
    const game = matchGame(name);
    return `${name} ${game.id === 'generic' ? '' : game.name}`.toLowerCase().includes(search);
  }).sort((a, b) => Number(matchGame(a).id === 'generic') - Number(matchGame(b).id === 'generic') || a.localeCompare(b));

  return <section className="running-program-picker" aria-label="Choose a running program">
    <label className="field-label">SEARCH RUNNING PROGRAMS<input type="search" placeholder="Search Marvel, Fortnite, or an .exe name…" value={query} onChange={event => setQuery(event.target.value)}/></label>
    <div className="button-row" aria-label="Filter running programs">
      <button type="button" className="button secondary" aria-pressed={scope === 'games'} onClick={() => setScope('games')}>Recognized games ({games.length})</button>
      <button type="button" className="button secondary" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>All programs ({programs.length})</button>
    </div>
    <p className="fine-print" role="status">{visible.length} matching {visible.length === 1 ? 'program' : 'programs'}. Click a row to select it. Scroll inside the list to see more.</p>
    {visible.length > 0 ? <ul className="running-program-results" aria-label="Running program results" tabIndex={0}>
      {visible.map(name => { const game = matchGame(name); return <li key={name}><button type="button" className="running-program-option" aria-label={`Select ${name}`} aria-pressed={name.toLowerCase() === selected.toLowerCase()} onClick={() => onSelect(name)}><strong>{name}</strong><span>{game.id === 'generic' ? 'Other running process' : game.name}</span></button></li>; })}
    </ul> : <p className="callout">{scope === 'games' ? 'No recognized games match. Choose All programs to find other games and applications.' : 'No running programs match. Launch the game, then click Find running programs to refresh this list.'}</p>}
    <p className="fine-print">Other games and applications are available under All programs. Choose the game itself, rather than its launcher. The app checks that your selection is running again when you start recording.</p>
  </section>;
}
